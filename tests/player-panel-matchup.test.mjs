import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('player pop-out hydrates matchup context independently of its entry point', async () => {
  const source = await readFile(new URL('../app/FantasyHub.tsx', import.meta.url), 'utf8');
  const panel = source.slice(source.indexOf('function PlayerPanel('));
  assert.doesNotMatch(source, /Matchup details in league view/);
  for (const loader of ['loadScheduleData(season)', 'loadWeatherData(season, week)', 'loadMatchupStrengthData(season, week)']) {
    assert.ok(panel.includes(loader));
  }
  assert.match(panel, /applyOpponent\(sourcePlayer, context\?\.schedule \?\? null, week\)/);
  assert.match(panel, /applyWeather\(withOpponent, context\?\.weather \?\? null\)/);
  assert.match(panel, /applyMatchupStrength\(withWeather, context.strength\)/);
  assert.match(panel, /if \(active\) setMatchupContext/);
  assert.match(panel, /matchupContext\?\.key === matchupContextKey/);
});
