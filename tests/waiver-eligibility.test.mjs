import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("waiver pool rejects retired and inactive player-directory records", async () => {
  const source = await readFile(new URL("../app/api/league/route.ts", import.meta.url), "utf8");

  assert.match(source, /isCurrentFantasyPlayer/);
  assert.match(source, /retired\|inactive\|deceased/);
  assert.match(source, /!isCurrentFantasyPlayer\(player\)/);
  assert.match(source, /hasCurrentRoleSignal/);
  assert.match(source, /leagueProjections\.has\(playerId\)/);
  assert.match(source, /directSleeperAdp != null/);
  assert.match(source, /Boolean\(snapProfile\?\.games\)/);
  assert.match(source, /Boolean\(seasonProfile\?\.games\)/);
  assert.match(source, /if \(!hasCurrentRoleSignal\) return \[\]/);
});

test("league snapshots refresh when waiver eligibility rules change", async () => {
  const source = await readFile(new URL("../app/api/league/route.ts", import.meta.url), "utf8");

  assert.match(source, /LEAGUE_PAYLOAD_VERSION/);
  assert.match(source, /cached\.payloadVersion === LEAGUE_PAYLOAD_VERSION/);
  assert.match(source, /payloadVersion: LEAGUE_PAYLOAD_VERSION/);
});
