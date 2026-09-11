import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../app/FantasyHub.tsx', import.meta.url), 'utf8');
const code = ts.transpile(source.slice(source.indexOf('function matchupAdjustedRange('), source.indexOf('function aggressionScore(')), { target: ts.ScriptTarget.ES2022 });
const range = new Function('matchupPosition', 'gameLineRange', `${code}; return matchupAdjustedRange;`)(position => position, value => value);

test('floor and ceiling do not change with fantasy roster placement', () => {
  for (const position of ['QB', 'RB', 'WR', 'TE']) {
    for (const matchupStrength of [undefined, { score: 20, games: 12 }, { score: 90, games: 12 }]) {
      const player = { position, projection: 20, trend: 0, status: 'Healthy', snapPct: 80, matchupStrength };
      const starter = range({ ...player, role: position });
      for (const role of ['BENCH', 'BN', 'FLEX', 'SUPER_FLEX', undefined]) {
        assert.deepEqual(range({ ...player, role }), starter);
      }
    }
  }
});

test('real usage and injury uncertainty still affect ranges', () => {
  const player = { position: 'WR', projection: 15, trend: 0, status: 'Healthy', snapPct: 90 };
  const baseline = range(player);
  for (const changed of [{ ...player, snapPct: 30 }, { ...player, status: 'Questionable' }]) {
    assert.ok(range(changed).ceiling > baseline.ceiling);
    assert.ok(range(changed).floor < baseline.floor);
  }
});
