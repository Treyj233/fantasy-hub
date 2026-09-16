import test from 'node:test';
import assert from 'node:assert/strict';
import { randomOwnedLook } from '../app/random-owned-look.mjs';

test('no themes or no icons cannot generate a look', () => {
  assert.equal(randomOwnedLook([], [{id:'a'}]), null);
  assert.equal(randomOwnedLook([{id:'a'}], []), null);
});
test('selection stays within owned items and avoids the active combination', () => {
  const themes = [{id:'a'}, {id:'b'}];
  const badges = [{id:'x'}, {id:'y'}];
  for (const value of [0, .3, .6, .9999]) {
    const look = randomOwnedLook(themes, badges, 'a', 'x', () => value);
    assert.ok(themes.includes(look.theme));
    assert.ok(badges.includes(look.badge));
    assert.notEqual(`${look.theme.id}:${look.badge.id}`, 'a:x');
  }
});
test('a single owned pair still works', () => {
  assert.deepEqual(randomOwnedLook([{id:'a'}], [{id:'x'}], 'a', 'x'), {theme:{id:'a'}, badge:{id:'x'}});
});
