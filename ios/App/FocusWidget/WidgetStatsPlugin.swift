import Capacitor
import WidgetKit
import Foundation

// Set by AppDelegate when the app is opened via mrtapioca://start (the Home Screen
// widget's tap target). A widget cannot run code, so a URL is the entire mechanism.
//
// It is a stashed flag rather than a straight notifyListeners call because of cold
// launch ordering: on a launch FROM the widget, the URL arrives before the web view
// exists, so there is nobody listening yet. The flag survives that gap and app.js
// drains it once on boot. On a warm open the notification fires as well, so a
// foregrounded app reacts immediately instead of waiting for the next boot.
public enum WidgetLaunchIntent {
    public static let notification = Notification.Name("MrTapiocaWidgetStart")
    public static var pendingStart = false

    public static func handle(_ url: URL) -> Bool {
        guard url.scheme?.lowercased() == "mrtapioca" else { return false }
        // Accept mrtapioca://start and mrtapioca:///start alike; the host/path split
        // depends on how many slashes end up in the widgetURL.
        let target = (url.host ?? "") + url.path
        guard target.replacingOccurrences(of: "/", with: "") == "start" else { return false }
        pendingStart = true
        NotificationCenter.default.post(name: notification, object: nil)
        return true
    }
}

// The one JS -> native door for Home Screen widget data. app.js calls
// window.Capacitor.Plugins.WidgetStats.update({ streak, pearls, rewardLeftMinutes }).
//
// Goes in the MAIN app target only: it imports Capacitor, which the widget extension
// does not link. It is listed in the FocusWidgetExtension membership exceptions in
// project.pbxproj for exactly that reason, and in LOCAL_PLUGIN_CLASSES in
// tools/register-ios-plugins.mjs, without which Capacitor 6 never instantiates the
// class and window.Capacitor.Plugins.WidgetStats is silently undefined.
@objc(WidgetStatsPlugin)
public class WidgetStatsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WidgetStatsPlugin"
    public let jsName = "WidgetStats"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "consumeLaunchIntent", returnType: CAPPluginReturnPromise),
    ]

    override public func load() {
        NotificationCenter.default.addObserver(
            self, selector: #selector(onWidgetStart), name: WidgetLaunchIntent.notification, object: nil)
    }

    @objc private func onWidgetStart() {
        notifyListeners("widgetStart", data: [:])
    }

    // Drained exactly once. Two things could act on the same tap otherwise: the
    // boot-time poll and the listener, and a session started twice is a session the
    // user did not ask for.
    @objc func consumeLaunchIntent(_ call: CAPPluginCall) {
        let start = WidgetLaunchIntent.pendingStart
        WidgetLaunchIntent.pendingStart = false
        call.resolve(["start": start])
    }

    @objc func update(_ call: CAPPluginCall) {
        // getInt returns nil for an absent key, which is what we want for the reward
        // minutes: the web side sends null when Reward V2 is enabled but unsynced,
        // and "unknown" has to survive the bridge as unknown rather than as 0.
        SharedStats.save(
            streak: call.getInt("streak") ?? 0,
            pearls: call.getInt("pearls") ?? 0,
            rewardLeftMinutes: call.getInt("rewardLeftMinutes")
        )
        // Only this kind. reloadAllTimelines would also churn the Live Activity's
        // configuration for no reason.
        WidgetCenter.shared.reloadTimelines(ofKind: "FocusStats")
        call.resolve()
    }
}
