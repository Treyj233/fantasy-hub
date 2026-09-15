import test from 'node:test';
import assert from 'node:assert/strict';
import { weeklyVisuals } from '../app/league-weekly-visuals.mjs';
const directory={a:{position:'QB',full_name:'Starter'},b:{position:'QB',full_name:'Bench'},c:{position:'QB',full_name:'Other'}};
const team=(rosterId,points,starters,players,playerPoints)=>({rosterId,teamName:`Team ${rosterId}`,points,starters,players,playerPoints});
const a=team(1,20,['a'],['a','b'],{a:20,b:30}),b=team(2,20,['c'],['c'],{c:20});
const games=[{week:1,teams:[a,b]}];
test('position spotlights preserve tied starters and separate bench leaders',()=>{
 const v=weeklyVisuals(games,games,directory,['QB','BN'],[a,b],1);
 assert.equal(v.starters.length,2); assert.ok(v.starters.every(p=>p.shared));
 assert.equal(v.bench[0].name,'Bench'); assert.equal(v.bench[0].points,30);
 assert.equal(v.efficiency.find(t=>t.rosterId===1).maximum,30);
 assert.equal(v.efficiency.find(t=>t.rosterId===1).actual,20);
 assert.equal(v.standings[0].ties,1); assert.ok(v.standings.every(t=>t.rank===1&&t.movement===null));
});
test('missing scoring never produces a false efficiency and incomplete history has no movement',()=>{
 const v=weeklyVisuals([{week:2,teams:[{...a,playerPoints:{a:20}},b]}],games,directory,['QB'],[a,b],2);
 assert.equal(v.efficiency.find(t=>t.rosterId===1).percent,null);
 assert.ok(v.standings.every(t=>!t.complete&&t.movement===null));
});
test('standings use cumulative results and capture rank movement',()=>{
 const first={week:1,teams:[{...a,points:10},{...b,points:20}]};
 const next={week:2,teams:[{...a,points:40},{...b,points:10}]};
 const v=weeklyVisuals([next],[first,next],directory,['QB'],[a,b],2);
 assert.equal(v.standings[0].rosterId,1); assert.equal(v.standings[0].pf,50);
 assert.equal(v.standings[0].pa,30); assert.equal(v.standings[0].movement,1);
});
