import test from 'node:test';
import assert from 'node:assert/strict';
import { hideFinishedWeeklyGame } from '../app/weekly-ranking-visibility.mjs';
import { scheduleResultStatus } from '../app/schedule-result-status.mjs';

test('recorded season results remove finished players the following day', () => {
  const date = new Date(2026, 8, 10, 19).toISOString();
  const nextDay = new Date(2026, 8, 11, 12);
  assert.equal(hideFinishedWeeklyGame({ date, status: scheduleResultStatus(10, 13) }, nextDay), true);
  assert.equal(scheduleResultStatus(0, 13), 'Final');
  assert.equal(scheduleResultStatus(0, 0), 'Final');
  for (const scores of [[null, null], [10, null], [undefined, 13], [NaN, 13]]) {
    assert.equal(hideFinishedWeeklyGame({ date, status: scheduleResultStatus(...scores) }, nextDay), false);
  }
});

test('weekly players remain on game day and disappear the next local calendar day', () => {
  const game = { status: 'Final', date: new Date(2026, 8, 10, 19).toISOString() };
  assert.equal(hideFinishedWeeklyGame(game, new Date(2026, 8, 10, 23, 59)), false);
  assert.equal(hideFinishedWeeklyGame(game, new Date(2026, 8, 11, 0)), true);
  assert.equal(hideFinishedWeeklyGame({ ...game, status: 'In Progress' }, new Date(2026, 8, 11)), false);
  assert.equal(hideFinishedWeeklyGame({ ...game, date: 'unknown' }), false);
  assert.equal(hideFinishedWeeklyGame(null), false);
});
