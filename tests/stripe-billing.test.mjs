import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Stripe Checkout only accepts server-mapped Fantasy Hub plans", async () => {
  const source = await readFile(new URL("../app/api/billing/checkout/route.ts", import.meta.url), "utf8");
  assert.match(source, /new Set<.*>\(\["monthly", "season", "annual"\]\)/);
  assert.match(source, /priceForPlan\(config, payload\.plan\)/);
  assert.match(source, /trial_period_days: 7/);
  assert.doesNotMatch(source, /payload\.priceId/);
  assert.match(source, /unit_amount === 2499/);
  assert.match(source, /recurring\.interval_count === 6/);
  assert.match(source, /stripe\.prices\.list\(\{ product: productId, active: true, limit: 100 \}\)/);
  assert.match(source, /stripe\.prices\.create\(/);
  assert.match(source, /recurring: \{ interval: "month", interval_count: 6 \}/);
  assert.match(source, /existing\?\.provider === "stripe"/);
  assert.match(source, /providerCustomerId\?\.startsWith\("cus_"\)/);
  assert.match(source, /stripeError\.code !== "resource_missing"/);
  assert.match(source, /createCheckout\(\)/);
  assert.match(source, /automatic_tax: \{ enabled: true \}/);
  assert.match(source, /billing_address_collection: "required"/);
  assert.match(source, /customer_update: \{ address: "auto" as const \}/);
});

test("Apple StoreKit accepts localized prices while guarding the six-month season period", async () => {
  const [source, runtime, plans] = await Promise.all([
    readFile(new URL("../ios/App/App/SceneDelegate.swift", import.meta.url), "utf8"),
    readFile(new URL("../app/native-runtime.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(source, /seasonProductId = "com\.fantasyhubapp\.pro\.season"/);
  assert.doesNotMatch(source, /product\.price == Decimal\(string: "24\.99"\)/);
  assert.doesNotMatch(source, /product\.priceFormatStyle\.currencyCode == "USD"/);
  assert.match(source, /period\.unit == \.month/);
  assert.match(source, /period\.value == 6/);
  assert.match(source, /try validateProduct\(product\)/);
  assert.match(source, /CAPPluginMethod\(name: "entitlements"/);
  assert.match(source, /activationState == \.foregroundActive/);
  assert.match(source, /https:\/\/apps\.apple\.com\/account\/subscriptions/);
  assert.match(source, /openSubscriptionsFallback\(call\)/);
  assert.match(runtime, /nativeRefreshPurchases/);
  assert.match(plans, /Another purchase is pending/);
  assert.match(plans, /setInterval\(.*5_000/);
  assert.match(plans, /restore-purchases-link/);
  assert.match(plans, /nativePrices\[`com\.fantasyhubapp\.pro\.\$\{plan\}`\]/);
  assert.match(plans, /\{seasonPrice\} <small>\/ 6 months<\/small>/);
  assert.doesNotMatch(plans, /native-billing-note[^\n]*Restore Purchases/);
});

test("subscription screen links to privacy policy and terms of use", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  assert.match(source, /className="subscription-legal-links"/);
  assert.match(source, /href="\/privacy">Privacy Policy/);
  assert.match(source, /apple\.com\/legal\/internet-services\/itunes\/dev\/stdeula/);
});

test("Stripe webhooks verify the raw signed body before granting Pro", async () => {
  const source = await readFile(new URL("../app/api/webhooks/stripe/route.ts", import.meta.url), "utf8");
  assert.match(source, /await request\.text\(\)/);
  assert.match(source, /await stripe\.webhooks\.constructEventAsync\(rawBody, signature, config\.webhookSecret\)/);
  assert.match(source, /customer\.subscription\.deleted/);
  assert.match(source, /onConflictDoUpdate/);
});

test("account deletion cancels active Stripe billing before deleting user data", async () => {
  const source = await readFile(new URL("../app/api/v1/account/route.ts", import.meta.url), "utf8");
  assert.match(source, /stripe\.subscriptions\.cancel\(billing\.providerSubscriptionId\)/);
  assert.match(source, /BILLING_CANCELLATION_FAILED/);
});

test("Apple billing uses one canonical provider and supports legacy records", async () => {
  const [appleRoute, appleSync, portalRoute, entitlements] = await Promise.all([
    readFile(new URL("../app/api/billing/apple/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/apple-entitlement-sync.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/billing/portal/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/entitlements.ts", import.meta.url), "utf8"),
  ]);

  assert.match(appleRoute, /persistAppleEntitlement/);
  assert.match(appleSync, /provider: "apple"/);
  assert.match(appleRoute, /\["apple", "app_store"\]/);
  assert.match(portalRoute, /record\.provider === "app_store"/);
  assert.match(entitlements, /record\?\.provider === "app_store" \? "apple"/);
});

test("Apple verification performs request-scoped authenticated API calls", async () => {
  const source = await readFile(new URL("../app/app-store.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /@apple\/app-store-server-library/);
  assert.match(source, /crypto\.subtle\.importKey/);
  assert.match(source, /crypto\.subtle\.sign/);
  assert.match(source, /JSON\.parse\(normalized\)/);
  assert.match(source, /BEGIN PRIVATE KEY/);
  assert.match(source, /not valid PKCS#8 PEM data/);
  assert.match(source, /aud: "appstoreconnect-v1"/);
  assert.match(source, /api\.storekit-sandbox\.itunes\.apple\.com/);
  assert.match(source, /payload\.bundleId !== config\.bundleId/);
  assert.match(source, /payload\.transactionId !== transactionId/);
  assert.match(source, /APP_STORE_PRODUCTS\.has\(productId\)/);
});

test("Apple renewals reconcile from server notifications and native app launch", async () => {
  const [webhook, sync, dashboard] = await Promise.all([
    readFile(new URL("../app/api/webhooks/apple/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/apple-entitlement-sync.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(webhook, /signedPayload/);
  assert.match(webhook, /verifyAppleTransaction\(transactionId\)/);
  assert.match(webhook, /claimedAppleSubscription/);
  assert.match(webhook, /persistAppleEntitlement/);
  assert.match(sync, /currentPeriodEnd: verified\.expiresAt/);
  assert.match(sync, /active \? "pro" : "free"/);
  assert.match(dashboard, /isNativeIosApp\(\)\) await nativeRestorePurchases\(\)/);
});

test("Apple purchases migrate across Clerk identities only for the same verified email", async () => {
  const source = await readFile(new URL("../app/api/billing/apple/route.ts", import.meta.url), "utf8");
  assert.match(source, /previousSubscription/);
  assert.match(source, /previousSubscription\?\.email\?\.trim\(\)\.toLowerCase\(\)/);
  assert.match(source, /user\.email\.trim\(\)\.toLowerCase\(\)/);
  assert.match(source, /previousEmail === currentEmail/);
  assert.match(source, /if \(!sameVerifiedEmail\)/);
  assert.doesNotMatch(source, /ownerRecovery/);
  assert.match(source, /linked to another Fantasy Hub login/);
  assert.match(source, /eq\(subscriptions\.userId, claimed\.userId\)/);
  assert.match(source, /persistAppleEntitlement\(verified, user\.userId, user\.email\)/);
});
