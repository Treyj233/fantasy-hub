import UIKit
import AuthenticationServices
import Capacitor
import ClerkKit
import StoreKit
import WebKit

@objc(FantasyHubAppleAuthPlugin)
class FantasyHubAppleAuthPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "FantasyHubAppleAuthPlugin"
    let jsName = "FantasyHubAppleAuth"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signOut", returnType: CAPPluginReturnPromise),
    ]

    private var pendingCall: CAPPluginCall?
    private static let clerkPublishableKey = "pk_test_aW5ub2NlbnQtZmFsY29uLTIwLmNsZXJrLmFjY291bnRzLmRldiQ"

    @objc func signIn(_ call: CAPPluginCall) {
        Task { @MainActor [weak self] in
            await self?.beginSignIn(call)
        }
    }

    @objc func signOut(_ call: CAPPluginCall) {
        Task { @MainActor in
            Clerk.configure(publishableKey: Self.clerkPublishableKey)
            do {
                try await Clerk.shared.auth.signOut()
                call.resolve(["signedOut": true])
            } catch {
                call.reject("Fantasy Hub could not clear the native session", nil, error)
            }
        }
    }

    @MainActor
    private func beginSignIn(_ call: CAPPluginCall) async {
        guard pendingCall == nil else {
            call.reject("Apple sign-in is already in progress")
            return
        }
        guard let window = activePresentationWindow() else {
            call.reject("Fantasy Hub is not ready to present secure sign-in. Please try again.")
            return
        }
        _ = window
        pendingCall = call
        Clerk.configure(publishableKey: Self.clerkPublishableKey)
        defer { finishRequest() }
        do {
            let sessionToken: String
            if let existingToken = try await Clerk.shared.auth.getToken(.init(skipCache: true)) {
                sessionToken = existingToken
            } else {
                _ = try await Clerk.shared.auth.signInWithApple()
                guard let newToken = try await Clerk.shared.auth.getToken(.init(skipCache: true)) else {
                    throw NativeAppleAuthError.missingClerkSession
                }
                sessionToken = newToken
            }
            let nativeSession = try await exchangeForNativeSession(sessionToken)
            try await installNativeSessionCookie(nativeSession)
            call.resolve([
                "authenticated": true,
                "redirect": "/",
            ])
        } catch let authorizationError as ASAuthorizationError where authorizationError.code == .canceled {
            call.resolve(["cancelled": true])
        } catch {
            call.reject("Clerk could not complete Apple sign-in: \(error.localizedDescription)", nil, error)
        }
    }

    private func activePresentationWindow() -> UIWindow? {
        if let window = bridge?.viewController?.viewIfLoaded?.window,
           window.windowScene?.activationState == .foregroundActive {
            return window
        }
        return UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .filter { $0.activationState == .foregroundActive }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow)
    }

    private func finishRequest() {
        pendingCall = nil
    }

    private func exchangeForNativeSession(_ token: String) async throws -> String {
        guard let url = URL(string: "https://fantasyhubapp.com/api/native-auth/exchange") else {
            throw NativeAppleAuthError.exchangeFailed
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200,
              let payload = try? JSONDecoder().decode(NativeAuthExchange.self, from: data),
              !payload.session.isEmpty else {
            throw NativeAppleAuthError.exchangeFailed
        }
        return payload.session
    }

    @MainActor
    private func installNativeSessionCookie(_ session: String) async throws {
        guard let origin = URL(string: "https://fantasyhubapp.com"),
              let cookie = HTTPCookie(properties: [
                .originURL: origin,
                .domain: "fantasyhubapp.com",
                .path: "/",
                .name: "fh_native_session",
                .value: session,
                .secure: "TRUE",
                .init("HttpOnly"): "TRUE",
                .sameSitePolicy: "Lax",
                .expires: Date().addingTimeInterval(60 * 60 * 24 * 30),
              ]),
              let cookieStore = bridge?.webView?.configuration.websiteDataStore.httpCookieStore else {
            throw NativeAppleAuthError.exchangeFailed
        }
        await cookieStore.setCookie(cookie)
    }
}

private struct NativeAuthExchange: Decodable {
    let session: String
}

private enum NativeAppleAuthError: LocalizedError {
    case missingClerkSession
    case exchangeFailed

