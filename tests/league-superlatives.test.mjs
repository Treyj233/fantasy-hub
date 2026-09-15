import test from 'node:test';
import assert from 'node:assert/strict';
import { leagueSuperlatives } from '../app/league-superlatives.mjs';
const team = (id, points) => ({ rosterId: id, teamName: `Team ${id}`, points, players: ['a', 'b'], starters: ['a'], playerPoints: { a: 30, b: 40 } });
const games = [{ teams: [team(1, 120), team(2, 110)] }, { teams: [team(3, 80), team(4, 70)] }];
test('awards use actual wins, losses, starters, and bench scores', () => {
  const awards = leagueSuperlatives(games, [], (id) => id);
  assert.equal(awards.find(a => a.id === 'hard-luck').recipient, 'Team 2');
  assert.equal(awards.find(a => a.id === 'just-enough').recipient, 'Team 3');
  assert.equal(awards.find(a => a.id === 'shootout').detail, '230.0 combined points');
  assert.match(awards.find(a => a.id === 'mvp').detail, /30.0.*Shared honors/);
  assert.match(awards.find(a => a.id === 'bench-spark').detail, /40.0/);
  assert.equal(awards.some(a => a.id === 'bounce-back'), false);
});
test('bounce-back requires prior-week data and a positive improvement', () => {
  const awards = leagueSuperlatives(games, [{ teams: [team(1, 90), team(2, 130)] }], String);
  assert.equal(awards.find(a => a.id === 'bounce-back').recipient, 'Team 1');
});
test('ties do not earn winning or losing awards; missing stats do not earn player awards', () => {
  const a = { ...team(1, 90), playerPoints: {} };
  const b = { ...team(2, 90), playerPoints: {} };
  assert.deepEqual(leagueSuperlatives([{ teams: [a, b] }], [], String).map(a => a.id), ['shootout']);
  assert.deepEqual(leagueSuperlatives([], [], String), []);
});
