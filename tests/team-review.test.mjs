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

test('review trade handoff keeps partner and both asset sides scoped to the active league/team',()=>{
  const ui=readFileSync(new URL('../app/FantasyHub.tsx',import.meta.url),'utf8');
  assert.match(ui,/reviewTradeDraft\?\.leagueId === leagueId && reviewTradeDraft.teamId === selectedTeamId/);
  assert.match(ui,/setCalculatorOpen|calculatorOpen/);
  assert.match(ui,/useState\(Boolean\(validInitialTrade\)\)/);
  assert.match(ui,/useState<string\[\]>\(validInitialTrade\?\.sendIds \?\? \[\]\)/);
  assert.match(ui,/useState<string\[\]>\(validInitialTrade\?\.receiveIds \?\? \[\]\)/);
  assert.match(ui,/View in Trade Lab/);
});

test('polished review uses separate position cards and an accessible safe-area report dialog',()=>{
  const ui=readFileSync(new URL('../app/FantasyHub.tsx',import.meta.url),'utf8').split('function TeamReview(')[1].split('function TeamRankings(')[0];
  const css=readFileSync(new URL('../app/team-review.css',import.meta.url),'utf8');
  assert.doesNotMatch(ui,/Reassess team|roster rating/);
  assert.match(ui,/Generate Team Report/);
  assert.match(ui,/review-section review-profile/);
  assert.match(ui,/<dialog ref=\{reportDialog\}/);
  assert.match(ui,/reportRequest.current\?\.abort/);
  assert.match(css,/100dvh[^}]+safe-area-inset-top[^}]+safe-area-inset-bottom/);
  assert.match(css,/review-report-body\{overflow-y:auto/);
});

test('written reports reuse owner validation with no provider dependency',()=>{
  const route=readFileSync(new URL('../app/api/team-review/report/route.ts',import.meta.url),'utf8');
  assert.ok(route.indexOf('await assessTeam') < route.indexOf('sections: buildWrittenTeamReport'));
  assert.match(route,/if \(!assessment.ok\) return assessment/);
  assert.doesNotMatch(route,/fetch\(|OPENAI|TEAM_REPORT_MODEL/);
  assert.match(route,/private, no-store/);
});

test('report presentation separates ranks, verdict, player names and roster moves',()=>{
  const ui=readFileSync(new URL('../app/FantasyHub.tsx',import.meta.url),'utf8');
  const css=readFileSync(new URL('../app/team-review.css',import.meta.url),'utf8');
  assert.match(ui,/report-summary-strip/);
  assert.match(ui,/report-player-name/);
  assert.match(ui,/report-next-move/);
  assert.match(ui,/Trade options.*Waiver options/);
  assert.match(css,/report-section-grid\{display:grid/);
  assert.match(css,/@media\(max-width:560px\)/);
  assert.match(css,/safe-area-inset-top/);
});

const writtenSource = readFileSync(new URL('../app/team-review-written.ts', import.meta.url), 'utf8');
const writtenCode = ts.transpile(writtenSource, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 });
const { buildWrittenTeamReport } = await import(`data:text/javascript;base64,${Buffer.from(writtenCode).toString('base64')}`);
const reportTeams = [{id:'a',teamName:'My Team',roster:[p('Allen','QB',95),p('Gibbs','RB',95),p('Chase','WR',95),p('Kittle','TE',80)]},{id:'b',teamName:'Opponent',roster:[p('Maye','QB',80),p('Cook','RB',80),p('Nabers','WR',80),p('Pitts','TE',70)]}];
test('written report includes actual packages, waivers and no methodology or redraft picks',()=>{
  const ctx=context(['QB','RB','WR','TE']);
  const review=buildTeamReview(reportTeams,'a',ctx);
  const result=buildWrittenTeamReport(review,ctx,{trades:[{partner:'Opponent',send:['Chase','Kittle'],receive:['Nabers','Pitts']}],waivers:[{add:'Available Player',drop:'Bench Player'}],tradeStatus:'complete',waiverStatus:'available',draftPicks:4});
  const text=JSON.stringify(result);
  assert.equal(result.length,6);
  assert.match(text,/sending Chase and Kittle for Nabers and Pitts/);
  assert.match(text,/adding Available Player, with Bench Player/);
  assert.match(text,/separate proposals, not accepted/);
  assert.doesNotMatch(text,/AI|undefined|NaN|draft picks|roster.rating/);
  assert.deepEqual(result,buildWrittenTeamReport(review,ctx,{trades:[{partner:'Opponent',send:['Chase','Kittle'],receive:['Nabers','Pitts']}],waivers:[{add:'Available Player',drop:'Bench Player'}],tradeStatus:'complete',waiverStatus:'available',draftPicks:4}));
});
test('written report adapts to deep superflex, unavailable data and uncovered slots',()=>{
  const ctx={...context(['QB','SUPER_FLEX','RB','RB','WR','WR','WR','TE','FLEX','FLEX']),format:'Dynasty',tePremium:1};
  const review=buildTeamReview(reportTeams,'a',ctx);
  const result=buildWrittenTeamReport(review,ctx,{tradeStatus:'unavailable',waiverStatus:'unavailable',draftPicks:0});
  const text=JSON.stringify(result);
  assert.match(text,/deeper lineup/);
  assert.match(text,/second starting quarterback/);
  assert.match(text,/TE-premium/);
  assert.match(text,/0 tracked draft picks/);
  assert.match(text,/Trade matching is unavailable/);
  assert.match(result.at(-1).body,/Fill your uncovered starting slots/);
});
test('written report safely handles missing and malformed move details',()=>{
  const ctx=context(['QB','RB','WR','TE']);
  const review=buildTeamReview(reportTeams,'a',ctx);
  for(const moves of [null,undefined,{trades:[null,{}, {send:42}],waivers:[null,{}]}]) {
    const text=JSON.stringify(buildWrittenTeamReport(review,ctx,moves));
    assert.match(text,/No qualifying trade package/);
    assert.doesNotMatch(text,/undefined|NaN/);
  }
});
