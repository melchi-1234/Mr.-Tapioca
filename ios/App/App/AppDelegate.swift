import UIKit
import Capacitor
import AVFoundation

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Don't steal the user's audio. Our Web Audio engine (SFX + the focus
        // music decks) otherwise makes WKWebView grab a non-mixing playback
        // session on the first tap, which stops whatever they were already
        // playing (Spotify, Apple Music, a podcast) even when in-app music and
        // sounds are off. Configure a MIXABLE session before any web audio can
        // start. .playback keeps our own music audible with the ring switch on
        // silent; .mixWithOthers layers our audio over theirs instead of
        // interrupting it. (If we ever want "turn on app music -> take over
        // Spotify", that needs a JS bridge to drop .mixWithOthers on demand;
        // for now bring-your-own-music just works, which is the reported bug.)
        configureAudioSession()
        // WKWebView (and a media-services reset) can re-assert its own session
        // when web audio actually starts, so re-apply ours on those signals.
        NotificationCenter.default.addObserver(
            self, selector: #selector(configureAudioSession),
            name: AVAudioSession.mediaServicesWereResetNotification, object: nil)
        return true
    }

    @objc func configureAudioSession() {
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, options: [.mixWithOthers])
        } catch {
            // Non-fatal: if this fails the app still works, it just may interrupt
            // other audio. Never let an audio-session error crash launch.
        }
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
        // Re-assert the mixable session in case WKWebView changed the category
        // while we were away, so returning to the app doesn't kill their music.
        configureAudioSession()
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
