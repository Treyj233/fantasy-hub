import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = name => readFileSync(new URL(`../${name}`,import.meta.url),'utf8');
test('one ephemeral week drives platform imports, Vegas and portfolio cache identity',()=>{
  const app = source('app/FantasyHub.tsx');
  assert.match(app,/const \[selectedWeek, setSelectedWeek\] = useState<number \| null>\(null\)/);
  assert.match(app,/const defaultGameWeek = selectedWeek \?\? calendar.currentWeek/);
  assert.match(app,/const projectionWeek = defaultGameWeek/);
  assert.match(app,/const importWeek = requestedWeekRef.current/);
  assert.match(app,/requestedLeagueId\)\}&week=\$\{importWeek\}/);
  assert.match(app,/scan.week === selectedWeek/);
  assert.match(app,/key=\{`scoreboards-\$\{defaultGameWeek\}`\}/);
  assert.match(app,/setSelectedWeek\(null\); update\(\)/);
});
test('cached league payload must match both requested and current calendar week',()=>{
  const route = source('app/api/league/route.ts');
  assert.match(route,/cached.league\?\.projectionWeek === \(selectedWeek \?\? calendar.currentWeek\)/);
  assert.match(route,/const projectionWeek = selectedWeek \?\? calendar.currentWeek/);
});
test('report defaults to completed week while outcome resolution uses calendar completion',()=>{
  assert.match(source('app/FantasyHub.tsx'),/week=\{selectedWeek \?\? Math.max\(1, calendar.completedWeek\)\}/);
  assert.match(source('app/api/decisions/route.ts'),/row.week <= calendar.completedWeek/);
});
test('recap acknowledgment is account-backed; dialog stays within safe insets',()=>{
  assert.match(source('db/schema.ts'),/weeklyRecapSeen: text\("weekly_recap_seen"\)/);
  assert.match(source('app/WeeklyRecap.tsx'),/data.preferences\?\.weeklyRecapSeen === recapKey/);
  assert.match(source('app/globals.css'),/weekly-recap-dialog\{[^}]*safe-area-inset-top[^}]*safe-area-inset-bottom/);
});
test('ESPN stats and projections never fall back to a different week',()=>{
  const espn = source('app/api/espn.ts');
  assert.doesNotMatch(espn,/exact \?\? fallback|scoringPeriodId === week\) \?\? rows\[0\]/);
  assert.match(espn,/scoringPeriodId=\$\{week\}/);
});
