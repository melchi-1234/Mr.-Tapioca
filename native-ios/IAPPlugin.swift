import Capacitor
import StoreKit
import UIKit

// Real App Store purchases for the premium skins/backgrounds (StoreKit 2).
// The web app calls window.Capacitor.Plugins.IAP.{getProducts,purchase,restore}.
// Non-consumables only; entitlements come from Transaction.currentEntitlements
// so a reinstall/second device restores automatically (plus the explicit
// "Restore purchases" row in Settings that App Review requires).
// Goes in the MAIN App target. Requires the products to exist in
// App Store Connect — see IAP_SETUP.md for the exact product IDs.
@objc(IAPPlugin)
public class IAPPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "IAPPlugin"
    public let jsName = "IAP"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestReview", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openReviewPage", returnType: CAPPluginReturnPromise),
    ]

    @objc func getProducts(_ call: CAPPluginCall) {
        let ids = (call.getArray("ids", String.self)) ?? []
        guard !ids.isEmpty else { call.resolve(["products": []]); return }
        Task {
            do {
                let products = try await Product.products(for: ids)
                let out: [[String: String]] = products.map {
                    ["id": $0.id, "price": $0.displayPrice, "title": $0.displayName]
                }
                call.resolve(["products": out])
            } catch {
                call.reject("getProducts failed: \(error.localizedDescription)")
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { call.reject("missing product id"); return }
        Task { @MainActor in
            do {
                guard let product = try await Product.products(for: [id]).first else {
                    call.reject("unknown product \(id)"); return
                }
                let result = try await product.purchase()
                switch result {
                case .success(let verification):
                    if case .verified(let txn) = verification {
                        await txn.finish()
                        NSLog("🧋IAP purchased \(id)")
                        call.resolve(["state": "purchased", "id": id])
                    } else {
                        NSLog("🧋IAP UNVERIFIED \(id)")
                        call.resolve(["state": "unverified", "id": id])
                    }
                case .userCancelled:
                    call.resolve(["state": "cancelled", "id": id])
                case .pending:   // Ask to Buy / SCA — resolves later via entitlements
                    call.resolve(["state": "pending", "id": id])
                @unknown default:
                    call.resolve(["state": "unknown", "id": id])
                }
            } catch {
                NSLog("🧋IAP purchase FAILED \(error.localizedDescription)")
                call.reject("purchase failed: \(error.localizedDescription)")
            }
        }
    }

    @objc func restore(_ call: CAPPluginCall) {
        Task {
            var owned: [String] = []
            for await entitlement in Transaction.currentEntitlements {
                if case .verified(let txn) = entitlement, txn.revocationDate == nil {
                    owned.append(txn.productID)
                }
            }
            call.resolve(["owned": owned])
        }
    }

    // The system in-app rating sheet. Apple decides whether it actually
    // appears (silently rate-limited to ~3 asks a year), so the web layer
    // fires this at happy moments and never waits on a result.
    @objc func requestReview(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let scene = UIApplication.shared.connectedScenes
                .first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene {
                SKStoreReviewController.requestReview(in: scene)
            }
            call.resolve()
        }
    }

    // Jump to the App Store "write a review" composer for our own listing.
    // Only apps.apple.com URLs are honored so this can't become a generic
    // open-any-URL hole; anything else falls back to our listing.
    @objc func openReviewPage(_ call: CAPPluginCall) {
        let fallback = "https://apps.apple.com/app/id6786023560?action=write-review"
        let requested = call.getString("url") ?? fallback
        let target = URL(string: requested).flatMap { $0.host == "apps.apple.com" ? $0 : nil }
            ?? URL(string: fallback)!
        DispatchQueue.main.async {
            UIApplication.shared.open(target)
            call.resolve()
        }
    }
}
