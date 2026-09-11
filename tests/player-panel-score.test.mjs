import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('player detail score uses selected-league live data and preserves projection analysis', async () => {
  const source = await readFile(new URL('../app/FantasyHub.tsx', import.meta.url), 'utf8');
  const panel = source.slice(source.indexOf('function PlayerPanel('));
  assert.match(panel, /subscribeLiveScoreboards\(\[leagueId\], week/);
  assert.match(panel, /item\.id === player\.id/);
  assert.match(panel, /myTeamScore\(platformProjection, liveScore\)/);
  assert.match(panel, /Actual fantasy points/);
  assert.match(panel, /WEEKLY OUTCOME RANGE/);
  assert.match(panel, /active = false; stop\(\)/);
  assert.match(source, /key=\{`\$\{selectedPlayer\.id\}-\$\{leagueId\}-\$\{defaultGameWeek\}`\}/);
});
