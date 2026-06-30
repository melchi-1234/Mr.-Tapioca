import DeviceActivity
import ManagedSettings
import FamilyControls

// Optional but recommended: lets blocking survive even if the main app is killed,
// and enables scheduled blocks later. Lives in its own "Device Activity Monitor"
// extension target. For simple start/stop the plugin already applies the shield;
// this re-applies it on interval boundaries as a safety net.
class DeviceActivityMonitorExtension: DeviceActivityMonitor {

    private let store = ManagedSettingsStore()

    override func intervalDidStart(for activity: DeviceActivityName) {
        super.intervalDidStart(for: activity)
        let selection = SharedSelection.load()
        store.shield.applications = selection.applicationTokens.isEmpty ? nil : selection.applicationTokens
        store.shield.applicationCategories = selection.categoryTokens.isEmpty
            ? nil : .specific(selection.categoryTokens)
    }

    override func intervalDidEnd(for activity: DeviceActivityName) {
        super.intervalDidEnd(for: activity)
        store.shield.applications = nil
        store.shield.applicationCategories = nil
    }
}
