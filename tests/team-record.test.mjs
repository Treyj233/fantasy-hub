import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTeamRecord } from '../app/team-record.mjs';
test('formats actual records including ties and preseason zeros', () => {
  assert.equal(formatTeamRecord({wins:3,losses:1,ties:0}), '3–1');
  assert.equal(formatTeamRecord({wins:2,losses:1,ties:1}), '2–1–1');
  assert.equal(formatTeamRecord({wins:0,losses:0}), '0–0');
});
test('missing records are not fabricated as zero wins and losses', () => {
  assert.equal(formatTeamRecord(undefined), null);
  assert.equal(formatTeamRecord({}), null);
});
