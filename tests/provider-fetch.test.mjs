import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { REFRESH } from '../app/refresh-policy.mjs';
import { applyRosterSnapshot } from '../app/roster-snapshot.mjs';
function wrapper(t, permitted = true) {
  let calls = 0, tokens = 0, blocked = 0, status = 200;
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    assert.equal(init.cache, undefined, 'Cloudflare cache policy must not conflict with browser cache modes');
    calls++; return new Response('{}', { status, headers: { 'retry-after': '120' } });
  });
  const source = readFileSync(new URL('../app/api/provider-fetch.ts', import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
  const compiled = ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 });
  const fetcher = new Function('takeProviderToken','blockProvider','REFRESH',compiled+';return providerFetch;')(
    async () => { tokens++; return permitted; }, async () => { blocked++; }, REFRESH);
  return { fetcher, count:()=>({calls,tokens,blocked}), status: n=>status=n };
}
test('concurrent public requests share one upstream call, while explicit refresh bypasses memory', async t => {
  const f = wrapper(t);
  const responses = await Promise.all(Array.from({length:8},()=>f.fetcher('https://api.sleeper.app/v1/league/123456/rosters')));
  assert.equal(f.count().calls,1);
  for(const response of responses) assert.deepEqual(await response.json(),{});
  await f.fetcher('https://api.sleeper.app/v1/league/123456/rosters',{cache:'no-store'});
  assert.equal(f.count().tokens,1);
  await f.fetcher('https://api.sleeper.app/v1/league/123456/rosters',{cache:'reload'});
  assert.equal(f.count().calls,2);
});
test('exhausted budget never reaches provider; real 429 responses establish shared backoff', async t => {
  const f = wrapper(t,false);
  assert.equal((await f.fetcher('https://api.sleeper.app/v1/league/123456/rosters')).status,429);
  assert.equal(f.count().calls,0);
});
test('provider 429 is not cached and schedules backoff', async t => {
  const f = wrapper(t); f.status(429);
  assert.equal((await f.fetcher('https://api.sleeper.app/v1/league/123456/rosters')).status,429);
  assert.equal(f.count().blocked,1);
});
test('roster overlay applies starter swaps, additions, IR and drops without changing projection freshness', () => {
  const a={id:'a',role:'WR'},b={id:'b',role:'Bench'},c={id:'c',role:'Bench'},d={id:'d',role:'Player pool'};
  const payload={rankings:[d],rankingContext:{rosterSlots:['WR']},teams:[{id:'1',roster:[a,b,c]}],waiverPlayers:[d]};
  const next=applyRosterSnapshot(payload,[{roster_id:1,players:['a','b','d'],starters:['b'],reserve:['a']}]);
  assert.deepEqual(next.teams[0].roster.map(p=>[p.id,p.role]),[['b','WR'],['a','IR'],['d','Bench']]);
  assert.equal(next.waiverPlayers.length,0);
  assert.equal(payload.teams[0].roster[0].role,'WR');
  assert.equal(applyRosterSnapshot(payload,[{roster_id:1,players:['unknown'],starters:[]}]).teams[0],payload.teams[0]);
});
