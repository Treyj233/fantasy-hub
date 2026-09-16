import test from 'node:test';
import assert from 'node:assert/strict';
import { kickoffState, activateScheduledScoreboard } from '../app/kickoff-status.mjs';

const date = '2026-09-17T20:15:00-04:00';
const kickoff = Date.parse(date);
test('scheduled kickoff activates live exactly at the boundary without a provider live flag', () => {
  assert.equal(kickoffState({ date, status: 'Scheduled' }, kickoff - 1), 'pre');
  assert.equal(kickoffState({ date, status: 'Scheduled' }, kickoff), 'in');
  assert.equal(kickoffState({ date: 'invalid' }, kickoff), 'pre');
});
test('final and postponed games do not reactivate at their original kickoff', () => {
  for (const status of ['Postponed', 'Canceled', 'Delayed', 'Suspended']) assert.equal(kickoffState({ date, status }, kickoff + 1000), 'pre');
  assert.equal(kickoffState({ date, state: 'post' }, kickoff + 1000), 'post');
});
test('client kickoff update preserves scores and final matchups', () => {
  const final = { status: 'Final', teams: [] };
  const data = { kickoffGames: [{ date }], matchups: [{ status: 'Scheduled', teams: [{ points: 10 }] }, final] };
  assert.equal(activateScheduledScoreboard(data, kickoff - 1), data);
  const live = activateScheduledScoreboard(data, kickoff);
  assert.equal(live.matchups[0].status, 'Live');
  assert.equal(live.matchups[0].teams, data.matchups[0].teams);
  assert.equal(live.matchups[1], final);
});