    var errorDescription: String? {
        switch self {
        case .missingClerkSession: "Clerk did not create a native session."
        case .exchangeFailed: "Fantasy Hub could not initialize the browser session."
        }
    }
}

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
        guard let period = product.subscription?.subscriptionPeriod,
              period.unit == .month,
              period.value == 6 else {
            throw StoreKitConfigurationError.invalidSeasonPeriod
        }
    }

    @objc func products(_ call: CAPPluginCall) {
        Task { @MainActor in
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
        Task { @MainActor in
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
                let fallbackMessage = String(describing: error.localizedDescription)
                call.reject(fallbackMessage, nil, error)
            }
        }
    }

    @objc func restore(_ call: CAPPluginCall) {
        Task { @MainActor in
            do {
                try await AppStore.sync()
                var transactions: [[String: Any]] = []
                for await result in Transaction.currentEntitlements {
                    collectTransaction(result, into: &transactions)
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
                collectTransaction(result, into: &transactions)
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
                let transaction: Transaction?
                switch result {
                case .verified(let verifiedTransaction):
                    transaction = verifiedTransaction
                case .unverified(let unverifiedTransaction, _):
                    transaction = unverifiedTransaction
                @unknown default:
                    transaction = nil
                }
                if let transaction, String(transaction.id) == transactionId {
                    await transaction.finish()
                    call.resolve(["finished": true])
                    return
                }
            }
            call.resolve(["finished": false])
        }
    }

    private func collectTransaction(_ result: VerificationResult<Transaction>, into list: inout [[String: Any]]) {
        let transaction: Transaction?
        var status: String
        switch result {
        case .verified(let verifiedTransaction):
            transaction = verifiedTransaction
            status = "verified"
        case .unverified(let unverifiedTransaction, _):
            transaction = unverifiedTransaction
            status = "unverified"
        @unknown default:
            transaction = nil
            status = "unverified"
        }
        guard let transaction, productIds.contains(transaction.productID) else { return }
        list.append(transactionPayload(transaction, status: status))
    }

    @objc func manageSubscriptions(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard let scene = UIApplication.shared.connectedScenes
                .compactMap({ $0 as? UIWindowScene })
                .first(where: { $0.activationState == .foregroundActive }) else {
                openSubscriptionsFallback(call)
                return
            }
            do {
                try await AppStore.showManageSubscriptions(in: scene)
                call.resolve()
            } catch {
                openSubscriptionsFallback(call)
            }
        }
    }

    @MainActor
    private func openSubscriptionsFallback(_ call: CAPPluginCall) {
        guard let url = URL(string: "https://apps.apple.com/account/subscriptions") else {
            call.reject("Unable to open App Store subscriptions")
            return
        }
        UIApplication.shared.open(url, options: [:]) { opened in
            if opened {
                call.resolve()
            } else {
                call.reject("Unable to open App Store subscriptions")
            }
        }
    }

    private func transactionPayload(_ transaction: Transaction, status: String = "verified") -> [String: Any] {
        var payload: [String: Any] = [
            "status": status,
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
    case invalidSeasonPeriod

    var errorDescription: String? {
        "The Fantasy Hub season subscription is temporarily unavailable because its App Store duration is not configured for six months."
    }
}

class FantasyHubBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(FantasyHubStoreKitPlugin())
        bridge?.registerPluginInstance(FantasyHubAppleAuthPlugin())
        guard let webView = bridge?.webView else { return }
        webView.scrollView.showsVerticalScrollIndicator = false
        webView.scrollView.showsHorizontalScrollIndicator = false

        // Run before the remote React bundle paints. Fantasy Hub remains a
        // server-backed app, but these launch-critical tablet rules ship in the
        // IPA so iPadOS does not show an intermediate theme or dynamic-height
        // layout while the signed-in workspace initializes.
        let launchStabilizer = WKUserScript(
            source: Self.launchStabilizerScript,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        webView.configuration.userContentController.addUserScript(launchStabilizer)
        webView.evaluateJavaScript(Self.launchStabilizerScript)
    }

    private static let launchStabilizerScript = #"""
    (() => {
      const root = document.documentElement;
      const savedTheme = localStorage.getItem('fantasy-hub-theme');
      const theme = savedTheme === 'dark' || savedTheme === 'light'
        ? savedTheme
        : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      root.dataset.theme = theme;
      root.style.colorScheme = theme;
      const background = theme === 'dark' ? '#181b22' : '#f4f7f5';
      root.style.backgroundColor = background;

      const style = document.createElement('style');
      style.id = 'fantasy-hub-native-ipad-stabilizer';
      style.textContent = `
        @media (min-width:701px) and (max-width:1366px) and (pointer:coarse) {
          html, body { min-height:100%; background-color:${background}; }
          .sidebar { height:100svh !important; }
          .workspace { min-height:100svh !important; }
          .app-shell { transition:grid-template-columns .34s cubic-bezier(.22,1,.36,1) !important; }
          .sidebar { transition:padding .34s cubic-bezier(.22,1,.36,1) !important; }
          .brand, .brand-logo, .league-card, .sidebar nav button,
          .sidebar nav .nav-group > span, .sidebar .nav-label,
          .sidebar .nav-pro-tag, .sidebar-bottom, .sidebar-bottom > div,
          .sidebar-bottom > small, .theme-toggle, .theme-toggle > b,
          .theme-toggle > i {
            transition:opacity .16s ease,max-width .34s cubic-bezier(.22,1,.36,1),max-height .34s cubic-bezier(.22,1,.36,1),margin .34s cubic-bezier(.22,1,.36,1),padding .34s cubic-bezier(.22,1,.36,1),gap .34s cubic-bezier(.22,1,.36,1),transform .34s cubic-bezier(.22,1,.36,1) !important;
          }
          .sidebar-collapse > span { transition:transform .34s cubic-bezier(.22,1,.36,1) !important; }
          .sidebar-collapsed .sidebar-collapse > span { transform:translateY(-1px) rotate(180deg) !important; }
        }
        @media (min-width:701px) and (max-width:1366px) and (pointer:coarse) and (prefers-reduced-motion:reduce) {
          .app-shell, .sidebar, .brand, .brand-logo, .league-card,
          .sidebar nav button, .sidebar nav .nav-group > span,
          .sidebar .nav-label, .sidebar .nav-pro-tag, .sidebar-bottom,
          .sidebar-bottom > div, .sidebar-bottom > small, .theme-toggle,
          .theme-toggle > b, .theme-toggle > i, .sidebar-collapse > span {
            transition:none !important;
          }
        }
      `;
      (document.head || root).appendChild(style);
    })();
    """#
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
