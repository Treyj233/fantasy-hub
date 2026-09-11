import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../app/ScoreboardSectionNav.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

test('theme hover glows exclude section navigation in both light and dark themes', () => {
  assert.equal(css.match(/:not\(\.sidebar button\):not\(\.scoreboard-section-nav button\):hover/g)?.length, 2);
  assert.match(css, /\.scoreboard-section-nav>button:focus-visible>i\{box-shadow:/);
});

test('Overview targets the document top without sticky clearance', () => {
  assert.match(source, /top: index === 0 \? 0 : Math\.max/);
});

test('Overview remains active at the top and does not use the pulse flow position', () => {
  assert.match(source, /if \(window\.scrollY <= 2\) current = indices\[0\] \?\? 0/);
  assert.doesNotMatch(source, /pulse\?\.getBoundingClientRect\(\)\.bottom/);
});
