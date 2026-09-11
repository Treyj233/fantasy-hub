import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('player detail polish preserves readable labels and balanced mobile summary', async () => {
  const css = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8');
  assert.match(css, /\.player-panel\.player-dossier>header\{top:0;margin:0/);
  assert.match(css, /\.player-panel\.player-dossier>header \.close\{width:44px;height:44px/);
  assert.match(css, /\.player-dossier \.dossier-player-identity h2\{white-space:normal;overflow-wrap:anywhere/);
  assert.match(css, /\.player-dossier \.player-range-command>header small\{display:block\}/);
  assert.match(css, /\.player-dossier \.player-decision-rail article:nth-child\(n\+4\)\{grid-column:span 3\}/);
});
