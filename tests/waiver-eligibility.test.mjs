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

test("ADP offers direct Sleeper and ESPN sources without consensus or FantasyPros data", async () => {
  const [route, hub, adpData, espn] = await Promise.all([
    readFile(new URL("../app/api/league/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/adp-data.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/espn.ts", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(route, /fantasypros/i);
  assert.doesNotMatch(route, /Consensus/);
  assert.match(route, /"Sleeper Single-QB": directSleeperSingleQbAdp/);
  assert.match(route, /"Sleeper Superflex": directSleeperSuperflexAdp/);
  assert.match(hub, /const \[adpSite, setAdpSite\] = useState<"Sleeper" \| "ESPN">\("Sleeper"\)/);
  assert.match(hub, /ESPN \(Single-QB\) \{adpSite === "ESPN" \? adpDirection === "asc" \? "↑" : "↓" : ""\}/);
  assert.match(hub, /ESPN Single-QB platform ADP reflects ESPN's redraft market/);
  assert.match(hub, /const \[sleeperAdpFormat, setSleeperAdpFormat\] = useState<"Single-QB" \| "Superflex">\("Single-QB"\)/);
  assert.match(hub, /adpSite === "ESPN" \? "ESPN" : `Sleeper \$\{sleeperAdpFormat\}`/);
  assert.match(hub, /aria-label="Select Sleeper ADP format"/);
  assert.match(adpData, /leaguedefaults\/3\?view=kona_player_info/);
  assert.match(adpData, /averageDraftPosition/);
  assert.match(adpData, /loadSleeperAdpByPlayerKey/);
  assert.match(espn, /adpBySite: \{ Sleeper: sleeperLeagueFormat, "Sleeper Single-QB": sleeperSingleQb, "Sleeper Superflex": sleeperSuperflex, ESPN:/);
  assert.doesNotMatch(hub, /"Consensus"/);
});

test("ADP league settings use compact page-scoped badges", async () => {
  const [hub, styles] = await Promise.all([
    readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/player-ranks.css", import.meta.url), "utf8"),
  ]);

  assert.match(hub, /className="page-content adp-page"/);
  assert.match(styles, /\.adp-page \.ranking-context span\s*\{[^}]*min-height:\s*26px;[^}]*padding:\s*4px 8px;[^}]*font-size:\s*7px;/s);
});

test("waiver order and recommendations use position-normalized projections with league-filtered trends", async () => {
  const route = await readFile(new URL("../app/api/league/route.ts", import.meta.url), "utf8");
  const hub = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(route, /players\/nfl\/trending\/add\?lookback_hours=24&limit=100/);
  assert.match(route, /players\/nfl\/trending\/drop\?lookback_hours=24&limit=100/);
  assert.match(route, /projectionStats = new Map/);
  assert.match(route, /player\.waiverProjection - stats\.mean\) \/ stats\.deviation/);
  assert.match(route, /Number\(b\.waiverProjection > 0\) - Number\(a\.waiverProjection > 0\)/);
  assert.match(route, /leagueProjections\.has\(playerId\) \? platformProjection : projectedPoints/);
  assert.match(route, /b\.normalizedProjectionScore - a\.normalizedProjectionScore/);
  assert.match(route, /waiverRank: index \+ 1/);
  assert.match(route, /availableById\.get\(row\.player_id\)/);
  assert.match(route, /\.slice\(0, 5\)/);
  assert.match(hub, /add\.waiverRank \?\? add\.overallRank/);
  assert.match(hub, /title: "Trending Up"/);
  assert.match(hub, /title: "Trending Down"/);
  assert.match(hub, /NORMALIZED RANK/);
  assert.match(hub, /player\.waiverProjection\.toFixed\(1\)/);
  assert.match(styles, /\.waiver-trending-grid/);
});
