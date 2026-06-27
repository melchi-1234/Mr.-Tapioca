import Capacitor
import FamilyControls
import ManagedSettings
import SwiftUI

// The Capacitor plugin the web app calls as window.Capacitor.Plugins.FocusShield.
// Goes in the MAIN app target. Requires the "Family Controls" capability +
// the com.apple.developer.family-controls entitlement on this target.
@objc(FocusShieldPlugin)
public class FocusShieldPlugin: CAPPlugin {

    private let store = ManagedSettingsStore()

    // Ask the user to allow Screen Time control (one-time system prompt).
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

    // Show Apple's system app picker. We never see the chosen apps (privacy) —
    // we just store the opaque selection in the App Group for the shield to use.
    @objc func pickApps(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let presenter = self.bridge?.viewController else {
                call.reject("No view controller to present from")
                return
            }
            let model = PickerModel(initial: SharedSelection.load())
            let view = AppPickerView(model: model) {
                SharedSelection.save(model.selection)
                presenter.dismiss(animated: true) { call.resolve() }
            }
            let host = UIHostingController(rootView: view)
            host.modalPresentationStyle = .formSheet
            presenter.present(host, animated: true)
        }
    }

    // Turn the shield ON for the current focus session.
    @objc func startBlocking(_ call: CAPPluginCall) {
        applyShield(SharedSelection.load())
        call.resolve()
    }

    // Turn the shield OFF (session over / paused / break).
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
    var body: some View {
        NavigationView {
            FamilyActivityPicker(selection: $model.selection)
                .navigationTitle("Apps to block")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done", action: onDone)
                    }
                }
        }
    }
}
