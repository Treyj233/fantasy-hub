import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('overlays preserve sticky navigation on mobile and desktop without creating a body scroll container', () => {
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
  const guard = readFileSync(new URL('../app/use-overlay-guard.ts', import.meta.url), 'utf8');
  assert.match(css, /html\[data-overlay-open\] body\{overflow:clip!important;overscroll-behavior:none\}/);
  assert.match(guard, /focus\(\{ preventScroll: true \}\)/);
  assert.match(css, /html\[data-overlay-open\]\{overflow:hidden!important/);
  assert.doesNotMatch(css, /html\[data-overlay-open\] body\{overflow:hidden/);
  assert.match(css, /\.mobile-header-stack\{position:sticky;z-index:65;top:0;overflow:visible\}/);
  assert.match(guard, /toggleAttribute\("data-overlay-open", overlays.length > 0\)/);
  assert.match(guard, /dialog\[open\]/);
  assert.match(guard, /\.mobile-nav-open \.sidebar, \.mobile-category-menu/);
  assert.match(guard, /attributeFilter: \["open", "class", "aria-modal", "hidden"\]/);
  assert.match(guard, /addEventListener\("touchmove", blockBackground, \{ passive: false \}\)/);
  assert.doesNotMatch(guard, /preservePageScroll/);
});
