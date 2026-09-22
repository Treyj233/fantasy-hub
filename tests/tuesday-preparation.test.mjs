import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
test('recap endpoint authenticates and refuses unfinished weeks', () => {
  const route = source('app/api/account/weekly-recap/route.ts');
  assert.match(route, /if \(!user\)/);
  assert.match(route, /week > calendar.completedWeek/);
  assert.match(route, /eq\(managedLeagues.userId, user.userId\)/);
});
test('prepared results are account, season, week, league and roster scoped', () => {
  const prepare = source('app/prepared-weekly-recap.ts');
  assert.match(prepare, /weekly-recap:\$\{season\}:\$\{week\}:\$\{record.provider\}:\$\{record.identifier\}:\$\{record.rosterId\}/);
  assert.match(prepare, /eq\(leagueDataSnapshots.userId, record.userId\)/);
  assert.match(prepare, /mine.custom_points \?\? mine.points/);
  assert.match(prepare, /if \(!mine\) return previous \?\? \{ outcome: 'Pending' \}/);
});
test('background refresh prepares recaps outside live-game windows', () => {
  const worker = source('app/background-league-refresh.ts');
  assert.ok(worker.indexOf('prepareWeeklyLeagueResult(item.record') < worker.indexOf('const live ='));
  assert.match(worker, /s.week === week \? Date.parse\(s.refreshedAt\) : 0/);
});
test('recap preparation does not wait for active-league import and incomplete results retry', () => {
  const ui = source('app/WeeklyRecap.tsx');
  assert.match(ui, /if \(!prepare/);
  assert.match(ui, /recapReady\(complete, selected.length\)/);
  assert.match(ui, /startVisiblePolling/);
  assert.doesNotMatch(ui, /\/api\/scoreboard/);
});
