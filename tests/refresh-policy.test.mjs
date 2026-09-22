import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REFRESH, accountRefreshInterval, leagueRefreshKey, retryDelay } from '../app/refresh-policy.mjs';
import { rememberLeaguePage, readLeaguePage } from '../app/league-page-cache.mjs';

test('current-season queues exclude archived and old leagues, normalize ESPN identities', () => {
  const base = { status: 'live', season: '2026', provider: 'sleeper', identifier: '123456789' };
  assert.equal(leagueRefreshKey(base, 2026), '123456789');
  assert.equal(leagueRefreshKey({ ...base, season: '2025' }, 2026), null);
  assert.equal(leagueRefreshKey({ ...base, status: 'archived' }, 2026), null);
  assert.equal(leagueRefreshKey({ ...base, provider: 'espn' }, 2026), 'espn:2026:123456789');
  assert.equal(leagueRefreshKey({ ...base, provider: 'espn', identifier: 'espn:2025:123456789' }, 2026), null);
});
test('active users refresh every 15 minutes, inactive users every six hours, bounded retries', () => {
  const now = Date.parse('2026-09-20T12:00:00Z');
  assert.equal(accountRefreshInterval(new Date(now-60_000).toISOString(), now), 15*60_000);
  assert.equal(accountRefreshInterval('2026-09-01', now), 6*3600_000);
  assert.equal(REFRESH.live, 60_000);
  assert.equal(REFRESH.sleeperPerMinute, 500);
  assert.ok(retryDelay(5) > retryDelay(1));
  assert.equal(retryDelay(50), 6*3600_000);
});
test('preloaded pages survive navigation, but never cross account/week or exceed 32 entries', () => {
  const payload = { teams: [{ name: 'My team' }] };
  rememberLeaguePage('a', 'league', 2, payload, 1000);
  assert.equal(readLeaguePage('a', 'league', 2, 1001), payload);
  assert.equal(readLeaguePage('b', 'league', 2, 1001), null);
  assert.equal(readLeaguePage('a', 'league', 3, 1001), null);
  assert.equal(readLeaguePage('a', 'league', 2, 901000), null);
  for(let i=0;i<33;i++) rememberLeaguePage('a', String(i), 2, payload, 1000);
  assert.equal(readLeaguePage('a', '0', 2, 1001), null);
  assert.equal(readLeaguePage('a', '32', 2, 1001), payload);
});
test('Mission Hub scan lifetime is account/week scoped, not navigation scoped', () => {
  const src = readFileSync(new URL('../app/FantasyHub.tsx', import.meta.url), 'utf8');
  assert.match(src, /\{accountUser && \(\s*<AllLeagues/);
  assert.match(src, /key=\{`portfolio-\$\{accountUser.email\}-\$\{defaultGameWeek\}`\}/);
  assert.match(src, /active=\{view === "All Leagues"\}/);
  const scan = src.slice(src.indexOf('function AllLeagues'), src.indexOf('const issueCount = scans.reduce'));
  assert.match(scan, /\[leagueScanSignature, refreshKey, backgroundTick, onScansChange, cacheReady\]/);
  assert.match(scan, /savedScan = cachedAtScanStart.find/);
  assert.doesNotMatch(scan, /cacheActiveLeagueBootstrap\(/);
});
