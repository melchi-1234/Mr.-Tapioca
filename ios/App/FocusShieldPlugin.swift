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
        }
        call.resolve(["active": active])
    }

    @objc func stopBlocking(_ call: CAPPluginCall) {
        blockingActive = false
        DeviceActivityCenter().stopMonitoring([DeviceActivityName(SharedSelection.watchdogName)])
        store.shield.applications = nil
        store.shield.applicationCategories = nil
        store.shield.webDomains = nil
        call.resolve()
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
