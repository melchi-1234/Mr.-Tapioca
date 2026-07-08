import Capacitor
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
        call.resolve(["authorized": authorized, "hasSelection": hasSelection])
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
        DispatchQueue.main.async {
            guard let presenter = self.bridge?.viewController else {
                call.reject("No view controller to present from")
                return
            }
            let model = PickerModel(initial: SharedSelection.load())
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
        if active { applyShield(selection) }
        call.resolve(["active": active])
    }

    @objc func stopBlocking(_ call: CAPPluginCall) {
        store.shield.applications = nil
        store.shield.applicationCategories = nil
        store.shield.webDomains = nil
        call.resolve()
    }

    private func applyShield(_ selection: FamilyActivitySelection) {
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
