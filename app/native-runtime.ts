import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { Network } from "@capacitor/network";
import { PushNotifications } from "@capacitor/push-notifications";
import { registerPlugin } from "@capacitor/core";

type NativeTransaction = { status: string; transactionId?: string; productId?: string; expirationDate?: string };
type NativeProduct = { id: string; name: string; description: string; displayPrice: string; periodValue?: number; periodUnit?: string };
const StoreKit = registerPlugin<{
  products(): Promise<{ products: NativeProduct[] }>;
  purchase(options: { productId: string }): Promise<NativeTransaction>;
  entitlements(): Promise<{ transactions: NativeTransaction[] }>;
  restore(): Promise<{ transactions: NativeTransaction[] }>;
  finish(options: { transactionId: string }): Promise<{ finished: boolean }>;
  manageSubscriptions(): Promise<void>;
}>("FantasyHubStoreKit");

const AppleAuth = registerPlugin<{
  signIn(): Promise<{ authenticated?: boolean; cancelled?: boolean; redirect?: string }>;
  signOut(): Promise<{ signedOut?: boolean }>;
}>("FantasyHubAppleAuth");

export async function nativeAppleCredential() {
  if (!isNativeIosApp()) throw new Error("Native Apple sign-in requires the iOS app");
  return AppleAuth.signIn();
}

export async function nativeAppleSignOut() {
  if (!isNativeIosApp()) return;
  await AppleAuth.signOut();
}

export async function nativeStoreProducts() {
  return isNativeIosApp() ? (await StoreKit.products()).products : [];
}

async function verifyNativeTransaction(transaction: NativeTransaction) {
  if (!transaction.transactionId) return false;
  const response = await fetch("/api/billing/apple", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transactionId: transaction.transactionId }),
  });
  const result = await response.json() as { active?: boolean; error?: string };
  if (!response.ok) throw new Error(result.error ?? "App Store verification failed");
  await StoreKit.finish({ transactionId: transaction.transactionId });
  return Boolean(result.active);
}

const duplicateSubscriptionHints = [
  "already owned",
  "already exists",
  "already subscribed",
  "already active",
  "already have an active subscription",
  "already purchased",
  "already owns",
  "already have this subscription",
];

function isAlreadySubscribedError(message: string) {
  const normalized = message.toLowerCase();
  return duplicateSubscriptionHints.some((hint) => normalized.includes(hint));
}

export async function nativePurchase(productId: string) {
  if (!isNativeIosApp()) throw new Error("App Store purchasing requires the iOS app");
  try {
    const transaction = await StoreKit.purchase({ productId });
    if (
      transaction.status !== "verified" &&
      transaction.status !== "pending" &&
      transaction.status !== "cancelled"
    ) {
      return "inactive";
    }
    if (transaction.status === "cancelled") return "cancelled";
    if (transaction.status === "pending") return "pending";
    return await verifyNativeTransaction(transaction) ? "active" : "inactive";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    if (isAlreadySubscribedError(message)) {
      const hasActivePurchase = await nativeRefreshPurchases().catch(() => false);
      if (hasActivePurchase) return "active";
    }
    throw error;
  }
}

export async function nativeRestorePurchases() {
  if (!isNativeIosApp()) return false;
  // Reading current entitlements is sufficient for StoreKit 2 restoration and
  // avoids AppStore.sync(), which can prompt for the production Apple account
  // while a TestFlight user is working with a Sandbox Apple Account.
  const { transactions } = await StoreKit.entitlements();
  let active = false;
  for (const transaction of transactions) active = (await verifyNativeTransaction(transaction)) || active;
  if (!active) await clearStaleNativeEntitlement();
  return active;
}

export async function nativeRefreshPurchases() {
  if (!isNativeIosApp()) return false;
  // A fresh sync is more reliable right after a user-reported purchase state change.
  const { transactions } = await StoreKit.restore();
  let active = false;
  for (const transaction of transactions) active = (await verifyNativeTransaction(transaction)) || active;
  if (!active) await clearStaleNativeEntitlement();
  return active;
}

async function clearStaleNativeEntitlement() {
  const response = await fetch("/api/billing/apple", { method: "DELETE" });
  const result = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(result.error ?? "Unable to reconcile App Store purchases");
}

