import test from 'node:test';
import assert from 'node:assert/strict';
import { sundayPulseOutlooks } from '../app/sunday-pulse-outlook.mjs';

const player = (points, projection, gameProgress) => ({ isStarter: true, points, projection, gameProgress });
const team = (isMine, points, topPlayers) => ({ isMine, points, topPlayers, teamName: isMine ? 'My team' : 'Rival' });
const snapshot = (status, players, points = 26) => ({ matchups: [{ status, teams: [team(true, points, players), team(false, 10, [player(10, 20, .5)])] }] });

test('live outlook adds remaining game-time forecast to actual score, even above original projection', () => {
  const result = sundayPulseOutlooks([{ id: 'a', name: 'League A' }], { a: snapshot('Live', [player(26, 20, .75)]) });
  assert.match(result[0], /My team 26.0/);
  assert.match(result[0], /Estimated finish 31.0 — 20.0/);
});
test('finished players have no forecast left; final matchups show only actual scores', () => {
  const leagues = [{ id: 'a', name: 'A' }];
  assert.match(sundayPulseOutlooks(leagues, { a: snapshot('Live', [player(3, 20, 1)], 3) })[0], /Estimated finish 3.0/);
  const final = sundayPulseOutlooks(leagues, { a: snapshot('Final', [player(3, 20, 1)], 3) })[0];
  assert.match(final, /FINAL/);
  assert.doesNotMatch(final, /finish|Projected/);
});
test('includes every connected league, scheduled matchups, and explicit unavailable data', () => {
  const rows = sundayPulseOutlooks([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }], {
    a: snapshot('Scheduled', [player(0, 20, 0)], 0),
    b: snapshot('Live', [player(0, 20, undefined)], 0),
  });
  assert.equal(rows.length, 3);
  assert.match(rows[0], /UP NEXT/);
  assert.match(rows[1], /Current projection unavailable/);
  assert.match(rows[2], /C · Matchup update unavailable/);
});
