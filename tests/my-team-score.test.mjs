import test from 'node:test';
import assert from 'node:assert/strict';
import { myTeamScore } from '../app/my-team-score.mjs';
test('pregame projections stay projections even when other games are live', () => {
  assert.deepEqual(myTeamScore(18, {player:{gameProgress:0,points:0},status:'Live'}), {label:'PROJ',value:18});
});
test('live zero and negative scores replace projections', () => {
  for (const points of [0,-2,26]) assert.deepEqual(myTeamScore(18,{player:{gameProgress:.2,points},status:'Live'}),{label:'LIVE',value:points});
});
test('finished player retains actual score while fantasy matchup is still live', () => {
  assert.deepEqual(myTeamScore(18,{player:{gameProgress:1,points:4},status:'Live'}),{label:'FINAL',value:4});
});
test('missing data never becomes a made-up score', () => {
  assert.deepEqual(myTeamScore(null,undefined),{label:'PROJ',value:null});
  assert.deepEqual(myTeamScore(18,{player:{gameProgress:.5},status:'Live'}),{label:'LIVE',value:null});
});
