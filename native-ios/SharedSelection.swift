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
}
