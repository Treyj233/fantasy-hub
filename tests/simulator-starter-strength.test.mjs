import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("simulator starter strength uses the same ranking model as Team Rankings", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");

  assert.match(source, /const buildStarterStrengths = \(teams: LeagueTeam\[\], rankings: LeagueRanking\[\]\)/);
  assert.match(source, /const starterStrengths = buildStarterStrengths\(teams, rankings\)/);
  assert.match(source, /const strengthRank =\s*\[\.\.\.starterStrengths\.entries\(\)\]/);
  assert.match(source, /<Simulator[\s\S]*?rankings=\{leagueRankings\}/);
});

test("simulator league settings are expanded when the page opens", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");

  assert.match(source, /<details className="simulation-settings panel" open>/);
  assert.match(source, /<b>LEAGUE SETTINGS<\/b>/);
});
