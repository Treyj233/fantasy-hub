import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("simulator starter strength uses the same ranking model as Team Rankings", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");

  assert.match(source, /const buildStarterStrengths = \([\s\S]*?teams: LeagueTeam\[\],[\s\S]*?rankings: LeagueRanking\[\],[\s\S]*?context: RankingContext \| null/);
  assert.match(source, /const starterStrengths = buildStarterStrengths\(teams, rankings, context\)/);
  assert.match(source, /averageProjectedTotal \* strength \/ Math\.max\(1, averageStarterStrength\)/);
  assert.match(source, /const strengthRank =\s*\[\.\.\.starterStrengths\.entries\(\)\]/);
  assert.match(source, /formatOrdinal\(strengthRank\)/);
  assert.doesNotMatch(source, /\$\{strengthRank\}th/);
  assert.match(source, /<Simulator[\s\S]*?rankings=\{leagueRankings\}/);
});

test("single-QB team rankings give only super-elite QBs and TEs a capped replacement premium", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");

  assert.match(source, /\["QB", "TE"\]/);
  assert.match(source, /\(positionRanks\.get\(player\.id\) \?\? 99\) > 3/);
  assert.match(source, /Math\.min\(3, aboveReplacement \* \.12\)/);
  assert.match(source, /if \(superflexSlots > 0\) return baseValue/);
});

test("Team Rankings and Simulator use the final league-adjusted season composite", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const teamRankingsStart = source.indexOf("function TeamRankings(");
  const playerRankingsStart = source.indexOf("function buildSeasonCompositeRankings(", teamRankingsStart);
  const teamRankings = source.slice(teamRankingsStart, playerRankingsStart);
  const simulatorStart = source.indexOf("function Simulator(");
  const simulator = source.slice(simulatorStart, source.indexOf("function Glossary(", simulatorStart));

  assert.match(teamRankings, /const teamRankings = buildSeasonCompositeRankings\(rankings, context\)/);
  assert.match(teamRankings, /new Map\(teamRankings\.map/);
  assert.match(simulator, /const teamRankings = buildSeasonCompositeRankings\(rankings, context\)/);
  assert.match(simulator, /runLeagueSimulation\([\s\S]*?teamRankings,/);
});

test("simulator league settings are expanded when the page opens", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");

  assert.match(source, /<details className="simulation-settings panel" open>/);
  assert.match(source, /<b>LEAGUE SETTINGS<\/b>/);
});
