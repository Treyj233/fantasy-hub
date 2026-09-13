import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=ts.transpile(readFileSync(new URL('../app/command-lineups.ts',import.meta.url),'utf8'),{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022});
const {commandLineup}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const p=(id,position,role,floor,projection,ceiling)=>({id,position,role,floor,projection,ceiling,status:'Healthy'});
test('full scenarios choose different eligible players without duplication',()=>{
 const roster=[p('q','QB','QB',10,20,30),p('steady','WR','WR',12,14,17),p('boom','WR','Bench',4,16,28),p('rb','RB','RB',10,15,20)];
 const slots=['QB','WR','RB'];
 assert.equal(commandLineup(roster,slots,'floor')[1].player.id,'steady');
 assert.equal(commandLineup(roster,slots,'ceiling')[1].player.id,'boom');
 for(const metric of ['floor','projection','ceiling']){const rows=commandLineup(roster,slots,metric);assert.equal(rows.length,3);assert.equal(new Set(rows.map(r=>r.player.id)).size,3);}
});
test('receiving flex excludes RBs and reserve/injured players',()=>{
 const roster=[p('rb','RB','Bench',30,30,40),p('wr','WR','WR',10,10,15),{...p('ir','TE','IR',40,40,50)}, {...p('out','WR','Bench',50,50,60),status:'Out'}];
 assert.equal(commandLineup(roster,['REC_FLEX'],'projection')[0].player.id,'wr');
});
test('locked starters remain and vacancies are explicit',()=>{
 const roster=[{...p('locked','WR','WR',1,1,1),projectionLocked:true},p('better','WR','Bench',20,20,30)];
 const rows=commandLineup(roster,['WR','QB'],'projection');assert.equal(rows[0].player.id,'locked');assert.equal(rows[1].player,null);
});
