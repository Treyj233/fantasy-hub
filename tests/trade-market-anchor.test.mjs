import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../app/FantasyHub.tsx', import.meta.url), 'utf8');
const code = source.slice(source.indexOf('const clampTradeRating ='), source.indexOf('function dynastyAgeCurve('));
const profile = new Function('dynastyAgeCurve', `${ts.transpile(code, { target: ts.ScriptTarget.ES2022 })}; return fantasyTradeProfile;`)(() => 0);
const player = { position: 'QB', status: 'Healthy', projection: 10, leagueProjection: 10 };
const ranking = { overallRank: 20, compositeAdp: 20, currentSeasonGames: 0, gamesPlayed2025: 17, fantasyPpg2025: 15, snapAverage: 90 };

test('opening-week projections do not change season trade profile', () => {
  assert.equal(profile(player, ranking).currentOverall, profile({ ...player, projection: 35, leagueProjection: 35 }, ranking).currentOverall);
});
test('historical games cannot reduce preseason market influence', () => {
  assert.equal(profile(player, ranking).currentOverall, profile(player, { ...ranking, gamesPlayed2025: 0 }).currentOverall);
  assert.ok(profile(player, ranking).currentOverall >= profile(player, { ...ranking, overallRank: 80, compositeAdp: 80 }).currentOverall);
});
test('current season production earns weight after games are played', () => {
  const strong = profile(player, { ...ranking, currentSeasonGames: 8, currentSeasonPpg: 30 }).currentOverall;
  const weak = profile(player, { ...ranking, currentSeasonGames: 8, currentSeasonPpg: 10 }).currentOverall;
  assert.ok(strong > weak);
});
