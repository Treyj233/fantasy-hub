import test from 'node:test';
import assert from 'node:assert/strict';
import { gameLineRange, gameLineSummary } from '../app/game-line-range.mjs';
const range = { floor: 8, ceiling: 20, edge: .1 };
test('missing lines and non-offensive positions leave ranges unchanged', () => {
  assert.deepEqual(gameLineRange(range, 14, 'WR'), range);
  assert.deepEqual(gameLineRange(range, 14, 'WR', { total: null, favoredBy: null }), range);
  assert.deepEqual(gameLineRange(range, 14, 'DEF', { total: 55, favoredBy: 10 }), range);
});
test('high scoring games raise ceiling and game script differentiates positions', () => {
  assert.ok(gameLineRange(range, 14, 'WR', { total: 54 }).ceiling > range.ceiling);
  assert.ok(gameLineRange(range, 14, 'RB', { favoredBy: 7 }).ceiling > gameLineRange(range, 14, 'RB', { favoredBy: -7 }).ceiling);
  for (const position of ['QB', 'WR', 'TE']) assert.ok(gameLineRange(range, 14, position, { favoredBy: -7 }).ceiling > gameLineRange(range, 14, position, { favoredBy: 7 }).ceiling);
});
test('extreme lines stay bounded and preserve range ordering', () => {
  for (const favoredBy of [-100, 100]) for (const total of [0, 200]) {
    const result = gameLineRange(range, 14, 'RB', { total, favoredBy });
    assert.ok(result.floor >= 0 && result.floor <= 14 && result.ceiling >= 14);
    assert.ok(result.ceiling <= 23 && result.floor >= 7.5);
  }
});
test('nflverse positive spread identifies home favorite; missing lines are not zero', () => {
  assert.equal(gameLineSummary({ total: 47.5, homeFavoredBy: 3, homeMoneyline: -150, awayMoneyline: 130 }, 'CHI', 'GB'), 'O/U 47.5 · GB -3 · CHI ML +130 · GB ML -150');
  assert.equal(gameLineSummary({ homeFavoredBy: -4 }, 'CHI', 'GB'), 'CHI -4');
  assert.equal(gameLineSummary({ total: null, homeFavoredBy: null }, 'CHI', 'GB'), '');
});
