import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('scoreboard command summary applies compact spacing to its interactive cards', async () => {
  const css = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8');
  const source = await readFile(new URL('../app/FantasyHub.tsx', import.meta.url), 'utf8');
  const section = source.slice(source.indexOf('<section className="game-day-command panel">'), source.indexOf('<dialog ref={commandDialog}'));
  assert.equal((section.match(/aria-haspopup="dialog"/g) ?? []).length, 4);
  assert.match(css, /\.game-day-command \.game-day-metrics>button\{min-height:44px;padding:9px 10px/);
  assert.match(css, /@media\(max-width:700px\)\{\s*\.game-day-command \.game-day-metrics>button\{padding:7px 8px\}/);
  assert.match(css, /\.game-day-command \.game-day-metrics>button strong\{[^}]*white-space:normal;overflow-wrap:anywhere/);
});
