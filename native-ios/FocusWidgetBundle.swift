import WidgetKit
import SwiftUI

// Entry point of the FocusWidget extension. Replaces the Xcode template's
// generated bundle file — our only widget is the focus Live Activity.
@main
struct FocusWidgetBundle: WidgetBundle {
    var body: some Widget {
        FocusWidgetLiveActivity()
    }
}
