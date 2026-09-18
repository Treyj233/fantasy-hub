import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('desktop overlay avoids a body scroll container and focus-driven page jumps', () => {
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
  const guard = readFileSync(new URL('../app/use-overlay-guard.ts', import.meta.url), 'utf8');
  assert.match(css, /@media\(min-width:1100px\)\{html\[data-overlay-open\] body\{overflow:clip!important\}\}/);
  assert.match(guard, /focus\(\{ preventScroll: true \}\)/);
  assert.match(css, /html\[data-overlay-open\],html\[data-overlay-open\] body\{overflow:hidden!important/);
  assert.match(guard, /toggleAttribute\("data-overlay-open", overlays.length > 0\)/);
  assert.match(guard, /dialog\[open\]/);
  assert.match(guard, /\.mobile-nav-open \.sidebar, \.mobile-category-menu/);
  assert.match(guard, /attributeFilter: \["open", "class", "aria-modal", "hidden"\]/);
  assert.match(guard, /addEventListener\("touchmove", blockBackground, \{ passive: false \}\)/);
  assert.doesNotMatch(guard, /preservePageScroll/);
});
