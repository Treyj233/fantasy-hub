import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const code=ts.transpile(readFileSync(new URL('../app/stacks.ts',import.meta.url),'utf8'),{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022});
const {stackConnections,stackPick,stackPartners}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const p=(id,position,team,projection=15,role=position)=>({id,name:id,position,team,projection,role,status:'Healthy'});
test('own opponent and split connections support multiple QBs and receivers',()=>{
 const own=[p('q','QB','WAS'),p('w','WR','WAS'),p('t','TE','WAS'),p('q2','QB','BUF',20,'SUPER_FLEX')];
 const opp=[p('oq','QB','WAS'),p('ow','WR','WAS'),p('ow2','WR','BUF')];
 const rows=stackConnections(own,opp);
 assert.equal(rows.filter(r=>r.kind==='Your Stack').length,2);
 assert.equal(rows.filter(r=>r.kind==='Opponent Stack').length,1);
 assert.equal(rows.filter(r=>r.kind==='Split Stack').length,4);
});
test('no bench, bye, unavailable, empty team or RB false positives',()=>{
 const qb=p('q','QB','WAS');
 assert.equal(stackPartners(qb,[p('rb','RB','WAS'),p('b','WR','WAS',15,'Bench'),{...p('x','TE','WAS'),status:'Out'},{...p('y','WR','WAS'),opponent:'BYE'}]).length,0);
 assert.equal(stackPartners(p('q','QB',''),[p('w','WR','')]).length,0);
});
test('only upside breaks close ties and preserves input projections',()=>{
 const best=p('best','WR','BUF',15),stack=p('stack','WR','WAS',14.5,'Bench'),qb=p('q','QB','WAS',22);
 const score=p=>p.projection;
 assert.equal(stackPick([best,stack],[best,stack,qb],80,score).id,'stack');
 for(const aggression of [20,50])assert.equal(stackPick([best,stack],[best,stack,qb],aggression,score).id,'best');
 assert.equal(stack.projection,14.5);
 for(const candidate of [{...stack,projection:13},{...stack,projectionLocked:true},{...stack,status:'Out'}])assert.equal(stackPick([best,candidate],[best,candidate,qb],80,score).id,'best');
 assert.equal(stackPick([{...best,projectionLocked:true},stack],[qb],80,score).id,'best');
});
