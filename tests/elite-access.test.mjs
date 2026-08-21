import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Elite is web-only while Draft HQ remains visible with feature-level gates", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  assert.match(source, /const visibleNav = nav;/);
  assert.doesNotMatch(source, /item\.label !== "Draft HQ" \|\| entitlement\.owner/);
  assert.match(source, /view === "Draft HQ" && draftStylesReady/);
  assert.match(source, /!nativeIos && <section className="tier-plans elite-plans panel">/);
  assert.match(source, /const eliteViews = new Set<View>\(\["Manager Report"\]\)/);
  assert.match(source, /view === "Manager Report" && !entitlement\.elite/);
  assert.match(source, /isPro=\{entitlement\.pro\}/);
  assert.match(source, /isElite=\{entitlement\.elite\}/);
});

test("Elite web billing provisions the intended recurring catalog", async () => {
  const checkout = await readFile(new URL("../app/api/billing/checkout/route.ts", import.meta.url), "utf8");
  assert.match(checkout, /elite_monthly: \{ amount: 799, interval: "month" as const, intervalCount: 1 \}/);
  assert.match(checkout, /elite_season: \{ amount: 3499, interval: "month" as const, intervalCount: 6 \}/);
  assert.match(checkout, /elite_annual: \{ amount: 5999, interval: "year" as const, intervalCount: 1 \}/);
  assert.match(checkout, /name: "Fantasy Hub Elite"/);
  assert.match(checkout, /subscription_update_confirm/);
});
