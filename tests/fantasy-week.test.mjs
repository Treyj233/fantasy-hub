import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fantasyWeek, requestedFantasyWeek } from '../app/fantasy-week.mjs';
const games = [{week:1,date:'2026-09-10T23:00:00Z'}];
test('Monday remains week one; Tuesday midnight Central becomes week two', () => {
  assert.equal(fantasyWeek(games,'2026-09-15T04:59:59Z').currentWeek,1);
  assert.deepEqual(fantasyWeek(games,'2026-09-15T05:00:00Z'),{currentWeek:2,completedWeek:1,ready:true});
});
test('DST uses local Tuesday and season completion includes week eighteen',()=>{
  assert.equal(fantasyWeek(games,'2026-11-10T05:59:59Z').currentWeek,9);
  assert.equal(fantasyWeek(games,'2026-11-10T06:00:00Z').currentWeek,10);
  assert.equal(fantasyWeek(games,'2027-01-12T06:00:00Z').completedWeek,18);
});
test('preseason and missing schedules do not invent a completed week',()=>{
  assert.equal(fantasyWeek(games,'2026-08-01').completedWeek,0);
  assert.deepEqual(fantasyWeek([],Date.now(),2),{currentWeek:2,completedWeek:0,ready:false});
  for(const value of [null,'',0,19,2.5,'bad']) assert.equal(requestedFantasyWeek(value),null);
  assert.equal(requestedFantasyWeek('2'),2);
});
