import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const app = read('../app/FantasyHub.tsx');

test('released premium pages remain discoverable without owner access', () => {
  assert.match(app, /const visibleNav = nav;/);
  assert.match(app, /pages: nav.filter\(\(item\) => item.group === category.group\)/);
  assert.match(app, /label: "Team Review"/);
  assert.match(app, /label: "Vegas Edge"/);
});

test('Vegas page and projection switch require Elite, not ownership', () => {
  assert.match(app, /useProjectionController\(entitlement.elite,/);
  assert.match(app, /view === 'Vegas Edge' && entitlement.elite &&/);
  assert.match(app, /view === 'Vegas Edge' && !entitlement.elite && <ProGate feature="Vegas Edge" tier="Elite"/);
  const api = read('../app/api/vegas-edge/route.ts');
  assert.doesNotMatch(api, /access.owner/);
  assert.match(api, /if\(!user\)/);
  assert.match(api, /if\(!access.elite\)/);
});

test('Team Review and written reports retain server-side Pro access', () => {
  assert.match(app, /view === "Team Review" && entitlement.pro &&/);
  assert.match(app, /view === "Team Review" && !entitlement.pro && <ProGate/);
  const api = read('../app/api/team-review/route.ts');
  assert.doesNotMatch(api, /entitlement.owner/);
  assert.match(api, /if \(!entitlement.pro\)/);
  assert.match(read('../app/api/team-review/report/route.ts'), /if \(!assessment.ok\) return assessment/);
});
