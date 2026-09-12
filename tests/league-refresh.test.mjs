import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('explicit discovery refresh also imports the active roster with cache bypass', () => {
  const source = readFileSync(new URL('../app/FantasyHub.tsx', import.meta.url), 'utf8');
  const refresh = source.split('async function loadLeagues(')[1].split('function moveConnectedLeague')[0];
  assert.match(refresh, /forceRefresh \|\| activateFirst \|\| !activeLeague/);
  assert.match(refresh, /const defaultLeague = activeLeague \?\? selectableLeagues\[0\]/);
  assert.match(refresh, /await importLeague\(defaultLeague.id, data.connection\?\.sleeperUserId, defaultLeague.rosterId, forceRefresh, Boolean\(activeLeague\)\)/);
  const importer = source.split('async function importLeague(')[1].split('async function loadLeagues(')[0];
  assert.match(importer, /forceRefresh \? "&refresh=1"/);
  assert.match(importer, /setPlayers\(ownedTeam.roster\)/);
  const route = readFileSync(new URL('../app/api/league/route.ts', import.meta.url), 'utf8');
  assert.match(route, /if \(!forceRefresh\)/);
  assert.match(route, /rosters`, \{ cache: "no-store" \}/);
});
