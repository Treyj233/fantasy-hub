import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { consolidateAlerts } from '../app/push-alert-digest.mjs';
const alert=(key,leagueName,category='KICKOFF_SOON')=>({key,leagueName,category,title:'Kickoff soon',body:`${leagueName} starters lock soon.`});
test('in-game delivery only generates scoring and final results, not recurring status alerts',()=>{
  const source=readFileSync(new URL('../app/api/notifications/run/route.ts',import.meta.url),'utf8');
  assert.doesNotMatch(source,/category: "(?:SLATE_STARTED|CLOSE_GAME|PATH_TO_VICTORY)"/);
  assert.match(source,/category: "BIG_PLAY"/);
  assert.match(source,/category: "MATCHUP_RESULT"/);
});
test('same category across leagues produces one push retaining every source key',()=>{
  const rows=consolidateAlerts([alert('a','League A'),alert('b','League B'),alert('a','League A')]);
  assert.equal(rows.length,1);
  assert.deepEqual(rows[0].sourceKeys,['a','b']);
  assert.match(rows[0].body,/League A.*League B/);
});
test('different categories remain separate and urgency is retained',()=>{
  const rows=consolidateAlerts([alert('a','A'),{...alert('b','B'),urgent:true},alert('c','A','MATCHUP_RESULT')]);
  assert.equal(rows.length,2);assert.equal(rows[0].urgent,true);
});
test('large portfolios stay within bounded push text',()=>{
  const rows=consolidateAlerts(Array.from({length:60},(_,i)=>alert(String(i),`League ${i}`)));
  assert.equal(rows.length,1);assert.ok(rows[0].body.length<650);assert.equal(rows[0].sourceKeys.length,60);
  assert.deepEqual(consolidateAlerts([]),[]);
});
