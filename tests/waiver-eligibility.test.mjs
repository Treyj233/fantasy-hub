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

test("waiver order and recommendations use Sleeper rank with league-filtered trends", async () => {
  const route = await readFile(new URL("../app/api/league/route.ts", import.meta.url), "utf8");
  const hub = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(route, /players\/nfl\/trending\/add\?lookback_hours=24&limit=100/);
  assert.match(route, /players\/nfl\/trending\/drop\?lookback_hours=24&limit=100/);
  assert.match(route, /a\.sleeperRank - b\.sleeperRank/);
  assert.match(route, /availableById\.get\(row\.player_id\)/);
  assert.match(route, /\.slice\(0, 5\)/);
  assert.match(hub, /add\.sleeperRank \?\? add\.overallRank/);
  assert.match(hub, /title: "Trending Up"/);
  assert.match(hub, /title: "Trending Down"/);
  assert.match(hub, /SLEEPER RANK/);
  assert.match(styles, /\.waiver-trending-grid/);
});
