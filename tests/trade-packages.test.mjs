import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../app/FantasyHub.tsx', import.meta.url), 'utf8');
const extract = (name, next) => ts.transpile(source.slice(source.indexOf(`function ${name}(`), source.indexOf(`function ${next}(`)), { target: ts.ScriptTarget.ES2022 });
const adjust = new Function(`${extract('tradePackageValueAdjustment', 'tradeAsset')}; return tradePackageValueAdjustment;`)();
const preservesDepth = new Function(`${extract('tradePreservesPositionDepth', 'buildTradeSuggestions')}; return tradePreservesPositionDepth;`)();
const asset = (value, id = String(value), position = 'WR') => ({ value, id, position, name: id, confidence: 'High' });

test('package premium grows beyond the old cap and is symmetric', () => {
  const star = [asset(99)];
  const two = [asset(65), asset(55)];
  const four = [...two, asset(40), asset(30)];
  const premium = adjust(star, two, null).send;
  assert.ok(premium > 45);
  assert.ok(adjust(star, four, null).send > premium);
  assert.deepEqual(adjust(two, star, null), { send: 0, receive: premium });
  assert.ok(premium > adjust([asset(78)], two, null).send);
  assert.deepEqual(adjust([], star, null), { send: 0, receive: 0 });
  assert.deepEqual(adjust(star, [asset(90)], null), { send: 0, receive: 0 });
});

test('suggestions evaluate and surface multi-player packages without duplicate assets', () => {
  const build = new Function('buildRankingLookup', 'rankingForPlayer', 'teamNeeds', 'tradeAsset', 'tradeRosterStrength', 'tradePackageValueAdjustment', 'tradePreservesPositionDepth',
    `${extract('buildTradeSuggestions', 'TradeLab')}; return buildTradeSuggestions;`)(
    () => new Map(), () => ({ overallRank: 30 }),
    () => ['WR', 'RB', 'QB', 'TE'].map(position => ({ position })),
    p => p, roster => roster.reduce((sum, p) => sum + p.value, 0) / 20,
    adjust, preservesDepth,
  );
  const yours = { id: 'a', roster: [asset(70, 'a1', 'RB'), asset(60, 'a2', 'RB'), asset(50, 'a3', 'WR'), asset(40, 'a4', 'WR')] };
  const theirs = { id: 'b', teamName: 'Partner', roster: [asset(70, 'b1', 'WR'), asset(61, 'b2', 'WR'), asset(49, 'b3', 'RB'), asset(40, 'b4', 'RB')] };
  const results = build(yours, theirs, [], null, 'Aggressive');
  assert.ok(results.length > 0 && results.length <= 3);
  assert.ok(results.some(r => r.send.length > 1 || r.receive.length > 1));
  for (const r of results) {
    assert.equal(new Set(r.send.map(a => a.id)).size, r.send.length);
    assert.equal(new Set(r.receive.map(a => a.id)).size, r.receive.length);
    assert.ok(r.send.every(a => yours.roster.includes(a)));
    assert.ok(r.receive.every(a => theirs.roster.includes(a)));
  }
});

test('protects the only QB, every piece in a package, and superflex depth', () => {
  const qb = asset(80, 'qb', 'QB');
  const qb2 = asset(70, 'qb2', 'QB');
  const wr = asset(80, 'wr', 'WR');
  const replacement = asset(75, 'replacement', 'QB');
  assert.equal(preservesDepth({ roster: [qb, wr] }, [qb], [wr], null), false);
  assert.equal(preservesDepth({ roster: [qb, wr] }, [wr, qb], [wr], null), false);
  assert.equal(preservesDepth({ roster: [qb, wr] }, [qb], [replacement], null), true);
  assert.equal(preservesDepth({ roster: [qb, qb2, wr] }, [qb], [wr], null), true);
  assert.equal(preservesDepth({ roster: [qb, qb2, wr] }, [qb], [wr], { rosterSlots: ['QB', 'SUPER_FLEX'], positionDemand: { QB: 1.5 } }), false);
  assert.equal(preservesDepth({ roster: [qb, qb2, wr] }, [qb, qb2], [replacement], null), true);
  assert.equal(preservesDepth({ roster: [qb, qb2, wr] }, [qb, qb2], [wr], null), false);
});
