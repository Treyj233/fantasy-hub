import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const code=ts.transpile(readFileSync(new URL('../app/lineup-readiness.ts',import.meta.url),'utf8'),{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022});
const {lineupReadiness}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const p=(id,role='WR',status='Healthy',opponent='BUF')=>({id,role,status,opponent});
test('bench and IR injuries do not reduce starter readiness',()=>{
  assert.equal(lineupReadiness([p('a'),p('b','Bench','Out'),p('c','IR','IR')],['WR','BN','IR']).value,'1/1 ready');
});
test('readiness separates questions, unavailable, byes and empty slots without double counting',()=>{
  const r=lineupReadiness([p('a'),p('b','WR','Questionable'),p('c','WR','Out'),p('d','WR','Out','BYE')],Array(5).fill('WR'));
  assert.equal(r.value,'1/5 ready');assert.equal(r.detail,'1 unavailable · 1 questionable · 1 on bye · 1 empty');
});
test('no starting slots is not reported as fully ready',()=>assert.equal(lineupReadiness([],[]).value,'—'));