export async function nativeManageSubscriptions() {
  if (isNativeIosApp()) await StoreKit.manageSubscriptions();
}

export async function enableNativePushNotifications() {
  if (!isNativeIosApp()) throw new Error("Push notifications require the iOS app");
  const permission = await PushNotifications.checkPermissions();
  const result = permission.receive === "prompt" ? await PushNotifications.requestPermissions() : permission;
  if (result.receive !== "granted") throw new Error("Notifications are disabled in iOS Settings");
  return await new Promise<void>((resolve, reject) => {
    const listeners = [
      PushNotifications.addListener("registration", async ({ value }) => {
        const response = await fetch("/api/account/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: value, platform: "ios" }) });
        const data = await response.json() as { error?: string };
        await Promise.all((await Promise.all(listeners)).map((listener) => listener.remove()));
        if (!response.ok) reject(new Error(data.error ?? "Unable to save notification settings"));
        else resolve();
      }),
      PushNotifications.addListener("registrationError", async (error) => {
        await Promise.all((await Promise.all(listeners)).map((listener) => listener.remove()));
        reject(new Error(error.error));
      }),
    ];
    void PushNotifications.register();
  });
}

export async function disableNativePushNotifications() {
  await fetch("/api/account/push", { method: "DELETE" });
  if (isNativeIosApp()) await PushNotifications.unregister();
}

const APP_ORIGINS = new Set([
  "https://fantasyhubapp.com",
  "https://www.fantasyhubapp.com",
]);

function routeFromAppUrl(value: string) {
  const url = new URL(value);
  if (url.protocol === "fantasyhub:") {
    if (url.hostname === "auth" && url.pathname === "/complete") {
      const ticket = url.searchParams.get("ticket");
      return ticket ? `/native-auth-ticket?ticket=${encodeURIComponent(ticket)}` : "/native-sign-in";
    }
    const nativePath = [url.hostname, url.pathname].filter(Boolean).join("/");
    return `/${nativePath}${url.search}${url.hash}`;
  }
  if (APP_ORIGINS.has(url.origin)) {
    return `${url.pathname}${url.search}${url.hash}`;
  }
  return null;
}

export function isNativeIosApp() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

const nativeHapticsPreferenceKey = "fantasy-hub-vibrations-enabled";

export function nativeHapticsEnabled() {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(nativeHapticsPreferenceKey) !== "false";
}

export function setNativeHapticsEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(nativeHapticsPreferenceKey, String(enabled));
}

export async function nativeImpact(style: "light" | "medium" = "light") {
  if (!isNativeIosApp() || !nativeHapticsEnabled()) return;
  await Haptics.impact({
    style: style === "medium" ? ImpactStyle.Medium : ImpactStyle.Light,
  }).catch(() => undefined);
}

export function initializeNativeRuntime() {
  if (!isNativeIosApp()) return () => undefined;

  const root = document.documentElement;
  root.dataset.nativePlatform = "ios";

  const subscriptions = [
    App.addListener("appUrlOpen", ({ url }) => {
      try {
        const route = routeFromAppUrl(url);
        if (route && route !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
          window.location.assign(route);
        }
      } catch {
        // Ignore malformed third-party callback URLs.
      }
    }),
    App.addListener("appStateChange", ({ isActive }) => {
      root.dataset.appState = isActive ? "active" : "background";
      if (isActive) window.dispatchEvent(new Event("fantasyhub:native-resume"));
    }),
    Network.addListener("networkStatusChange", ({ connected }) => {
      root.dataset.network = connected ? "online" : "offline";
      window.dispatchEvent(
        new CustomEvent("fantasyhub:network-change", { detail: { connected } }),
      );
    }),
  ];

  void Network.getStatus().then(({ connected }) => {
    root.dataset.network = connected ? "online" : "offline";
  });

  return () => {
    delete root.dataset.nativePlatform;
    delete root.dataset.appState;
    delete root.dataset.network;
    void Promise.all(subscriptions).then((listeners) =>
      Promise.all(listeners.map((listener) => listener.remove())),
    );
  };
}
