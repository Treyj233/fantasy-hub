import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("account shell is released before league enrichment completes", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const release = source.indexOf("setAccountLoading(false)");
  const enrichment = source.indexOf("Promise.allSettled", release);
  assert.ok(release >= 0 && enrichment > release);
});

test("portfolio scans and weather requests use bounded client caches", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  assert.match(source, /PORTFOLIO_CACHE_TTL = 30 \* 60 \* 1000/);
  assert.match(source, /PORTFOLIO_CACHE_VERSION = 2/);
  assert.match(source, /fantasy-hub-portfolio-scans:/);
  assert.match(source, /weatherRequestCache/);
  assert.match(source, /lastAutomaticScan/);
});

test("launch traffic is bounded and public provider data is edge cached", async () => {
  const [client, scoreboard, league, cache, loadTest] = await Promise.all([
    readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/scoreboard/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/league/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/upstream-cache.ts", import.meta.url), "utf8"),
    readFile(new URL("../loadtest/k6-smoke.js", import.meta.url), "utf8"),
  ]);
  assert.match(client, /mapWithConcurrency\(\s*leagues,\s*3,/);
  assert.match(client, /document\.visibilityState === "visible"/);
  assert.match(scoreboard, /fetchCachedUpstream/);
  assert.match(league, /fetchCachedUpstream/);
  assert.match(cache, /cacheEverything: true/);
  assert.match(cache, /"500-599": 0/);
  assert.match(loadTest, /target: 250/);
  assert.match(loadTest, /sleep\(30\)/);
});

test("initial league scan retries transient failures before showing a result", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  assert.match(source, /for \(let attempt = 0; attempt < 3; attempt \+= 1\)/);
  assert.match(source, /loading \|\| \(leagues\.length > 0 && !scans\.length\)/);
  assert.doesNotMatch(source, /League could not be scanned/);
});

test("large dashboard bundle loads behind a lightweight client shell", async () => {
  const source = await readFile(new URL("../app/FantasyHubLoader.tsx", import.meta.url), "utf8");
  assert.match(source, /dynamic\(\(\) => import\("\.\/FantasyHub"\)/);
  assert.match(source, /ssr: false/);
  assert.match(source, /Math\.min\(99/);
  assert.match(source, /roundedProgress/);
});

test("league scans expose visible determinate progress", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  assert.match(source, /const \[scanCompleted, setScanCompleted\] = useState\(0\)/);
  assert.match(source, /aria-label="Scanning connected leagues"/);
  assert.match(source, /useEstimatedLoadingProgress\(scanIsActive\)/);
  assert.match(source, /const visibleScanCount = Math\.min/);
  assert.match(source, /Math\.pow\(visibleScanProgress \/ 100, 1\.35\)/);
  assert.match(source, /About \{visibleScanCount\} of \{leagues\.length\} leagues scanned/);
});
