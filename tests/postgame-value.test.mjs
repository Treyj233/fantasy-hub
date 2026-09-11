import test from 'node:test';
import assert from 'node:assert/strict';
import { postgameValueAdjustment, injuryTradePenalty } from '../app/postgame-value.mjs';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { sleeperFantasyPoints } from '../app/sleeper-live-scoring.mjs';

test('only confirmed finals change performance value; missing projections stay neutral', () => {
  assert.equal(postgameValueAdjustment(30, 15, false), 0);
  assert.equal(postgameValueAdjustment(30, 0, true), 0);
  assert.equal(postgameValueAdjustment(null, 15, true), 0);
  assert.equal(postgameValueAdjustment(30, 15, true), 1.25);
  assert.equal(postgameValueAdjustment(0, 15, true), -1.25);
  assert.equal(postgameValueAdjustment(15, 15, true), 0);
});

test('confirmed injury statuses affect value with less dynasty impact', () => {
  assert.equal(injuryTradePenalty('Healthy', 'Redraft'), 0);
  assert.equal(injuryTradePenalty('Unknown', 'Redraft'), 0);
  assert.ok(injuryTradePenalty('IR', 'Redraft') > injuryTradePenalty('Out', 'Redraft'));
  assert.ok(injuryTradePenalty('Out', 'Redraft') > injuryTradePenalty('Questionable', 'Redraft'));
  assert.ok(injuryTradePenalty('IR', 'Dynasty') < injuryTradePenalty('IR', 'Redraft'));
});

test('one bad star game is protected; breakouts get modest upside and repetition earns conviction', () => {
  const star = { marketRank: 10, historicalGames: 17 };
  assert.equal(postgameValueAdjustment(0, 20, true, star), -.75);
  assert.equal(postgameValueAdjustment(24, 8, true, { marketRank: 100 }), 2);
  const bad = { actual: 0, projected: 20, completed: true };
  const repeated = postgameValueAdjustment(0, 20, true, { ...star, priorGames: [bad, bad, bad] });
  assert.equal(repeated, -8);
  const good = { actual: 40, projected: 20, completed: true };
  assert.equal(postgameValueAdjustment(40, 20, true, { ...star, priorGames: [good, good, good] }), 8);
  assert.ok(Math.abs(postgameValueAdjustment(0, 20, true, { ...star, priorGames: [good, bad, good] })) < 1);
});

test('final game data enriches both provider IDs and roster copies without accumulating', async () => {
  const source = readFileSync(new URL('../app/postgame-rankings.ts', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace('export async function', 'async function');
  const response = value => ({ ok: true, json: async () => value });
  const directory = { '123': { full_name: 'Test Player', position: 'WR', team: 'SEA', injury_status: 'Out' } };
  const games = { events: [{ season: { year: 2026, type: 2 }, week: { number: 1 }, status: { type: { completed: true } }, competitions: [{ competitors: [{ team: { abbreviation: 'SEA' } }] }] }] };
  const apply = new Function('fetchCachedUpstream', 'getSleeperWeeklyStats', 'getSleeperWeeklyProjections', 'sleeperFantasyPoints', 'postgameValueAdjustment',
    `${ts.transpile(source, { target: ts.ScriptTarget.ES2022 })}; return applyPostgameRankings;`)(
    async url => response(url.includes('players/nfl') ? directory : games),
    async () => ({ value: new Map([['123', { rec: 10, rec_yd: 150 }]]) }),
    async () => ({ value: new Map([['123', { rec: 5, rec_yd: 70 }]]) }),
    sleeperFantasyPoints, postgameValueAdjustment,
  );
  for (const id of ['123', 'espn-player:456']) {
    const player = { id, name: 'Test Player', position: 'WR', team: 'SEA', status: 'Healthy' };
    const payload = { league: { season: '2026', currentWeek: 1 }, rankings: [player], teams: [{ roster: [player] }] };
    const enriched = await apply(payload);
    assert.equal(enriched.rankings[0].status, 'Out');
    assert.equal(enriched.rankings[0].postgameAdjustment, 1.25);
    assert.equal(enriched.teams[0].roster[0].postgameAdjustment, 1.25);
    assert.equal((await apply(enriched)).rankings[0].postgameAdjustment, 1.25);
  }
});
