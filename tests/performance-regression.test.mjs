import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("account shell is released before league enrichment completes", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const nativeRefresh = source.indexOf("const nativeEntitlementRefresh");
  const leagueEnrichmentStart = source.indexOf("const leagueEnrichment", nativeRefresh);
  const accountRequest = source.indexOf('fetch("/api/account")', leagueEnrichmentStart);
  const release = source.indexOf("setAccountLoading(false)");
  const enrichmentAwait = source.indexOf("await leagueEnrichment", release);
  assert.ok(nativeRefresh >= 0 && leagueEnrichmentStart > nativeRefresh && accountRequest > leagueEnrichmentStart);
  assert.ok(release >= 0 && enrichmentAwait > release);
  assert.doesNotMatch(source.slice(nativeRefresh, accountRequest), /await nativeEntitlementRefresh/);
});

test("portfolio scans preserve saved results while weather requests use a bounded client cache", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  assert.match(source, /PORTFOLIO_CACHE_VERSION = 2/);
  assert.match(source, /fantasy-hub-portfolio-scans:/);
  assert.match(source, /weatherRequestCache/);
  assert.match(source, /lastAutomaticScan/);
  assert.match(source, /cachedScansRef/);
  assert.match(source, /Showing saved results/);
});

test("launch traffic is bounded and public provider data is edge cached", async () => {
  const [client, scoreboard, sharedSleeper, league, cache, loadTest] = await Promise.all([
    readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/scoreboard/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/sleeper-shared-data.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/league/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/upstream-cache.ts", import.meta.url), "utf8"),
    readFile(new URL("../loadtest/k6-smoke.js", import.meta.url), "utf8"),
  ]);
  assert.match(client, /mapWithConcurrency\(\s*leagues,\s*3,/);
  assert.match(client, /document\.visibilityState === "visible"/);
  assert.match(scoreboard, /fetchCachedUpstream/);
  assert.match(league, /fetchCachedUpstream/);
  assert.match(scoreboard, /leagueConfiguration: 6 \* 60 \* 60/);
  assert.match(scoreboard, /matchupReconciliation: 15 \* 60/);
  assert.match(scoreboard, /rosterOwners: 60 \* 60/);
  assert.match(scoreboard, /leagueUsers: 60 \* 60/);
  assert.match(scoreboard, /sleeperFantasyPoints/);
  assert.match(scoreboard, /getSleeperWeeklyStats/);
  assert.match(scoreboard, /requestedScope === "mine"/);
  assert.match(scoreboard, /scopedGroups\.map/);
  assert.equal((client.match(/scope=mine/g) ?? []).length, 3);
  assert.match(client, /function Scoreboard[\s\S]+\/api\/scoreboard\?leagueId=\$\{encodeURIComponent\(leagueId\)\}\$\{query\}/);
  assert.match(sharedSleeper, /stats\/nfl\/regular\/\$\{season\}\/\$\{week\}`/);
  assert.match(sharedSleeper, /weeklyStatsRequest/);
  assert.match(sharedSleeper, /playerDirectoryRequest/);
  assert.match(league, /traded_picks[^\n]+cache: "no-store"/);
  assert.match(cache, /cacheEverything: true/);
  assert.match(cache, /"500-599": 0/);
  assert.match(loadTest, /target: 250/);
  assert.match(loadTest, /sleep\(30\)/);
});

test("initial league scan retries transient failures before showing a result", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  assert.match(source, /for \(let attempt = 0; attempt < 3; attempt \+= 1\)/);
  assert.match(source, /refreshing \|\| loading \|\| \(leagues\.length > 0 && scans\.length < leagues\.length\)/);
  assert.doesNotMatch(source, /League could not be scanned/);
});

test("large dashboard bundle loads behind a lightweight client shell", async () => {
  const source = await readFile(new URL("../app/FantasyHubLoader.tsx", import.meta.url), "utf8");
  assert.match(source, /dynamic\(\(\) => import\("\.\/FantasyHub"\)/);
  assert.match(source, /ssr: false/);
  assert.match(source, /LaunchSplash/);
  assert.match(source, /loading: InitialLoadingShell/);
});

test("league scans expose truthful determinate progress", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  assert.match(source, /const \[scanCompleted, setScanCompleted\] = useState\(0\)/);
  assert.match(source, /aria-label="Scanning connected leagues"/);
  assert.match(source, /scanCompleted \/ Math\.max\(1, leagues\.length\)/);
  assert.match(source, /const visibleScanCount = Math\.min/);
  assert.doesNotMatch(source, /useEstimatedLoadingProgress\(scanIsActive\)/);
  assert.match(source, /\$\{visibleScanCount\} of \$\{leagues\.length\} leagues scanned/);
});

test("Mission Hub scans are not aborted by equivalent league-array renders", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  assert.match(source, /const leagueScanSignature = leagues\.map\(\(league\) => league\.id\)\.sort\(\)\.join\(":"\)/);
  assert.match(source, /\[leagueScanSignature, refreshKey, onScansChange\]/);
  assert.doesNotMatch(source, /\[leagues, refreshKey, onScansChange\]/);
});
