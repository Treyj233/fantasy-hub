import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../app/team-review-model.ts', import.meta.url), 'utf8');
const code = ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 });
const { reviewLineup, reviewStructure, evaluateReviewTeam, buildTeamReview } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const p = (id, position, value, status='Healthy') => ({id,name:id,position,value,status,team:'BUF'});
const context = rosterSlots => ({rosterSlots,format:'Redraft',scoring:'PPR',tePremium:0,passTouchdown:4});
test('deeper flex requirements increase balance and depth weights',()=>{
  const shallow = reviewStructure(context(['QB','RB','RB','WR','WR','TE','FLEX','BN']));
  const deep = reviewStructure(context(['QB','RB','RB','WR','WR','WR','TE','FLEX','FLEX','FLEX','BN']));
  assert.ok(deep.weights.balance > shallow.weights.balance);
  assert.ok(deep.weights.depth > shallow.weights.depth);
  assert.ok(deep.weights.starters < shallow.weights.starters);
  assert.equal(shallow.slots.length,7);
});
test('slot matching preserves required QB and TE while assigning flex without duplicates',()=>{
  const lineup=reviewLineup([p('q1','QB',99),p('q2','QB',80),p('t','TE',90),p('w','WR',85),p('r','RB',75)],['FLEX','SUPER_FLEX','QB','TE','WR']);
  assert.equal(lineup.filter(r=>r.player).length,5);
  assert.equal(new Set(lineup.map(r=>r.player.id)).size,5);
  assert.equal(lineup.find(r=>r.slot==='TE').player.id,'t');
  assert.equal(lineup.find(r=>r.slot==='SUPER_FLEX').player.position,'QB');
});
test('injuries and vacancies count instead of inflating short rosters',()=>{
  const c=context(['QB','WR','WR','FLEX']);
  const roster=[p('q','QB',90),p('w','WR',90),p('r','RB',70),p('injured','WR',99,'IR')];
  const short=evaluateReviewTeam({id:'a',teamName:'A',roster},c);
  const full=evaluateReviewTeam({id:'b',teamName:'B',roster:[...roster,p('w2','WR',70)]},c);
  assert.equal(short.vacancies,1);assert.equal(full.vacancies,0);assert.ok(full.score>short.score);
  assert.equal(buildTeamReview([{id:'a',teamName:'A',roster},{id:'b',teamName:'B',roster:[...roster,p('w2','WR',70)]}],'a',c).verdict,'Needs Reinforcements');
});
test('reordering roster or fantasy bench slots never changes the assessment',()=>{
  const roster=[p('q','QB',80),p('w','WR',70),p('r','RB',60),p('b','WR',50)];
  const c=context(['QB','WR','FLEX']);
  assert.equal(evaluateReviewTeam({id:'a',roster},c).score,evaluateReviewTeam({id:'a',roster:[...roster].reverse()},c).score);
});
test('owner gate exists on API before input evaluation and navigation follows Team Rankings',()=>{
  const route=readFileSync(new URL('../app/api/team-review/route.ts',import.meta.url),'utf8');
  assert.ok(route.indexOf('await entitlementFor')<route.indexOf('await request.text'));
  assert.match(route,/if \(!entitlement.owner\).*status: 403/);
  const ui=readFileSync(new URL('../app/FantasyHub.tsx',import.meta.url),'utf8');
  assert.match(ui,/label: "Team Rankings"[^\n]+\n\s*\{ label: "Team Review"/);
  assert.match(ui,/view === "Team Review" && entitlement.owner/);
  assert.match(ui,/nav.filter\(item => item.label !== "Team Review" \|\| entitlement.owner\)/);
});
