import test from 'node:test';
import assert from 'node:assert/strict';
import { simulationInsights, playoffByeCount } from '../app/simulation-insights.mjs';
const player = (position, extra = {}) => ({name:position, position, projection:15,status:'Healthy',...extra});
const starters=['QB','RB','WR','TE'].map(p=>player(p));
test('top starter ranks are strengths, not weaknesses',()=>{
 const r=simulationInsights({strengthRank:1,teamCount:12,starters,bench:starters});
 assert.match(r.topDrivers[0],/#1 of 12/);
 assert.deepEqual(r.riskDrivers,[]);
});
test('lower starter ranks and missing bench coverage are actionable concerns',()=>{
 const r=simulationInsights({strengthRank:10,teamCount:12,starters,bench:[]});
 assert.equal(r.topDrivers.length,0);
 assert.match(r.riskDrivers[0],/#10 of 12/);
 assert.match(r.riskDrivers[1],/QB, RB, WR, TE/);
});
test('availability and low projections are evaluated independently',()=>{
 const r=simulationInsights({strengthRank:1,teamCount:12,starters:[player('QB',{status:'Out'}),player('WR',{projection:1})],bench:starters});
 assert.equal(r.riskDrivers.length,2);
 assert.match(r.riskDrivers[0],/availability/);
 assert.match(r.riskDrivers[1],/below 2/);
});
test('bye spots reflect playoff bracket size',()=>{
 assert.equal(playoffByeCount(6),2);assert.equal(playoffByeCount(4),0);
 assert.equal(playoffByeCount(8),0);assert.equal(playoffByeCount(12),4);
 assert.equal(playoffByeCount(undefined),0);
});
