import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { Network } from "@capacitor/network";
import { PushNotifications } from "@capacitor/push-notifications";
import { registerPlugin } from "@capacitor/core";

type NativeTransaction = { status: string; transactionId?: string; productId?: string; expirationDate?: string };
const LeagueLinks = registerPlugin<{
  open(options: { url: string }): Promise<{ opened: boolean }>;
}>("FantasyHubLeagueLinks");

export async function nativeOpenLeague(url: string) {
  if (!isNativeIosApp()) return false;
  try {
    return (await LeagueLinks.open({ url })).opened;
  } catch {
    // Older installed builds do not have the bridge yet; retain web navigation.
    return false;
  }
}
type NativeProduct = { id: string; name: string; description: string; displayPrice: string; periodValue?: number; periodUnit?: string };
const StoreKit = registerPlugin<{
  products(): Promise<{ products: NativeProduct[] }>;
  purchase(options: { productId: string }): Promise<NativeTransaction>;
  entitlements(): Promise<{ transactions: NativeTransaction[] }>;
  restore(): Promise<{ transactions: NativeTransaction[] }>;
  finish(options: { transactionId: string }): Promise<{ finished: boolean }>;
  manageSubscriptions(): Promise<void>;
  recordVerifiedPurchase(options: { transactionId: string }): Promise<{ recorded: boolean }>;
}>("FantasyHubStoreKit");

const NativeReview = registerPlugin<{
  request(): Promise<{ requested: boolean }>;
  openStore(): Promise<{ opened: boolean }>;
}>("FantasyHubReview");

export async function nativeRequestReview() {
  if (!isNativeIosApp()) return;
  const result = await NativeReview.request().catch(() => ({ requested: false }));
  if (result.requested) void nativeLogAppsFlyerEvent('fh_review_requested');
}

export async function nativeWriteReview() {
  if (!isNativeIosApp()) return;
  const result = await NativeReview.openStore().catch(() => ({ opened: false }));
  if (result.opened) void nativeLogAppsFlyerEvent('fh_review_store_opened');
}

const AppleAuth = registerPlugin<{
  signIn(): Promise<{ authenticated?: boolean; cancelled?: boolean; redirect?: string }>;
  signOut(): Promise<{ signedOut?: boolean }>;
}>("FantasyHubAppleAuth");

const NativeAnalytics = registerPlugin<{
  logEvent(options: {
    name: string;
    values?: Record<string, string | number | boolean>;
  }): Promise<{ recorded: boolean }>;
}>("FantasyHubAnalytics");

export async function nativeLogAppsFlyerEvent(
  name: string,
  values: Record<string, string | number | boolean> = {},
) {
  if (!isNativeIosApp()) return false;
  try {
    const result = await NativeAnalytics.logEvent({ name, values });
    return result.recorded;
  } catch {
    // Analytics must never interrupt navigation or other user actions.
    return false;
  }
}

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

async function verifyNativeTransaction(transaction: NativeTransaction, trackPurchase = false) {
  if (!transaction.transactionId) return false;
  const response = await fetch("/api/billing/apple", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transactionId: transaction.transactionId }),
  });
  const result = await response.json() as { active?: boolean; error?: string };
  if (!response.ok) throw new Error(result.error ?? "App Store verification failed");
  await StoreKit.finish({ transactionId: transaction.transactionId });
  if (result.active && trackPurchase) {
    void StoreKit.recordVerifiedPurchase({ transactionId: transaction.transactionId }).catch(() => undefined);
  }
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

