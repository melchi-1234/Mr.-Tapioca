import WidgetKit
import SwiftUI

// Entry point of the FocusWidget extension. Replaces the Xcode template's
// generated bundle file. Two widgets ship from here: the focus Live Activity that
// runs during a session, and the static Home Screen widget that is the whole point
// of the app existing on the Home Screen when no session is running.
@main
struct FocusWidgetBundle: WidgetBundle {
    var body: some Widget {
        FocusWidgetLiveActivity()
        FocusStatsWidget()
    }
}
