import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('paired matchup rosters reserve equal border space and retain the owner accent', () => {
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
  assert.match(css, /\.head-to-head-grid>\.head-to-head-team\{border-top-width:4px\}/);
  assert.match(css, /\.head-to-head-grid>\.head-to-head-team\.mine\{border-top-color:var\(--gold\)\}/);
  assert.match(css, /html\[data-theme="dark"\] \.head-to-head-grid>\.head-to-head-team\.mine\{border-top-color:var\(--gold\)\}/);
  assert.match(css, /\.head-to-head-team>header\{height:112px;box-sizing:border-box/);
});
