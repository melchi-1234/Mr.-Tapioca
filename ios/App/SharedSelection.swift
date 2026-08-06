import Foundation
import FamilyControls

// Persists the user's chosen apps (a FamilyActivitySelection) in an App Group so
// the Capacitor plugin AND the Shield/Monitor extensions can all read the same
// list. Add this file to ALL targets (main app + the 3 extensions).
//
// ⚠️ Replace APP_GROUP with the real App Group ID you create in Xcode
//    ("Signing & Capabilities → App Groups → +"). It must be identical in every target.
enum SharedSelection {
    static let appGroup = "group.com.melchior.mrtapioca"
    static let key = "blockedSelection"

    static func save(_ selection: FamilyActivitySelection) {
        guard let defaults = UserDefaults(suiteName: appGroup) else { return }
        if let data = try? JSONEncoder().encode(selection) {
            defaults.set(data, forKey: key)
        }
    }

    static func load() -> FamilyActivitySelection {
        guard let defaults = UserDefaults(suiteName: appGroup),
              let data = defaults.data(forKey: key),
              let selection = try? JSONDecoder().decode(FamilyActivitySelection.self, from: data)
        else { return FamilyActivitySelection() }
        return selection
    }

    // "Shield defeated" flag, set by the DeviceActivityMonitor extension when a
    // supposedly-shielded app accrues real usage mid-session (iOS can let an app
    // through after the user taps "Ignore Limit" on their own Screen Time limit;
    // that exemption is device-level and we can only detect it, not veto it).
    static let defeatedKey = "shieldDefeatedAt"

    // DeviceActivity activity name for the watchdog, shared as a plain string
    // because this file is in every target but not all of them import
    // DeviceActivity. Both sides wrap it in DeviceActivityName(...).
    static let watchdogName = "shieldWatchdog"

    static func markDefeated() {
        UserDefaults(suiteName: appGroup)?.set(Date().timeIntervalSince1970, forKey: defeatedKey)
    }

    static func clearDefeated() {
        UserDefaults(suiteName: appGroup)?.removeObject(forKey: defeatedKey)
    }

    static func defeatedAt() -> Double? {
        guard let defaults = UserDefaults(suiteName: appGroup) else { return nil }
        let t = defaults.double(forKey: defeatedKey)
        return t > 0 ? t : nil
    }
}
