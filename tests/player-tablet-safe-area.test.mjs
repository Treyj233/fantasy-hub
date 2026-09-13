import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('tablet player backdrop owns safe-area spacing, including large iPads',()=>{
  const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
  assert.match(css,/@media\(min-width:701px\) and \(pointer:coarse\)\{\s*\.modal-backdrop.player-modal-backdrop/);
  assert.match(css,/--player-safe-top:max\(48px,/);
  assert.match(css,/padding:var\(--player-safe-top\)/);
  assert.match(css,/max-height:calc\(100svh - var\(--player-safe-top\) - var\(--player-safe-bottom\)\)/);
});
