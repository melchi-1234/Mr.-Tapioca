import ManagedSettings
import ManagedSettingsUI
import UIKit

// THIS is the screen the user sees when they open a blocked app — the boba
// version of Focus Friend's grey "Restricted" screen. Lives in its own
// "Shield Configuration" extension target.
class ShieldConfigurationExtension: ShieldConfigurationDataSource {

    private func bobaShield() -> ShieldConfiguration {
        let bark = UIColor(red: 0.24, green: 0.13, blue: 0.09, alpha: 1)
        let cream = UIColor(red: 0.99, green: 0.96, blue: 0.92, alpha: 1)
        return ShieldConfiguration(
            backgroundBlurStyle: .systemThinMaterial,
            backgroundColor: cream,
            icon: UIImage(named: "ShieldBoba"),   // add a boba image to this extension's assets
            title: ShieldConfiguration.Label(text: "Stay focused 🧋", color: bark),
            subtitle: ShieldConfiguration.Label(
                text: "Mr. Tapioca is still mixing your drink. This app is locked until you finish your focus session.",
                color: bark.withAlphaComponent(0.7)),
            primaryButtonLabel: ShieldConfiguration.Label(text: "Back to studying", color: .white),
            primaryButtonBackgroundColor: bark
        )
    }

    override func configuration(shielding application: Application) -> ShieldConfiguration { bobaShield() }
    override func configuration(shielding application: Application, in category: ActivityCategory) -> ShieldConfiguration { bobaShield() }
    override func configuration(shielding webDomain: WebDomain) -> ShieldConfiguration { bobaShield() }
    override func configuration(shielding webDomain: WebDomain, in category: ActivityCategory) -> ShieldConfiguration { bobaShield() }
}
