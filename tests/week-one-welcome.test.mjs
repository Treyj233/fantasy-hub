import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Week 1 welcome is account-aware and opens weekly rankings", async () => {
  const [dashboard, preferences, schema, migration, styles] = await Promise.all([
    readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/account/preferences/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0018_optimal_baron_strucker.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(schema, /weekOneWelcomeSeenSeason: text\("week_one_welcome_seen_season"\)/);
  assert.match(migration, /ADD `week_one_welcome_seen_season` text/);
  assert.match(preferences, /weekOneWelcomeSeenSeason/);
  assert.match(dashboard, /defaultGameWeek !== 1/);
  assert.match(dashboard, /weekOneWelcomeSeenSeason === weekOneWelcomeDay/);
  assert.match(dashboard, /fantasy-hub-week-one-welcome:\$\{leagueSeason\}:\$\{weekOneWelcomeDay\}/);
  assert.match(dashboard, /setPlayerRankingMode\("weekly"\)/);
  assert.match(dashboard, /View Player Rankings/);
  assert.match(dashboard, /\{!isPro && \(/);
  assert.match(dashboard, /week_one_welcome_view/);
  assert.match(dashboard, /week_one_welcome_action/);
  assert.match(styles, /\.week-one-welcome-backdrop/);
  assert.match(styles, /max-height:calc\(100dvh - 20px - env\(safe-area-inset-top\) - env\(safe-area-inset-bottom\)\)/);
  assert.match(styles, /overflow-y:auto/);
});
