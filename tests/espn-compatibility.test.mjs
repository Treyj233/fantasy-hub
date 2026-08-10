import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ESPN league IDs use a normalized public-league adapter", async () => {
  const adapter = await readFile(new URL("../app/api/espn.ts", import.meta.url), "utf8");
  const leagueRoute = await readFile(new URL("../app/api/league/route.ts", import.meta.url), "utf8");
  assert.match(adapter, /lm-api-reads\.fantasy\.espn\.com/);
  assert.match(adapter, /normalizeEspnLeague/);
  assert.match(adapter, /This ESPN league is private/);
  assert.match(leagueRoute, /id\?\.startsWith\("espn:"\)/);
});

test("ESPN connection requires explicit team ownership and persists it", async () => {
  const route = await readFile(new URL("../app/api/account/managed-leagues/route.ts", import.meta.url), "utf8");
  const schema = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
  const client = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  assert.match(route, /teamSelection: summary/);
  assert.match(route, /Choose a team from this ESPN league/);
  assert.match(schema, /rosterId: text\("roster_id"\)/);
  assert.match(client, /SELECT YOUR TEAM/);
  assert.match(client, /PUBLIC LEAGUE CONNECTION/);
});

test("ESPN connected leagues feed the shared live scoreboard", async () => {
  const adapter = await readFile(new URL("../app/api/espn.ts", import.meta.url), "utf8");
  const scoreboard = await readFile(new URL("../app/api/scoreboard/route.ts", import.meta.url), "utf8");
  assert.match(adapter, /normalizeEspnScoreboard/);
  assert.match(scoreboard, /leagueId\?\.startsWith\("espn:"\)/);
  assert.match(scoreboard, /Select your ESPN team in Manage Leagues/);
});

test("ESPN schedule and settings feed the shared season simulator", async () => {
  const adapter = await readFile(new URL("../app/api/espn.ts", import.meta.url), "utf8");
  const simulator = await readFile(new URL("../app/api/simulation-context/route.ts", import.meta.url), "utf8");
  assert.match(adapter, /normalizeEspnSimulation/);
  assert.match(simulator, /leagueId\?\.startsWith\("espn:"\)/);
});
