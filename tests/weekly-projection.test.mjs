import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { weeklyProjectionValue } from "../app/weekly-projection.ts";

test("missing weekly projections are not converted into zero-point rankings", () => {
  assert.equal(weeklyProjectionValue({ leagueProjection: null, projection: 0 }), null);
  assert.equal(weeklyProjectionValue({ leagueProjection: 0, projection: 0 }), null);
});

test("connected weekly projections remain authoritative", () => {
  assert.equal(weeklyProjectionValue({ leagueProjection: 13.4, projection: 10.2 }), 13.4);
  assert.equal(weeklyProjectionValue({ leagueProjection: null, projection: 10.2 }), 10.2);
});

test("Start Sit normalizes every player to the platform-first weekly projection", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const start = source.indexOf("function StartSit(");
  const end = source.indexOf("type WaiverAddDropPlan", start);
  const component = source.slice(start, end);

  assert.match(component, /const startSitPlayers = useMemo/);
  assert.match(component, /projection: weeklyProjectionValue\(player\) \?\? 0/);
  assert.match(component, /startSitDecisions\(startSitPlayers\)/);
  assert.match(component, /weeklyProjectionValue\(player\) \?\? 0/);
  assert.match(component, /const openPlayer = useContext\(PlayerOpenContext\)/);
  assert.match(component, /rememberDecision\([\s\S]*?openPlayer\(player\)/);
});
