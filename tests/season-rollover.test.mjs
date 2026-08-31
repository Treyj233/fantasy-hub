import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("opponent strength switches exclusively to the active season after Week 1", async () => {
  const model = await readFile(new URL("../app/matchup-strength.ts", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/matchup-strength/route.ts", import.meta.url), "utf8");
  assert.match(model, /requestedSeason > 2025 && currentWeek >= 2/);
  assert.match(model, /const current = await seasonData\(requestedSeason\)/);
  assert.match(route, /loadMatchupStrengths\(season, week\)/);
});

test("player and offense history roll forward with an early-season blend", async () => {
  const history = await readFile(new URL("../app/season-history.ts", import.meta.url), "utf8");
  const sleeper = await readFile(new URL("../app/api/league/route.ts", import.meta.url), "utf8");
  const espn = await readFile(new URL("../app/api/espn.ts", import.meta.url), "utf8");
  assert.match(history, /loadBlendedPlayerSeasonProfiles/);
  assert.match(history, /loadBlendedTeamOffenseProfiles/);
  assert.match(history, /Math\.min\(1, Math\.max\(\.25, \(currentWeek - 1\) \/ 4\)\)/);
  assert.match(history, /currentProfiles: current/);
  assert.doesNotMatch(sleeper, /loadPlayerSeasonProfiles\(2025\)|loadTeamOffenseProfiles\(2025\)/);
  assert.doesNotMatch(espn, /leagueSeason > 2025 \? 2025/);
});

test("current-season source caches expire so weekly data can advance", async () => {
  for (const path of ["../app/matchup-strength.ts", "../app/season-history.ts", "../app/snap-data.ts"]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(source, /expiresAt/);
    assert.match(source, /6 \* 60 \* 60 \* 1000/);
  }
});

test("player history includes the active season", async () => {
  const source = await readFile(new URL("../app/api/player-history/route.ts", import.meta.url), "utf8");
  assert.match(source, /const currentSeason = Number\(state\.season/);
  assert.match(source, /const latestSeason = Number\.isFinite\(currentSeason\)/);
});
