import test from 'node:test';
import assert from 'node:assert/strict';
import { portfolioProjectedFinish as finish } from '../app/portfolio-live-projection.mjs';
const team = (points, players) => ({ points, topPlayers: players.map(p => ({ isStarter:true, ...p })) });
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
