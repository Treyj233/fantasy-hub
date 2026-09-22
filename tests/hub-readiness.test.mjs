import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadLeaguePage, rememberLeaguePage, readLeaguePage, restoreLeaguePages } from '../app/league-page-cache.mjs';

test('all seven leagues retain full projections after preload', () => {
  for (let i = 0; i < 7; i++) rememberLeaguePage('seven', `${i}`, 3, { rankings: [{ projection: i + 1 }] });
  for (let i = 0; i < 7; i++) assert.equal(readLeaguePage('seven', `${i}`, 3).rankings[0].projection, i + 1);
  assert.equal(readLeaguePage('another', '0', 3), null);
});
test('simultaneous launch and page requests share one request', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return { ok: true, json: async () => ({ league: { projectionWeek: 3 }, teams: [], projectionsReady: true }) }; });
  const [a,b] = await Promise.all([loadLeaguePage('shared','100',3),loadLeaguePage('shared','100',3)]);
  assert.equal(calls, 1);
  assert.equal(a, b);
  await loadLeaguePage('shared','100',3);
  assert.equal(calls, 1);
  await loadLeaguePage('shared','100',3,true);
  assert.equal(calls, 2);
});
test('wrong-week data and failed requests cannot satisfy readiness', async t => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ league: { projectionWeek: 2 } }) }));
  await assert.rejects(loadLeaguePage('wrong','101',3), /selected week/);
  assert.equal(readLeaguePage('wrong','101',3), null);
});
test('cached app is not hidden behind a readiness gate', () => {
  const app = readFileSync(new URL('../app/FantasyHub.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /launchBlocked|useHubReadiness/);
  assert.match(app, /void restoreLeaguePages/);
  assert.match(app, /networkApplied \|\| requestNumber !== importRequest.current/);
});
test('durable restore is account/week isolated and preserves newer network data', async () => {
  const now = Date.now();
  rememberLeaguePage('disk','fresh',3,{name:'network'},now);
  await restoreLeaguePages('disk', async () => ({entries:[
    [JSON.stringify(['disk','fresh',3]),{savedAt:now-1000,value:{name:'old'}}],
    [JSON.stringify(['disk','saved',3]),{savedAt:now-3600_000,value:{name:'saved'}}],
    [JSON.stringify(['other','private',3]),{savedAt:now,value:{name:'private'}}],
  ]}));
  assert.equal(readLeaguePage('disk','fresh',3).name,'network');
  assert.equal(readLeaguePage('disk','saved',3),null);
  assert.equal(readLeaguePage('disk','saved',3,now,true).name,'saved');
  assert.equal(readLeaguePage('disk','saved',4,now,true),null);
  assert.equal(readLeaguePage('other','private',3),null);
});
test('next-week preparation preserves current snapshots and existing job budget', () => {
  const route = readFileSync(new URL('../app/api/league/route.ts', import.meta.url), 'utf8');
  assert.match(route, /leagueKey: week === calendar.currentWeek \? id : `\$\{id\}:week:\$\{week\}`/);
  assert.match(route, /leagueKey: projectionWeek === calendar.currentWeek \? id : `\$\{id\}:week:\$\{projectionWeek\}`/);
  assert.match(route, /cached.league.currentWeek = calendar.currentWeek/);
  const worker = readFileSync(new URL('../app/background-league-refresh.ts', import.meta.url), 'utf8');
  assert.match(worker, /timeZone: 'America\/Chicago'/);
  assert.match(worker, /\[\.\.\.upcoming, \.\.\.due.map/);
  assert.match(worker, /slice\(0, REFRESH.jobsPerTick\)/);
  assert.match(worker, /week: String\(item.week\)/);
});
