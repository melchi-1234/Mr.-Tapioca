import ManagedSettings
import UIKit

// Handles taps on the shield screen's buttons. Lives in its own
// "Shield Action" extension target. "Back to studying" just closes the blocked
// app so the user is bounced back out.
class ShieldActionExtension: ShieldActionDelegate {

    override func handle(action: ShieldAction, for application: ApplicationToken,
                         completionHandler: @escaping (ShieldActionResponse) -> Void) {
        switch action {
        case .primaryButtonPressed: completionHandler(.close)
        case .secondaryButtonPressed: completionHandler(.defer)
        @unknown default: completionHandler(.none)
        }
    }

    override func handle(action: ShieldAction, for webDomain: WebDomainToken,
                         completionHandler: @escaping (ShieldActionResponse) -> Void) {
        completionHandler(action == .primaryButtonPressed ? .close : .none)
    }

    override func handle(action: ShieldAction, for category: ActivityCategoryToken,
                         completionHandler: @escaping (ShieldActionResponse) -> Void) {
        completionHandler(action == .primaryButtonPressed ? .close : .none)
    }
}
