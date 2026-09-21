import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('player detail score searches the full league and hides pregame analysis after kickoff', async () => {
  const source = await readFile(new URL('../app/FantasyHub.tsx', import.meta.url), 'utf8');
  const panel = source.slice(source.indexOf('function PlayerPanel('));
  assert.match(panel, /scope=league&playerId=/);
  assert.match(panel, /item\.id === player\.id/);
  assert.match(panel, /playerPanelScore\(platformProjection, liveScore, scheduledGame, player.projectionLocked\)/);
  assert.match(panel, /liveScoreSnapshot\?\.key === liveScoreKey/);
  assert.match(panel, /!showActualScore && <div className="player-range-command"/);
  assert.match(panel, /Actual fantasy points/);
  assert.match(panel, /WEEKLY OUTCOME RANGE/);
  assert.match(panel, /active = false; stop\(\)/);
  assert.match(source, /key=\{`\$\{selectedPlayer\.id\}-\$\{leagueId\}-\$\{defaultGameWeek\}`\}/);
});
