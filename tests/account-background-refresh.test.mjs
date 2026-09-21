import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("active league state follows the account and bootstraps its saved snapshot", async () => {
  const [schema, preferences, bootstrap, dashboard] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/account/preferences/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/v1/bootstrap/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /activeLeagueId: text\("active_league_id"\)/);
  assert.match(schema, /lastActiveAt: text\("last_active_at"\)/);
  assert.match(preferences, /activeLeagueId: payload\.activeLeagueId/);
  assert.match(bootstrap, /activeLeagueSnapshot/);
  assert.match(dashboard, /data\.preferences\?\.activeLeagueId \?\? cachedLeagueId/);
  assert.match(dashboard, /saveAccountPreferences\(\{ activeLeagueId: requestedLeagueId \}\)/);
});

test("league snapshots use stale-while-revalidate and the cron prewarms active accounts", async () => {
  const [league, evaluator, cron, refresh] = await Promise.all([
    readFile(new URL("../app/api/league/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/notifications/run/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../push-cron/wrangler.jsonc", import.meta.url), "utf8"),
    readFile(new URL("../app/background-league-refresh.ts", import.meta.url), "utf8"),
  ]);
  assert.match(league, /fresh \? "fresh" : "stale"/);
  assert.match(league, /revalidateRecommended: !fresh/);
  assert.match(evaluator, /refreshActiveLeagueSnapshots/);
  assert.match(refresh, /accountRefreshInterval/);
  assert.match(refresh, /x-fantasy-hub-sync-user/);
  assert.match(refresh, /REFRESH.jobsPerTick/);
  assert.match(cron, /"crons": \["\* \* \* \* \*"\]/);
});
