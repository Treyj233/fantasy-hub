import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Stripe Checkout only accepts server-mapped Fantasy Hub plans", async () => {
  const source = await readFile(new URL("../app/api/billing/checkout/route.ts", import.meta.url), "utf8");
  assert.match(source, /new Set<.*>\(\["monthly", "season", "annual"\]\)/);
  assert.match(source, /priceForPlan\(config, payload\.plan\)/);
  assert.match(source, /trial_period_days: 7/);
  assert.doesNotMatch(source, /payload\.priceId/);
  assert.match(source, /unit_amount !== 2499/);
  assert.match(source, /recurring\.interval_count !== 6/);
  assert.match(source, /existing\?\.provider === "stripe"/);
  assert.match(source, /providerCustomerId\?\.startsWith\("cus_"\)/);
  assert.match(source, /stripeError\.code !== "resource_missing"/);
  assert.match(source, /createCheckout\(\)/);
});

test("Apple StoreKit guards the $24.99 six-month season subscription", async () => {
  const [source, runtime, plans] = await Promise.all([
    readFile(new URL("../ios/App/App/SceneDelegate.swift", import.meta.url), "utf8"),
    readFile(new URL("../app/native-runtime.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(source, /seasonProductId = "com\.fantasyhubapp\.pro\.season"/);
  assert.match(source, /product\.price == Decimal\(string: "24\.99"\)/);
  assert.match(source, /product\.priceFormatStyle\.currencyCode == "USD"/);
  assert.match(source, /period\.unit == \.month/);
  assert.match(source, /period\.value == 6/);
  assert.match(source, /try validateProduct\(product\)/);
  assert.match(source, /CAPPluginMethod\(name: "entitlements"/);
  assert.match(runtime, /nativeRefreshPurchases/);
  assert.match(plans, /Another purchase is pending/);
  assert.match(plans, /setInterval\(.*5_000/);
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
  const [appleRoute, portalRoute, entitlements] = await Promise.all([
    readFile(new URL("../app/api/billing/apple/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/billing/portal/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/entitlements.ts", import.meta.url), "utf8"),
  ]);

  assert.match(appleRoute, /provider: "apple"/);
  assert.match(appleRoute, /\["apple", "app_store"\]/);
  assert.match(portalRoute, /record\.provider === "app_store"/);
  assert.match(entitlements, /record\?\.provider === "app_store" \? "apple"/);
});
