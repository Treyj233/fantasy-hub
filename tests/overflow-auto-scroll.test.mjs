import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const source = readFileSync(new URL('../public/auto-scroll-overflow.js', import.meta.url), 'utf8');
test('overflow text remains React-owned and static; pulse excluded', () => {
  assert.doesNotMatch(source, /\.animate\(|requestAnimationFrame|setInterval|el\.textContent\s*=/);
  assert.match(source, /\.sunday-pulse/);
  assert.match(source, /el\.scrollWidth > el\.clientWidth \+ 3/);
});
test('reveal supports keyboard, outside dismissal, and existing navigation', () => {
  for (const event of ['focusin','click','keydown','pointerdown','scroll']) assert.ok(source.includes("'" + event + "'"));
  assert.match(source, /event.key === 'Escape'/);
  assert.match(source, /\['Enter', ' '\]/);
  assert.match(source, /!el\.closest\(interactive\)/);
  assert.doesNotMatch(source, /stopPropagation/);
});
test('popover fits visual viewport and safe area without layout expansion', () => {
  assert.match(source, /window.visualViewport/);
  assert.match(source, /safeTop/);
  assert.match(source, /safeBottom/);
  assert.match(source, /setAttribute\('popover', 'manual'\)/);
  assert.match(source, /popup.style.maxHeight/);
});
