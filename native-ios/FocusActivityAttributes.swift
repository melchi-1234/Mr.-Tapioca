import Foundation
import ActivityKit

// Shared between the APP (the plugin starts/ends the Live Activity) and the
// FocusWidget extension (which renders it on the Lock Screen / Dynamic Island).
// ⚠️ Add this file to BOTH targets: App AND FocusWidget.
struct FocusActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var startDate: Date   // when this drink's focus began (for the progress bar)
        var endDate: Date     // when the session will complete (drives the countdown)
    }
    var drinkName: String
}
