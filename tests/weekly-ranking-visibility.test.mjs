import test from 'node:test';
import assert from 'node:assert/strict';
import { hideFinishedWeeklyGame } from '../app/weekly-ranking-visibility.mjs';

test('weekly players remain on game day and disappear the next local calendar day', () => {
  const game = { status: 'Final', date: new Date(2026, 8, 10, 19).toISOString() };
  assert.equal(hideFinishedWeeklyGame(game, new Date(2026, 8, 10, 23, 59)), false);
  assert.equal(hideFinishedWeeklyGame(game, new Date(2026, 8, 11, 0)), true);
  assert.equal(hideFinishedWeeklyGame({ ...game, status: 'In Progress' }, new Date(2026, 8, 11)), false);
  assert.equal(hideFinishedWeeklyGame({ ...game, date: 'unknown' }), false);
  assert.equal(hideFinishedWeeklyGame(null), false);
});
