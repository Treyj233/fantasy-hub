import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('season performance uses player position, not a nonexistent history field', async () => {
  const source = await readFile(new URL('../app/FantasyHub.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /season\.position\b/);
  assert.match(source, /\$\{player\.position \|\| "Position"\} #\$\{season\.positionRank\} · PPR/);
  assert.match(source, /PPR finish unavailable/);
  for (const field of ['points', 'pointsPerGame', 'yards', 'touchdowns', 'receptions']) {
    assert.ok(source.includes(`season.${field}`));
  }
});

test('compact season layout is scoped to season performance', async () => {
  const css = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8');
  assert.match(css, /\.player-dossier>\.season-performance\{padding:10px 12px\}/);
  assert.match(css, /\.season-performance \.season-history article\{grid-template-columns:minmax\(0,1fr\) auto/);
});
