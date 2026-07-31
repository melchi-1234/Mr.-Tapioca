import DeviceActivity
import ManagedSettings
import FamilyControls

// Re-applies the shield on interval boundaries.
//
// NOTE: nothing schedules this yet. No code calls
// DeviceActivityCenter().startMonitoring, so these callbacks never fire today.
// Blocking still survives the app being closed because ManagedSettingsStore
// persists the shield until it is explicitly cleared, so the extension is a
// no-op safety net rather than load-bearing. Kept embedded and entitled so it
// can be scheduled later without changing the bundle layout.
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
