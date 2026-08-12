import UIKit
import Capacitor
import StoreKit

@objc(FantasyHubStoreKitPlugin)
class FantasyHubStoreKitPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "FantasyHubStoreKitPlugin"
    let jsName = "FantasyHubStoreKit"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "products", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "entitlements", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finish", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "manageSubscriptions", returnType: CAPPluginReturnPromise),
    ]

    private let productIds = [
        "com.fantasyhubapp.pro.monthly",
        "com.fantasyhubapp.pro.season",
        "com.fantasyhubapp.pro.annual",
    ]

    private let seasonProductId = "com.fantasyhubapp.pro.season"

    private func validateProduct(_ product: Product) throws {
        guard product.id == seasonProductId else { return }
        guard product.price == Decimal(string: "24.99"),
              product.priceFormatStyle.currencyCode == "USD",
              let period = product.subscription?.subscriptionPeriod,
              period.unit == .month,
              period.value == 6 else {
            throw StoreKitConfigurationError.invalidSeasonProduct
        }
    }

    @objc func products(_ call: CAPPluginCall) {
        Task {
            do {
                let products = try await Product.products(for: productIds)
                call.resolve(["products": products.map { product in
                    var result: [String: Any] = [
                        "id": product.id,
                        "name": product.displayName,
                        "description": product.description,
                        "displayPrice": product.displayPrice,
                    ]
                    if let subscription = product.subscription {
                        result["periodValue"] = subscription.subscriptionPeriod.value
                        result["periodUnit"] = String(describing: subscription.subscriptionPeriod.unit)
                    }
                    return result
                }])
            } catch {
                call.reject("Unable to load App Store products", nil, error)
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId"), productIds.contains(productId) else {
            call.reject("Unknown Fantasy Hub product")
            return
        }
        Task {
            do {
                guard let product = try await Product.products(for: [productId]).first else {
                    call.reject("Product is not available in the App Store")
                    return
                }
                try validateProduct(product)
                let result = try await product.purchase()
                switch result {
                case .success(let verification):
                    switch verification {
                    case .verified(let transaction): call.resolve(transactionPayload(transaction))
                    case .unverified(_, let error): call.reject("The App Store could not verify this purchase", nil, error)
                    }
                case .pending: call.resolve(["status": "pending"])
                case .userCancelled: call.resolve(["status": "cancelled"])
                @unknown default: call.reject("Unknown App Store purchase result")
                }
            } catch {
                call.reject("Purchase could not be completed", nil, error)
            }
        }
    }

    @objc func restore(_ call: CAPPluginCall) {
        Task {
            do {
                try await AppStore.sync()
                var transactions: [[String: Any]] = []
                for await result in Transaction.currentEntitlements {
                    if case .verified(let transaction) = result, productIds.contains(transaction.productID) {
                        transactions.append(transactionPayload(transaction))
                    }
                }
                call.resolve(["transactions": transactions])
            } catch {
                call.reject("Purchases could not be restored", nil, error)
            }
        }
    }

    @objc func entitlements(_ call: CAPPluginCall) {
        Task {
            var transactions: [[String: Any]] = []
            for await result in Transaction.currentEntitlements {
                if case .verified(let transaction) = result, productIds.contains(transaction.productID) {
                    transactions.append(transactionPayload(transaction))
                }
            }
            call.resolve(["transactions": transactions])
        }
    }

    @objc func finish(_ call: CAPPluginCall) {
        guard let transactionId = call.getString("transactionId") else {
            call.reject("Transaction ID is required")
            return
        }
        Task {
            for await result in Transaction.all {
                if case .verified(let transaction) = result, String(transaction.id) == transactionId {
                    await transaction.finish()
                    call.resolve(["finished": true])
                    return
                }
            }
            call.resolve(["finished": false])
        }
    }

    @objc func manageSubscriptions(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene else {
                call.reject("No active app window")
                return
            }
            do {
                try await AppStore.showManageSubscriptions(in: scene)
                call.resolve()
            } catch {
                call.reject("Unable to open App Store subscriptions", nil, error)
            }
        }
    }

    private func transactionPayload(_ transaction: Transaction) -> [String: Any] {
        var payload: [String: Any] = [
            "status": "verified",
            "transactionId": String(transaction.id),
            "originalTransactionId": String(transaction.originalID),
            "productId": transaction.productID,
        ]
        if let expirationDate = transaction.expirationDate {
            payload["expirationDate"] = ISO8601DateFormatter().string(from: expirationDate)
        }
        return payload
    }
}

private enum StoreKitConfigurationError: LocalizedError {
    case invalidSeasonProduct

    var errorDescription: String? {
        "The Fantasy Hub season subscription is temporarily unavailable because its App Store price is not configured as $24.99 USD for six months."
    }
}

class FantasyHubBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(FantasyHubStoreKitPlugin())
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = FantasyHubBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
