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
