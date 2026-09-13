import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import { portfolioProjectedFinish as finish } from '../app/portfolio-live-projection.mjs';
const team = (points, players) => ({ points, topPlayers: players.map(p => ({ isStarter:true, ...p })) });
test('Fantasy Matchups uses live projected finishes for both teams',()=>{
  const source=readFileSync(new URL('../app/FantasyHub.tsx',import.meta.url),'utf8');
  assert.match(source,/status \? portfolioProjectedFinish\(team, status\) : projectedTeamTotal\(team\)/);
  for(const side of ['firstTeam','secondTeam'])assert.ok(source.includes(`<ScoreWithProjection team={${side}} status={matchup.status} />`));
});
test('mixed roster finish uses actual scores, remaining live forecast and unstarted players, not bench',()=>{
  const mixed=team(30,[{projection:20,gameProgress:1},{projection:20,gameProgress:.5},{projection:15,gameProgress:0},{isStarter:false,projection:40,gameProgress:0}]);
  assert.equal(finish(mixed,'Live'),55);
  mixed.topPlayers[2].projection=18;
  assert.equal(finish(mixed,'Live'),58);
});
test('live finish adds only the remaining share, even after beating forecast', () => {
  assert.equal(finish(team(26, [{projection:20, gameProgress:.75}]), 'Live'), 31);
});
test('finished players and final matchups use actual scores', () => {
  assert.equal(finish(team(4, [{projection:20, gameProgress:1}]), 'Live'), 4);
  assert.equal(finish(team(4, []), 'Final'), 4);
});
test('pregame uses current forecast; missing live data does not invent a total', () => {
  assert.equal(finish(team(0, [{projection:20}]), 'Scheduled'), 20);
  assert.equal(finish(team(4, [{projection:20}]), 'Live'), null);
  assert.equal(finish(undefined, 'Live'), null);
  assert.equal(finish(team(0, [{projection:null,gameProgress:0}]), 'Scheduled'), null);
});
