import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Stripe Checkout only accepts server-mapped Fantasy Hub plans", async () => {
  const source = await readFile(new URL("../app/api/billing/checkout/route.ts", import.meta.url), "utf8");
  assert.match(source, /new Set<.*>\(\["monthly", "season", "annual"\]\)/);
  assert.match(source, /priceForPlan\(config, payload\.plan\)/);
  assert.match(source, /trial_period_days: 7/);
  assert.doesNotMatch(source, /payload\.priceId/);
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
