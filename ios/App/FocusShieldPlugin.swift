import Capacitor
import DeviceActivity
import FamilyControls
import ManagedSettings
import SwiftUI

// The Capacitor plugin the web app calls as window.Capacitor.Plugins.FocusShield.
@objc(FocusShieldPlugin)
public class FocusShieldPlugin: CAPPlugin, CAPBridgedPlugin {
    // Capacitor 6 needs these to expose the plugin to JavaScript.
    public let identifier = "FocusShieldPlugin"
    public let jsName = "FocusShield"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pickApps", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startBlocking", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopBlocking", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelAutoUnblock", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
    ]

    private let store = ManagedSettingsStore()

    // True while a focus session wants the shield up; drives the foreground
    // re-assert in load(). In-memory only: if iOS kills the app mid-session,
    // the shield itself persists in ManagedSettingsStore, and the web layer
    // re-calls startBlocking on its periodic re-assert.
    private var blockingActive = false
    private var foregroundObserver: NSObjectProtocol?

    // iOS can silently stop honoring a third-party shield (seen after the user
    // taps "Ignore Limit" on their OWN Screen Time limit for the same app), so
    // re-assert ours whenever the user returns to the app during a session.
    public override func load() {
        foregroundObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.didBecomeActiveNotification,
            object: nil, queue: .main
        ) { [weak self] _ in
            guard let self = self, self.blockingActive else { return }
            self.applyShield(SharedSelection.load())
        }
    }

    deinit {
        if let observer = foregroundObserver {
            NotificationCenter.default.removeObserver(observer)
        }
    }

    // Report whether blocking is READY to use: Screen Time authorized AND the
    // user has picked at least one app/category to shield. The web app uses this
    // to decide whether to nudge the user to set up blocking when they start a
    // focus session.
    @objc func status(_ call: CAPPluginCall) {
        let selection = SharedSelection.load()
        let hasSelection = !(selection.applicationTokens.isEmpty
            && selection.categoryTokens.isEmpty
            && selection.webDomainTokens.isEmpty)
        let authorized = AuthorizationCenter.shared.authorizationStatus == .approved
        var payload: [String: Any] = ["authorized": authorized, "hasSelection": hasSelection]
        // "defeated" = the watchdog saw a shielded app accrue real usage this
        // session, i.e. iOS is letting it through (Ignore Limit exemption).
        payload["defeated"] = SharedSelection.defeatedAt() != nil
        call.resolve(payload)
    }

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        Task {
            do {
                try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
                call.resolve(["granted": true])
            } catch {
                call.resolve(["granted": false, "error": error.localizedDescription])
            }
        }
    }

    // Retains the picker's presentation delegate so an interactive swipe-to-
    // dismiss still settles the Capacitor call (otherwise the JS await hangs
    // forever and the focus session never starts).
    private var pickerDismissDelegate: PickerDismissDelegate?

    @objc func pickApps(_ call: CAPPluginCall) {
        // fresh=true opens the picker EMPTY. ApplicationTokens die silently when
        // the target app is reinstalled or after some iOS updates, and
        // re-confirming a stale selection re-saves the same dead tokens, so the
        // recovery flow must re-pick from scratch to mint live ones.
        let fresh = call.getBool("fresh") ?? false
        DispatchQueue.main.async {
            guard let presenter = self.bridge?.viewController else {
                call.reject("No view controller to present from")
                return
            }
            let model = PickerModel(initial: fresh ? FamilyActivitySelection() : SharedSelection.load())
            // Resolve at most once, whether the user taps Done, taps Cancel, or
            // swipes the sheet away.
            var settled = false
            let finish: () -> Void = {
                if settled { return }
                settled = true
                SharedSelection.save(model.selection)
                call.resolve()
            }
            let view = AppPickerView(model: model,
                onDone: { presenter.dismiss(animated: true) { finish() } },
                onCancel: { presenter.dismiss(animated: true) { finish() } })
            let host = UIHostingController(rootView: view)
            host.modalPresentationStyle = .formSheet
            // Swipe-down / interactive dismissal path.
            let delegate = PickerDismissDelegate { finish() }
            self.pickerDismissDelegate = delegate
            host.presentationController?.delegate = delegate
            presenter.present(host, animated: true)
        }
    }

    @objc func startBlocking(_ call: CAPPluginCall) {
        let selection = SharedSelection.load()
        // "active" is true only if the user actually picked apps/categories to block —
        // the web app uses this to reward focusing WITH the shield up.
        let active = !(selection.applicationTokens.isEmpty
            && selection.categoryTokens.isEmpty
            && selection.webDomainTokens.isEmpty)
        blockingActive = active
        if active {
            applyShield(selection)
            startWatchdog(selection)
            // Schedule the native auto-unblock at the session's end, so the apps
            // free themselves even if the app is closed. Only when a positive
            // future end time is passed: the 5-minute re-assert calls startBlocking
            // with NO endsAt and must leave any live schedule alone.
            if let endMs = call.getDouble("endsAt"), endMs > Date().timeIntervalSince1970 * 1000 {
                scheduleAutoEnd(endMs: endMs)
            }
        }
        call.resolve(["active": active])
    }

    @objc func stopBlocking(_ call: CAPPluginCall) {
        blockingActive = false
        DeviceActivityCenter().stopMonitoring([
            DeviceActivityName(SharedSelection.watchdogName),
            DeviceActivityName(SharedSelection.focusSessionName),
        ])
        store.shield.applications = nil
        store.shield.applicationCategories = nil
        store.shield.webDomains = nil
        call.resolve()
    }

    // Pause keeps the shield UP but must cancel the timed auto-unblock: a paused
    // session is no longer going to end when it said, so the apps must not free
    // themselves at the original end time. beginFocus reschedules on resume.
    @objc func cancelAutoUnblock(_ call: CAPPluginCall) {
        DeviceActivityCenter().stopMonitoring([DeviceActivityName(SharedSelection.focusSessionName)])
        call.resolve()
    }

    // One-shot DeviceActivity whose interval ENDS at the session end. When it ends,
    // the monitor extension's intervalDidEnd fires natively — even with the app
    // closed — and clears the shield. Best-effort: a throw here degrades to today's
    // behaviour (shield lifts on next foreground via completeSession), never worse,
    // so it must never break startBlocking.
    private func scheduleAutoEnd(endMs: Double) {
        let center = DeviceActivityCenter()
        center.stopMonitoring([DeviceActivityName(SharedSelection.focusSessionName)])

        let now = Date()
        let end = Date(timeIntervalSince1970: endMs / 1000)
        // Below the DeviceActivity ~15-minute minimum -> skip (intervalTooShort
        // would throw). Real Custom/Goal cups are always >= 15 min; only dev/Taste
        // sessions land here, and those lift fine on next foreground.
        guard end.timeIntervalSince(now) >= 15 * 60 else { return }

        let cal = Calendar.current
        // 2-min back-pad: makes the interval "ongoing" now (extension arms
        // immediately) AND clears the 15-min minimum with margin on a 15-min cup.
        let start = now.addingTimeInterval(-120)
        let startComps = cal.dateComponents([.hour, .minute, .second], from: start)
        let endComps   = cal.dateComponents([.hour, .minute, .second], from: end)
        // hour/minute/second only: when endComps' time-of-day is earlier than
        // startComps' (a session ending after midnight), DeviceActivitySchedule
        // treats the interval as spanning midnight, like an overnight schedule.
        let schedule = DeviceActivitySchedule(intervalStart: startComps,
                                              intervalEnd: endComps,
                                              repeats: false)
        do {
            try center.startMonitoring(DeviceActivityName(SharedSelection.focusSessionName),
                                       during: schedule)
        } catch {
            NSLog("🧋 focusSession auto-end schedule failed: \(error.localizedDescription)")
        }
    }

    // Usage-threshold watchdog: the only supported way to DETECT "shield set
    // but not enforced". If a shielded app accrues a minute of real usage, the
    // monitor extension flags it in the App Group and the web layer warns the
    // user honestly. Best-effort: a throw here must never break startBlocking.
    private func startWatchdog(_ selection: FamilyActivitySelection) {
        SharedSelection.clearDefeated()
        let center = DeviceActivityCenter()
        center.stopMonitoring([DeviceActivityName(SharedSelection.watchdogName)])
        // Whole-day interval: always over the 15-minute schedule minimum, and
        // "now" is inside it so monitoring starts counting immediately.
        let schedule = DeviceActivitySchedule(
            intervalStart: DateComponents(hour: 0, minute: 0),
            intervalEnd: DateComponents(hour: 23, minute: 59),
            repeats: false)
        let event = DeviceActivityEvent(
            applications: selection.applicationTokens,
            categories: selection.categoryTokens,
            webDomains: [],
            threshold: DateComponents(minute: 1))
        try? center.startMonitoring(DeviceActivityName(SharedSelection.watchdogName),
                                    during: schedule,
                                    events: [DeviceActivityEvent.Name("blockedAppUsed"): event])
    }

    private func applyShield(_ selection: FamilyActivitySelection) {
        // Clear first: writing an unchanged value can be treated as a no-op,
        // and a cleared-then-set value forces the system to re-evaluate the
        // shield (this is what makes the periodic re-asserts meaningful).
        store.shield.applications = nil
        store.shield.applicationCategories = nil
        store.shield.webDomains = nil
        store.shield.applications = selection.applicationTokens.isEmpty ? nil : selection.applicationTokens
        store.shield.applicationCategories = selection.categoryTokens.isEmpty
            ? nil : .specific(selection.categoryTokens)
        store.shield.webDomains = selection.webDomainTokens.isEmpty ? nil : selection.webDomainTokens
    }
}

// Small SwiftUI wrapper so the picker has a "Done" button.
final class PickerModel: ObservableObject {
    @Published var selection: FamilyActivitySelection
    init(initial: FamilyActivitySelection) { self.selection = initial }
}

struct AppPickerView: View {
    @ObservedObject var model: PickerModel
    var onDone: () -> Void
    var onCancel: () -> Void
    var body: some View {
        NavigationView {
            FamilyActivityPicker(selection: $model.selection)
                .navigationTitle("Apps to block")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel", action: onCancel)
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done", action: onDone)
                    }
                }
        }
    }
}

// Fires when the form sheet is dismissed by an interactive swipe (not Done/Cancel),
// so the Capacitor call always settles and the JS await never hangs.
final class PickerDismissDelegate: NSObject, UIAdaptivePresentationControllerDelegate {
    private let onDismiss: () -> Void
    init(onDismiss: @escaping () -> Void) { self.onDismiss = onDismiss }
    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        onDismiss()
    }
}
