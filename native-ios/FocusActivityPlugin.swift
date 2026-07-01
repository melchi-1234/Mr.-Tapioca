import Capacitor
import ActivityKit

// Lock Screen / Dynamic Island live countdown for a focus session.
// The web app calls window.Capacitor.Plugins.FocusActivity.start({...}) / .stop().
// The countdown + progress bar are timer views that tick on their own, so the
// activity needs NO updates while running — we only start it and end it.
// Goes in the MAIN app target. Requires NSSupportsLiveActivities=YES in Info.plist
// and the FocusWidget extension to render it.
@objc(FocusActivityPlugin)
public class FocusActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FocusActivityPlugin"
    public let jsName = "FocusActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    ]

    @objc func start(_ call: CAPPluginCall) {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            call.resolve(["started": false, "reason": "disabled"])
            return
        }
        let endMs = call.getDouble("endsAt") ?? 0
        let startMs = call.getDouble("startedAt") ?? (Date().timeIntervalSince1970 * 1000)
        let name = call.getString("drinkName") ?? "Focus session"
        let end = Date(timeIntervalSince1970: endMs / 1000)
        let start = min(Date(timeIntervalSince1970: startMs / 1000), Date())
        guard end > Date() else { call.resolve(["started": false, "reason": "past"]); return }

        Task {
            await Self.endAll()   // never stack two activities
            let attrs = FocusActivityAttributes(drinkName: name)
            let state = FocusActivityAttributes.ContentState(startDate: start, endDate: end)
            do {
                _ = try Activity.request(attributes: attrs,
                                         content: .init(state: state, staleDate: end))
                call.resolve(["started": true])
            } catch {
                call.resolve(["started": false, "error": error.localizedDescription])
            }
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        Task { await Self.endAll(); call.resolve() }
    }

    static func endAll() async {
        for activity in Activity<FocusActivityAttributes>.activities {
            await activity.end(activity.content, dismissalPolicy: .immediate)
        }
    }
}
