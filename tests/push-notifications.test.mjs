import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("notification preferences cover the complete game-day alert set", async () => {
  const preferences = await readFile(new URL("../app/push-preferences.ts", import.meta.url), "utf8");
  const accountUi = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  for (const key of ["kickoffSoon", "slateStarted", "bigPlays", "matchupResults", "closeGame", "pathToVictory", "weatherRisk", "lineupUrgency", "injuryStatus"]) {
    assert.match(preferences, new RegExp(key));
  }
  assert.match(accountUi, /15 minutes to kickoff/);
  assert.match(accountUi, /Big plays · 5\+ points/);
  assert.match(accountUi, /Matchup won or lost/);
  assert.match(accountUi, /Close matchup/);
  assert.match(accountUi, /Path to victory/);
  assert.match(accountUi, /Inclement weather/);
  assert.match(accountUi, /<details className="notification-options">/);
  assert.match(accountUi, /Optional notification types/);
  assert.doesNotMatch(accountUi, /<details className="notification-options" open/);
  assert.match(accountUi, /view === "My Account"/);
  assert.doesNotMatch(accountUi, /view === "Access Account"/);
});

test("APNs payloads support categories, grouping, and interruption levels", async () => {
  const apns = await readFile(new URL("../app/apns.ts", import.meta.url), "utf8");
  assert.match(apns, /KICKOFF_SOON/);
  assert.match(apns, /BIG_PLAY/);
  assert.match(apns, /CLOSE_GAME/);
  assert.match(apns, /PATH_TO_VICTORY/);
  assert.match(apns, /WEATHER_RISK/);
  assert.match(apns, /thread-id/);
  assert.match(apns, /interruption-level/);
});

test("notification preferences are persisted per account", async () => {
  const schema = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/account/push/route.ts", import.meta.url), "utf8");
  assert.match(schema, /pushPreferencesJson/);
  assert.match(route, /export async function PATCH/);
  assert.match(route, /sanitizePushPreferences/);
});
