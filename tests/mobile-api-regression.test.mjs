import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("mobile API exposes a versioned public health and capability contract", async () => {
  const [http, health, config] = await Promise.all([
    readFile(new URL("../app/api/v1/_shared/http.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/v1/health/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/v1/config/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(http, /X-Fantasy-Hub-API-Version/);
  assert.match(http, /X-Request-Id/);
  assert.match(health, /SELECT 1 AS healthy/);
  assert.doesNotMatch(health, /from "cloudflare:workers"/);
  assert.match(config, /minimumClientVersion/);
  assert.match(config, /supportedPlatforms: \["sleeper", "espn"\]/);
});

test("authenticated bootstrap is bounded and returns saved account state", async () => {
  const source = await readFile(new URL("../app/api/v1/bootstrap/route.ts", import.meta.url), "utf8");
  assert.match(source, /getChatGPTUser/);
  assert.match(source, /checkLocalRateLimit/);
  assert.match(source, /managedLeagues/);
  assert.match(source, /userPreferences/);
});

test("account deletion requires explicit confirmation and removes every user-owned table", async () => {
  const source = await readFile(new URL("../app/api/v1/account/route.ts", import.meta.url), "utf8");
  assert.match(source, /payload\?\.confirmation !== "DELETE"/);
  for (const table of ["decisionMemory", "seasonNarrativeSnapshots", "leagueDataSnapshots", "espnLeagueSnapshots", "espnSyncPairings", "managedLeagues", "sleeperConnections", "userPreferences", "subscriptions"])
    assert.match(source, new RegExp(`db\\.delete\\(${table}\\)`));
});

test("Manage Leagues exposes the required in-product account deletion control", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  assert.match(source, /Delete Fantasy Hub account/);
  assert.match(source, /fetch\("\/api\/v1\/account"/);
  assert.match(source, /Type DELETE to confirm/);
});

test("freemium access is durable, visible, and enforced on proprietary APIs", async () => {
  const [schema, entitlements, dashboard, story, simulator] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/entitlements.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/league-story/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/simulation-context/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /sqliteTable\("subscriptions"/);
  assert.match(entitlements, /PRO_REQUIRED/);
  assert.match(dashboard, /Fantasy Hub Pro/);
  assert.match(dashboard, /const proViews = new Set<View>/);
  assert.match(story, /requirePro/);
  assert.match(simulator, /requirePro/);
});

test("free tools retain manual utility while proprietary controls require Pro", async () => {
  const dashboard = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  assert.match(dashboard, /Manual trade calculator/);
  assert.match(dashboard, /Unlock trade suggestions/);
  assert.match(dashboard, /disabled=\{!isPro\}/);
  assert.match(dashboard, /PRO · Unlock floor-to-ceiling strategy/);
  assert.match(dashboard, /appearance-pro-locked/);
  assert.match(dashboard, /DashboardPreview type="sim"/);
  assert.match(dashboard, /DashboardPreview type="trade"/);
  assert.match(dashboard, /DashboardPreview type="start"/);
});

test("free accounts are forced to the base green appearance on client and server", async () => {
  const [dashboard, preferencesRoute, accountRoute, bootstrapRoute] = await Promise.all([
    readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/account/preferences/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/account/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/v1/bootstrap/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(dashboard, /const effectiveTeamTheme = entitlement\.pro \? teamTheme : "GB"/);
  assert.match(dashboard, /const effectiveBadgeTheme: BadgeTheme = entitlement\.pro \? badgeTheme : "arcade"/);
  assert.match(preferencesRoute, /entitlement\.pro \? payload\.teamTheme[\s\S]*: "GB"/);
  assert.match(accountRoute, /teamTheme: entitlement\.pro \? preferences\.teamTheme : "GB"/);
  assert.match(bootstrapRoute, /badgeTheme: entitlement\.pro \? preferences\.badgeTheme : "arcade"/);
});
