import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLeagueOwner } from '../app/league-owner.mjs';
import { applyRosterSnapshot } from '../app/roster-snapshot.mjs';
import { loadLeaguePage, readLeaguePage, rememberLeaguePage, subscribeLeaguePage } from '../app/league-page-cache.mjs';
import { saveSeasonCalendar, savedSeasonCalendar } from '../app/season-calendar-cache.mjs';
import { fantasyWeek } from '../app/fantasy-week.mjs';

test('missing roster ID resolves verified owner/co-owner; never guesses by name', () => {
  const teams = [{ id:'6', ownerId:'owner', teamName:'Family Ties' },{ id:'2', ownerId:'other',coOwnerIds:['co'] }];
  assert.equal(resolveLeagueOwner(teams, null, 'owner').id, '6');
  assert.equal(resolveLeagueOwner(teams, '', 'co').id,'2');
  assert.equal(resolveLeagueOwner(teams, null, 'missing'),null);
  assert.equal(resolveLeagueOwner(teams, '2', 'owner').id,'2');
  assert.equal(resolveLeagueOwner([...teams,{id:'3',ownerId:'owner'}], null, 'owner'),null);
});
test('lineup overlay flags unknown additions instead of silently declaring roster fresh', () => {
  const old = { teams:[{id:'1', roster:[{id:'a',role:'QB'},{id:'b',role:'Bench'}]}],rankingContext:{rosterSlots:['QB']} };
  const swap = applyRosterSnapshot(old,[{roster_id:1,players:['a','b'],starters:['b']}]);
  assert.equal(swap.teams[0].roster[0].id,'b');
  assert.equal(swap.teams[0].roster[0].role,'QB');
  assert.equal(swap.rosterNeedsRebuild,false);
  assert.equal(applyRosterSnapshot(old,[{roster_id:1,players:['a','new'],starters:['a']}]).rosterNeedsRebuild,true);
});
test('page reuse cannot renew model age and a one-minute roster check reaches server', async t => {
  let now = Date.parse('2026-09-22T15:00:00Z'), calls=0;
  t.mock.method(Date,'now',()=>now);
  t.mock.method(globalThis,'fetch',async()=>({ok:true,json:async()=>({league:{projectionWeek:3},cache:{refreshedAt:new Date(now).toISOString()},teams:[{id:String(++calls)}]})}));
  const value=await loadLeaguePage('aging','1',3);
  now+=59_000;
  rememberLeaguePage('aging','1',3,value);
  await loadLeaguePage('aging','1',3);
  assert.equal(calls,1);
  now+=2_000;
  await loadLeaguePage('aging','1',3);
  assert.equal(calls,2);
  const source={league:{projectionWeek:3},cache:{refreshedAt:new Date(now-3600_000).toISOString()}};
  rememberLeaguePage('aging','old',3,source);
  assert.equal(readLeaguePage('aging','old',3),null);
  assert.equal(readLeaguePage('aging','old',3,now,true),source);
});
test('background readers rebuild stale models once and broadcast the fresh roster',async t=>{
  let calls=0;const updates=[];
  const stop=subscribeLeaguePage('rebuild','2',3,data=>updates.push(data.cache.status));t.after(stop);
  t.mock.method(globalThis,'fetch',async url=>({ok:true,json:async()=>{
    calls++;return {league:{projectionWeek:3},cache:{refreshedAt:new Date().toISOString(),status:url.includes('refresh=1')?'refreshed':'stale'}};
  }}));
  const [a,b]=await Promise.all([loadLeaguePage('rebuild','2',3),loadLeaguePage('rebuild','2',3)]);
  assert.equal(calls,2);assert.equal(a,b);assert.equal(a.cache.status,'refreshed');
  assert.deepEqual(updates,['stale','refreshed']);
});
test('outages preserve same-week data and back off instead of retry bursts',async t=>{
  let now=Date.parse('2026-09-22T15:00:00Z'),calls=0;t.mock.method(Date,'now',()=>now);
  const saved={league:{projectionWeek:3},cache:{refreshedAt:new Date(now-3600_000).toISOString()}};
  rememberLeaguePage('offline','3',3,saved);
  t.mock.method(globalThis,'fetch',async()=>{calls++;throw Error('offline');});
  assert.equal(await loadLeaguePage('offline','3',3),saved);
  assert.equal(await loadLeaguePage('offline','3',3),saved);assert.equal(calls,1);
  assert.equal(readLeaguePage('offline','3',3),null);
  now+=30_001;await loadLeaguePage('offline','3',3);assert.equal(calls,2);
  assert.equal(readLeaguePage('offline','3',4,now,true),null);
});
test('cold Tuesday uses saved kickoff calendar without loading last week as current', t=>{
  const map=new Map();const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{setItem:(k,v)=>map.set(k,v),getItem:k=>map.get(k)??null}});
  t.after(()=>{if(original)Object.defineProperty(globalThis,'localStorage',original);else delete globalThis.localStorage;});
  saveSeasonCalendar({season:2026,weeks:[{week:1,games:[{date:'2026-09-10T23:00:00Z'}]}]});
  assert.equal(fantasyWeek(savedSeasonCalendar(2026),Date.parse('2026-09-22T05:01:00Z')).currentWeek,3);
  assert.deepEqual(savedSeasonCalendar(2025),[]);
});
test('an older server response cannot overwrite a newer snapshot',async t=>{
  const now=Date.now();
  const latest={league:{projectionWeek:3},cache:{refreshedAt:new Date(now).toISOString()},teams:[{id:'new'}]};
  rememberLeaguePage('race','4',3,latest);
  t.mock.method(globalThis,'fetch',async()=>({ok:true,json:async()=>({league:{projectionWeek:3},cache:{refreshedAt:new Date(now-60_000).toISOString()},teams:[{id:'old'}]})}));
  assert.equal(await loadLeaguePage('race','4',3),latest);
  assert.equal(readLeaguePage('race','4',3),latest);
});
test('manual refresh during a normal read upgrades only once',async t=>{
  let calls=0,resolveFirst;
  const first=new Promise(resolve=>{resolveFirst=resolve;});
  t.mock.method(globalThis,'fetch',async url=>{
    calls++;if(!url.includes('refresh=1'))await first;
    return {ok:true,json:async()=>({league:{projectionWeek:3},cache:{refreshedAt:new Date().toISOString(),status:url.includes('refresh=1')?'refreshed':'fresh'}})};
  });
  const normal=loadLeaguePage('upgrade','5',3);
  const manual=loadLeaguePage('upgrade','5',3,true);
  const second=loadLeaguePage('upgrade','5',3,true);
  resolveFirst();await normal;
  assert.equal((await manual).cache.status,'refreshed');await second;
  assert.equal(calls,2);
});
