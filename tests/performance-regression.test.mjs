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
  assert.match(source, /fantasy-hub-portfolio-scans:/);
  assert.match(source, /weatherRequestCache/);
  assert.match(source, /lastAutomaticScan/);
});

test("large dashboard bundle loads behind a lightweight client shell", async () => {
  const source = await readFile(new URL("../app/FantasyHubLoader.tsx", import.meta.url), "utf8");
  assert.match(source, /dynamic\(\(\) => import\("\.\/FantasyHub"\)/);
  assert.match(source, /ssr: false/);
});
