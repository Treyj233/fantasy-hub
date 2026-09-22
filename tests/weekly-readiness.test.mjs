import test from 'node:test';
import assert from 'node:assert/strict';
import { weeklyCoverage } from '../app/weekly-readiness.mjs';
const games = [{ away: { abbreviation: 'BUF' }, home: { abbreviation: 'MIA' } }, { away: { abbreviation: 'KC' }, home: { abbreviation: 'JAX' } }];
const players = teams => teams.map(team => ({ team, projection: 10 }));
test('Thursday-only projections cannot become full weekly rankings', () => {
  assert.equal(weeklyCoverage(players(['BUF','MIA']), games).ready, false);
  assert.deepEqual(weeklyCoverage(players(['BUF','MIA']), games).missing, ['KC','JAX']);
});
test('full scheduled coverage accepts aliases and does not require bye teams', () => {
  assert.equal(weeklyCoverage(players(['BUF','MIA','KC','JAC']), games).ready, true);
  assert.equal(weeklyCoverage(players(['BUF','MIA']), []).ready, false);
  assert.equal(weeklyCoverage([{team:'BUF',projection:0}], games).ready, false);
});
