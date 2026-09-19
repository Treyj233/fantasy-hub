import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('shared membership gate is top-aligned without a viewport-height spacer', async () => {
  const css = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8');
  const rule = css.match(/\.page-content\.pro-gate-page\s*\{([^}]+)\}/)?.[1];
  assert.ok(rule);
  assert.match(rule, /min-height:\s*0\s*;/);
  assert.match(rule, /align-content:\s*start\s*;/);
  assert.match(rule, /align-items:\s*start\s*;/);
});

test('all full-page Pro and Elite gates use the shared layout', async () => {
  const source = await readFile(new URL('../app/FantasyHub.tsx', import.meta.url), 'utf8');
  const gates = [...source.matchAll(/<ProGate feature="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(gates.sort(), [
    'Command Center', 'League Stories', 'Manager Report Card', 'League Analytics',
    'Vegas Edge', 'Team Review', 'Season Simulator',
  ].sort());
  assert.match(source, /className="page-content pro-gate-page"/);
});
