import ManagedSettings
import ManagedSettingsUI
import UIKit

// The boba "Restricted" screen shown when a blocked app is opened — dark & cozy so
// the blocked app recedes into shadow instead of glowing pale grey.
class ShieldConfigurationExtension: ShieldConfigurationDataSource {

    private func bobaShield() -> ShieldConfiguration {
        let bark = UIColor(red: 0.239, green: 0.129, blue: 0.090, alpha: 1)   // #3d2117
        let cream = UIColor(red: 0.99, green: 0.96, blue: 0.92, alpha: 1)
        let caramel = UIColor(red: 0.85, green: 0.62, blue: 0.36, alpha: 1)
        let espresso = UIColor(red: 0.161, green: 0.086, blue: 0.059, alpha: 1)
        return ShieldConfiguration(
            backgroundBlurStyle: .systemUltraThinMaterialDark,
            backgroundColor: bark.withAlphaComponent(0.92),
            icon: UIImage(named: "ShieldBoba"),
            title: ShieldConfiguration.Label(text: "Stay focused 🧋", color: cream),
            subtitle: ShieldConfiguration.Label(
                text: "Mr. Tapioca is still mixing your drink. This app is locked until you finish your focus session.",
                color: cream.withAlphaComponent(0.75)),
            primaryButtonLabel: ShieldConfiguration.Label(text: "Back to studying", color: espresso),
            primaryButtonBackgroundColor: caramel
        )
    }

    override func configuration(shielding application: Application) -> ShieldConfiguration { bobaShield() }
    override func configuration(shielding application: Application, in category: ActivityCategory) -> ShieldConfiguration { bobaShield() }
    override func configuration(shielding webDomain: WebDomain) -> ShieldConfiguration { bobaShield() }
    override func configuration(shielding webDomain: WebDomain, in category: ActivityCategory) -> ShieldConfiguration { bobaShield() }
}
