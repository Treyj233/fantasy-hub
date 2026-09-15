import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWinPathSaver, winPathRecordId } from '../app/win-path-persistence.mjs';
const payload = (leagueId='league-a', ids=['a'], at='2026-09-20T18:00:00Z') => ({leagueId,week:2,alternatives:ids.map(id=>({id,name:id,targetTotal:20})),information:{season:'2026',rosterId:'1',capturedAt:at}});
test('account, league, season, week, roster and player have independent keys',()=>{
  const original=['user','league',2,'player','2026','1'];
  const keys=[winPathRecordId(...original)];
  for(let i=0;i<original.length;i++){const values=[...original]; values[i]=`${values[i]}-different`; keys.push(winPathRecordId(...values));}
  assert.equal(new Set(keys).size,7);
});
test('failed saves retry and identical data is acknowledged only after success',async()=>{
  let calls=0;const save=createWinPathSaver(async()=>{if(++calls<3)throw Error('offline');},async()=>{});
  await save(payload()); assert.equal(calls,3);
  await save(payload()); assert.equal(calls,3);
});
test('exhausted retries remain eligible on next update',async()=>{
  let offline=true,calls=0; const save=createWinPathSaver(async()=>{calls++;if(offline)throw Error('offline');},async()=>{});
  await save(payload());assert.equal(calls,3);offline=false;
  await save(payload());assert.equal(calls,4);
});
test('updates during a pending save retain finished players and serialize writes',async()=>{
  const sent=[];let release;const blocked=new Promise(resolve=>{release=resolve;});
  const save=createWinPathSaver(async p=>{sent.push(p);if(sent.length===1)await blocked;},async()=>{});
  const first=save(payload('league-a',['a','b']));
  await save(payload('league-a',['b'],'2026-09-20T18:01:00Z'));
  release();await first;
  // The first acknowledged batch already retains A on the server; B can advance.
  assert.ok(sent[0].alternatives.some(t=>t.id==='a'));
  assert.ok(sent.every(p=>p.leagueId==='league-a'));
  await save(payload('league-b',['b']));assert.equal(sent.at(-1).leagueId,'league-b');
});
test('server isolates per-player writes and ignores out-of-order saves',()=>{
  const route=readFileSync(new URL('../app/api/decisions/route.ts',import.meta.url),'utf8');
  assert.match(route,/winPathRecordId\(user.userId, body.leagueId!, body.week!, target.id, season, rosterId\)/);
  assert.match(route,/setWhere: lt\(decisionMemory.updatedAt, observedAt\)/);
  assert.match(route,/if \(!Number.isFinite\(points\[target.id\]\)\) return \[\]/);
});
test('capture lives in app-level polling and no longer depends on play-feed cancellation',()=>{
  const app=readFileSync(new URL('../app/FantasyHub.tsx',import.meta.url),'utf8');
  const root=app.slice(0,app.indexOf('function AllLeagueScoreboard('));
  assert.match(root,/void winPathSaver\(/);
  assert.doesNotMatch(app,/savedWinPathPayloads/);
});
