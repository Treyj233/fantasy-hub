import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../app/FantasyHub.tsx',import.meta.url),'utf8');
const gate=source.slice(source.indexOf('function DailyMembershipOffer'),source.indexOf('function ProPlans'));
const offer=source.slice(source.indexOf('if(offer)return'),source.indexOf('return <div className="page-content pro-plans-page">'));
test('public offer excludes existing members and owner access',()=>{
 assert.match(gate,/account&&!entitlement.pro&&!entitlement.elite&&!entitlement.owner/);
 assert.doesNotMatch(gate,/ownerPreviewOnly/);
});
test('daily account/device limit persists on presentation and resumes on opening',()=>{
 assert.match(gate,/localStorage.getItem\(key\)===day/);
 assert.ok(gate.indexOf('localStorage.setItem(key,day)')<gate.indexOf('setOpen(true)'));
 assert.match(gate,/account.toLowerCase/);
 assert.match(gate,/visibilitychange/);
 assert.doesNotMatch(gate,/ownerPreviewOnly/);
 assert.match(gate,/if\(shownForOpening.current===account\)return/);
});
test('offer directly invokes shared checkout for both plans with clear renewal terms',()=>{
 assert.match(offer,/openBilling\('\/api\/billing\/checkout','monthly'\)/);
 assert.match(offer,/openBilling\('\/api\/billing\/checkout','elite_monthly'\)/);
 assert.match(offer,/Renews until canceled/);
 assert.match(offer,/onClick=\{onDismiss\}/);
 assert.match(offer,/onClick=\{onLearnMore\}/);
 assert.match(gate,/PortfolioDetailDialog/);
});
