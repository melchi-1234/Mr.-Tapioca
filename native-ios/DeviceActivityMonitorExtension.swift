import DeviceActivity
import ManagedSettings
import FamilyControls

// Two jobs:
// 1. (unscheduled safety net) re-apply the shield on interval boundaries for a
//    hypothetical session activity. Nothing schedules this today; blocking
//    survives app death because ManagedSettingsStore persists the shield.
// 2. (scheduled by FocusShieldPlugin.startWatchdog) the "shieldWatchdog"
//    activity: a usage-threshold event over the blocked apps. If a shielded app
//    accrues a minute of real usage mid-session, iOS is letting it through
//    (e.g. the user tapped "Ignore Limit" on their OWN Screen Time limit for
//    that app, which suppresses third-party shields until midnight). We can't
//    veto that, only detect it and let the app warn honestly.
class DeviceActivityMonitorExtension: DeviceActivityMonitor {

    static let watchdog = DeviceActivityName(SharedSelection.watchdogName)

    private let store = ManagedSettingsStore()

    override func intervalDidStart(for activity: DeviceActivityName) {
        super.intervalDidStart(for: activity)
        // The watchdog only observes usage; it must never touch the shield.
        guard activity != Self.watchdog else { return }
        let selection = SharedSelection.load()
        store.shield.applications = selection.applicationTokens.isEmpty ? nil : selection.applicationTokens
        store.shield.applicationCategories = selection.categoryTokens.isEmpty
            ? nil : .specific(selection.categoryTokens)
    }

    override func intervalDidEnd(for activity: DeviceActivityName) {
        super.intervalDidEnd(for: activity)
        // Without this guard the watchdog's day-interval ending at 23:59 would
        // strip the shield out from under a live late-night session.
        guard activity != Self.watchdog else { return }
        store.shield.applications = nil
        store.shield.applicationCategories = nil
        // Mirror stopBlocking/applyShield: a selection can include websites, and
        // this closed-app auto-unblock is the only teardown path that used to miss
        // them, so blocked sites stayed shielded past session end until the next
        // foreground. Clear them here too.
        store.shield.webDomains = nil
    }

    override func eventDidReachThreshold(_ event: DeviceActivityEvent.Name,
                                         activity: DeviceActivityName) {
        super.eventDidReachThreshold(event, activity: activity)
        if activity == Self.watchdog {
            SharedSelection.markDefeated()
        }
    }
}
