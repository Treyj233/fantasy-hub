import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const js=ts.transpile(readFileSync(new URL('../social-agent/src/report-safety.ts',import.meta.url),'utf8'),{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022});
const {beneficiaryAvailable,recycledReport}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
test('unavailable status codes and all injury flags exclude beneficiaries',()=>{
 for(const status of ['DNR','SUS','Suspended','Inactive','IR','Out','Questionable','Did Not Report'])assert.equal(beneficiaryAvailable({status}),false,status);
 for(const injury_status of ['Questionable','Doubtful','Out','Hamstring','SUS','DNR'])assert.equal(beneficiaryAvailable({status:'Active',injury_status}),false,injury_status);
 assert.equal(beneficiaryAvailable({status:'Active',injury_status:null}),true);
});
test('old referenced reports and throwbacks require review; new standalone reports do not',()=>{
 const now=Date.parse('2026-09-13T12:00Z');
 assert.equal(recycledReport('Breaking: signing','2026-06-01T12:00Z',now),true);
 assert.equal(recycledReport('He signed last season',undefined,now),true);
 assert.equal(recycledReport('The team signed a receiver today','2026-09-13T11:00Z',now),false);
});