async function performNativePurchase(productId: string) {
  if (!isNativeIosApp()) throw new Error("App Store purchasing requires the iOS app");
  try {
    let transaction = await StoreKit.purchase({ productId });
    if (
      transaction.status !== "verified" &&
      transaction.status !== "pending" &&
      transaction.status !== "cancelled"
    ) {
      return "inactive";
    }
    if (transaction.status === "cancelled") return "cancelled";
    if (transaction.status === "pending") return "pending";
    if (await verifyNativeTransaction(transaction, true)) return "active";

    // StoreKit can replay an unfinished transaction before presenting a new
    // purchase sheet. This commonly happens in TestFlight after server-side
    // verification rejected the original attempt. Once the stale transaction
    // has been verified and finished above, retry the requested product once so
    // the user can complete the actual App Store confirmation in the same tap.
    const expirationTime = transaction.expirationDate
      ? Date.parse(transaction.expirationDate)
      : Number.NaN;
    if (Number.isFinite(expirationTime) && expirationTime <= Date.now()) {
      transaction = await StoreKit.purchase({ productId });
      if (transaction.status === "cancelled") return "cancelled";
      if (transaction.status === "pending") return "pending";
      if (transaction.status !== "verified") return "inactive";
      return await verifyNativeTransaction(transaction, true) ? "active" : "inactive";
    }
    return "inactive";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    if (isAlreadySubscribedError(message)) {
      const hasActivePurchase = await nativeRefreshPurchases().catch(() => false);
      if (hasActivePurchase) return "active";
    }
    throw error;
  }
}

export async function nativePurchase(productId: string) {
  const parts = productId.split('.');
  const values = { af_content_id: productId, product_category: productId.includes('.theme.') ? 'theme' : 'subscription', product_tier: parts[2] ?? '', product_option: parts[3] ?? '' };
  void nativeLogAppsFlyerEvent('af_initiated_checkout', values);
  try {
    const status = await performNativePurchase(productId);
    void nativeLogAppsFlyerEvent(`fh_purchase_${status}`, values);
    return status;
  } catch (error) {
    void nativeLogAppsFlyerEvent('fh_purchase_failed', values);
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

const pushTokenKey = "fantasy-hub-push-token";
const pushOptOutKey = "fantasy-hub-push-opt-out";

export async function nativePushSettings() {
  const token = localStorage.getItem(pushTokenKey) ?? "";
  const response = await fetch("/api/account/push", { headers: { "x-push-token": token } });
  if (!response.ok) throw new Error("Unable to load notification settings");
  const settings = await response.json();
  const permission = await PushNotifications.checkPermissions();
  return { ...settings, enabled: settings.enabled && permission.receive === "granted" };
}

export async function syncDefaultNativePushNotifications() {
  if (!isNativeIosApp() || localStorage.getItem(pushOptOutKey) === "true") return;
  const permission = await PushNotifications.checkPermissions();
  if (permission.receive === "denied") return;
  await enableNativePushNotifications();
}

export async function enableNativePushNotifications() {
  if (!isNativeIosApp()) throw new Error("Push notifications require the iOS app");
  const permission = await PushNotifications.checkPermissions();
  const result = permission.receive === "prompt" ? await PushNotifications.requestPermissions() : permission;
  if (result.receive !== "granted") throw new Error("Notifications are disabled in iOS Settings");
  return await new Promise<void>((resolve, reject) => {
    const listeners: { remove(): Promise<void> }[] = [];
    let finished = false;
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      void Promise.all(listeners.map((listener) => listener.remove())).catch(() => undefined);
      if (error) reject(error); else resolve();
    };
    const timeout = setTimeout(() => finish(new Error("Notification registration timed out. Please try again.")), 20_000);
    void (async () => {
      listeners.push(await PushNotifications.addListener("registration", ({ value }) => {
        if (finished) return;
        void (async () => {
        const response = await fetch("/api/account/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: value, platform: "ios" }) });
        const data = await response.json() as { error?: string };
        if (!response.ok) throw new Error(data.error ?? "Unable to save notification settings");
        localStorage.setItem(pushTokenKey, value);
        localStorage.removeItem(pushOptOutKey);
        finish();
        })().catch((error) => finish(error instanceof Error ? error : new Error("Unable to register notifications")));
      }));
      listeners.push(await PushNotifications.addListener("registrationError", (error) => finish(new Error(error.error))));
      if (!finished) await PushNotifications.register();
      else await Promise.all(listeners.map((listener) => listener.remove()));
    })().catch((error) => finish(error instanceof Error ? error : new Error("Unable to register notifications")));
  });
}

export async function disableNativePushNotifications() {
  const token = localStorage.getItem(pushTokenKey);
  if (token) {
    const response = await fetch("/api/account/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
    if (!response.ok) throw new Error("Unable to turn notifications off. Please try again.");
  }
  localStorage.setItem(pushOptOutKey, "true");
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
      window.dispatchEvent(new Event("fantasyhub:native-state"));
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
