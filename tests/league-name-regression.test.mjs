import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Sleeper connection saves returned metadata and does not overwrite names with null', () => {
  const route = source('app/api/account/managed-leagues/route.ts');
  assert.match(route, /await sleeperResponse\.json\(\)/);
  assert.match(route, /leagueName = metadata\.name\?\.trim\(\)/);
  assert.match(route, /\.\.\.\(leagueName \? \{ leagueName \} : \{\}\)/);
});
test('cached account entry points repair missing names before returning leagues', () => {
  assert.match(source('app/api/account/leagues/route.ts'), /await repairLeagueNames\(db, savedRecords\)/);
  assert.match(source('app/api/v1/bootstrap/route.ts'), /await repairLeagueNames\(db, leagues\)/);
  const repair = source('app/repair-league-names.ts');
  assert.match(repair, /eq\(leagueDataSnapshots.userId, record.userId\)/);
  assert.match(repair, /eq\(managedLeagues.userId, record.userId\)/);
  assert.doesNotMatch(repair, /\/rosters|\/matchups/);
});
test('portfolio applies fresh league metadata to cached scans', () => {
  assert.match(source('app/FantasyHub.tsx'), /scan = \{ \.\.\.scan, league: currentLeague \}/);
});
