import Foundation

// The three numbers the Home Screen widget shows, handed across the App Group.
//
// Deliberately NOT part of SharedSelection.swift, even though both live in the same
// App Group: that file `import FamilyControls`, and the widget extension links only
// SwiftUI and WidgetKit. Importing FamilyControls into the widget to read a streak
// would drag the whole Screen Time stack into a target that has no business with it,
// and it would need the family-controls entitlement to do it.
//
// One JSON blob under one key, on purpose. Three separate defaults keys can be read
// mid-write and render a widget showing today's streak next to yesterday's pearls.
// A single value is either the old one or the new one.
enum SharedStats {
    static let appGroup = "group.com.melchior.mrtapioca"
    static let key = "widgetStats"

    struct Snapshot {
        var streak: Int
        var pearls: Int
        // nil means "we do not know", which is NOT the same as zero. Reward V2 can
        // be enabled but unsynced, and a widget confidently showing "0 min to your
        // next reward" in that state is a promise the app cannot keep.
        var rewardLeftMinutes: Int?
        var updatedAt: Date?

        // A widget keeps rendering its last timeline entry for as long as iOS feels
        // like it, so an unattended phone can sit on a day-old streak. Past this the
        // view shows placeholders rather than a confident wrong number.
        var isStale: Bool {
            guard let updatedAt else { return true }
            return Date().timeIntervalSince(updatedAt) > 36 * 60 * 60
        }
    }

    static func save(streak: Int, pearls: Int, rewardLeftMinutes: Int?) {
        guard let defaults = UserDefaults(suiteName: appGroup) else { return }
        var payload: [String: Any] = [
            "streak": max(0, streak),
            "pearls": max(0, pearls),
            "updatedAt": Date().timeIntervalSince1970,
        ]
        if let rewardLeftMinutes { payload["rewardLeftMinutes"] = max(0, rewardLeftMinutes) }
        guard let data = try? JSONSerialization.data(withJSONObject: payload) else { return }
        defaults.set(data, forKey: key)
    }

    static func load() -> Snapshot {
        guard let defaults = UserDefaults(suiteName: appGroup),
              let data = defaults.data(forKey: key),
              let raw = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return Snapshot(streak: 0, pearls: 0, rewardLeftMinutes: nil, updatedAt: nil) }

        let stamp = raw["updatedAt"] as? Double
        return Snapshot(
            streak: raw["streak"] as? Int ?? 0,
            pearls: raw["pearls"] as? Int ?? 0,
            rewardLeftMinutes: raw["rewardLeftMinutes"] as? Int,
            updatedAt: stamp.map { Date(timeIntervalSince1970: $0) }
        )
    }
}
