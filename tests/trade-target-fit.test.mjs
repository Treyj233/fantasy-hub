import test from 'node:test';
import assert from 'node:assert/strict';
import { tradeMatchesTarget } from '../app/trade-target-fit.mjs';
const wr = value => ({ position: 'WR', value });
const rb = value => ({ position: 'RB', value });
test('Any filter cannot suggest a better RB plus another player for a worse or equal RB', () => {
  for (const positions of [[], ['RB'], ['RB', 'WR']]) {
    assert.equal(tradeMatchesTarget([rb(99), wr(40)], [rb(90)], positions), false);
    assert.equal(tradeMatchesTarget([rb(99), rb(40)], [rb(99)], positions), false);
    assert.equal(tradeMatchesTarget([rb(90), wr(40)], [rb(91)], positions), false);
    assert.equal(tradeMatchesTarget([rb(80), wr(40)], [rb(95)], positions), true);
  }
});
test('receiver help means new receivers or a meaningful cross-position package upgrade', () => {
  assert.equal(tradeMatchesTarget([wr(70)], [wr(72)], ['WR']), false);
  assert.equal(tradeMatchesTarget([wr(70), wr(50)], [wr(85)], ['WR']), false);
  assert.equal(tradeMatchesTarget([wr(70), rb(50)], [wr(72)], ['WR']), false);
  assert.equal(tradeMatchesTarget([wr(70), rb(50)], [wr(85)], ['WR']), true);
  assert.equal(tradeMatchesTarget([rb(70)], [wr(70)], ['WR']), true);
  assert.equal(tradeMatchesTarget([wr(70)], [rb(70)], ['WR']), false);
  assert.equal(tradeMatchesTarget([wr(70)], [rb(70)], []), true);
});
