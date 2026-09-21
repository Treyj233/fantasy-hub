import test from 'node:test';
import assert from 'node:assert/strict';
import { myTeamScore, playerPanelScore } from '../app/my-team-score.mjs';
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
test('popout kickoff replaces a stale zero-progress projection even before clock data arrives', () => {
  const game={date:'2026-09-20T17:00:00Z',status:'Scheduled'};
  const now=Date.parse(game.date);
  assert.deepEqual(playerPanelScore(18,{player:{gameProgress:0,points:0},status:'Scheduled'},game,false,now),{label:'LIVE',value:0});
  assert.deepEqual(playerPanelScore(18,undefined,game,false,now),{label:'LIVE',value:null});
  assert.deepEqual(playerPanelScore(18,undefined,{...game,status:'Final'},false,now),{label:'FINAL',value:null});
  assert.deepEqual(playerPanelScore(18,{player:{points:-2}}, {...game,status:'Final'},false,now),{label:'FINAL',value:-2});
  assert.deepEqual(playerPanelScore(18,undefined,{...game,status:'Postponed'},false,now),{label:'PROJ',value:18});
});
