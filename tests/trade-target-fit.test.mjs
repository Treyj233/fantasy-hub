import test from 'node:test';
import assert from 'node:assert/strict';
import { tradeMatchesTarget } from '../app/trade-target-fit.mjs';
const wr = value => ({ position: 'WR', value });
const rb = value => ({ position: 'RB', value });
test('receiver help means new receivers or a meaningful cross-position package upgrade', () => {
  assert.equal(tradeMatchesTarget([wr(70)], [wr(72)], ['WR']), false);
  assert.equal(tradeMatchesTarget([wr(70), wr(50)], [wr(85)], ['WR']), false);
  assert.equal(tradeMatchesTarget([wr(70), rb(50)], [wr(72)], ['WR']), false);
  assert.equal(tradeMatchesTarget([wr(70), rb(50)], [wr(85)], ['WR']), true);
  assert.equal(tradeMatchesTarget([rb(70)], [wr(70)], ['WR']), true);
  assert.equal(tradeMatchesTarget([wr(70)], [rb(70)], ['WR']), false);
  assert.equal(tradeMatchesTarget([wr(70)], [rb(70)], []), true);
});
