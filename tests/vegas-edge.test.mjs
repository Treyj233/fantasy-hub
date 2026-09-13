import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../app/vegas-edge-model.ts',import.meta.url),'utf8');
const compiled=ts.transpile(source,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022});
const {normalizeEvents,edgeProjection,edgeRosterProjection,edgeSuggestions,impliedProbability,refreshInterval,slotEligible,countExpectation}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const now=Date.parse('2026-09-13T16:00:00Z');
const player={id:'1',name:'Test Receiver',team:'BUF',position:'WR',role:'WR',status:'Healthy',projection:12};
const context={scoring:'PPR',tePremium:0,passTouchdown:4,interception:-2,rosterSlots:['WR','FLEX'],scoringRules:{pass_yd:.04,rush_yd:.1,rec_yd:.1,rec:1,rush_td:6,rec_td:6,pass_td:4,pass_int:-2}};
const props=[{stat:'receiving_yards',line:80.5,overProbability:.5,books:2},{stat:'receptions',line:6.5,overProbability:.5,books:2},{stat:'touchdowns',line:.5,overProbability:.5,books:2}];
const event={id:'e',startsAt:'2026-09-13T17:00:00Z',home:'BUF',away:'MIA',locked:false,updatedAt:new Date(now).toISOString(),total:48,homeSpread:-3,players:[{name:player.name,team:'BUF',status:'active',props}]};
test('roster retains last pregame estimate during live and final without recommending locked players',()=>{
  const expected=edgeProjection(player,[event],context,now).projection;
  for(const time of [Date.parse(event.startsAt),now+3*86400000]){
    const row=edgeRosterProjection(player,[event],context,time);
    assert.equal(row.projection,expected);
    assert.equal(row.label,'Pregame Vegas');
    assert.equal(row.usable,false);
    assert.equal(row.delta,null);
    assert.deepEqual(edgeSuggestions([row],[]),{swaps:[],targets:[]});
  }
});
test('roster never presents post-kickoff markets or absent props as a pregame estimate',()=>{
  const time=Date.parse(event.startsAt)+1000;
  assert.equal(edgeRosterProjection(player,[{...event,updatedAt:new Date(time).toISOString()}],context,time).projection,null);
  assert.equal(edgeRosterProjection(player,[],context,time).projection,null);
  assert.equal(edgeRosterProjection(player,[{...event,locked:true}],context,time).projection,null);
});
test('refresh cadence stops at kickoff and accelerates near game',()=>{
  assert.equal(refreshInterval(new Date(now).toISOString(),now),Infinity);
  assert.equal(refreshInterval(event.startsAt,now),600000);
  assert.equal(refreshInterval(new Date(now+8*3600000).toISOString(),now),7200000);
  assert.equal(refreshInterval(new Date(now+48*3600000).toISOString(),now),43200000);
});
test('paired available odds are required and vig removed',()=>{
  const over='receiving_yards-P-game-ou-over', under='receiving_yards-P-game-ou-under';
  const raw={eventID:'e',status:{startsAt:event.startsAt},teams:{home:{teamID:'BUF_NFL',names:{short:'BUF'}},away:{teamID:'MIA_NFL',names:{short:'MIA'}}},players:{P:{name:player.name,teamID:'BUF_NFL'}},odds:{[over]:{statID:'receiving_yards',statEntityID:'P',periodID:'game',betTypeID:'ou',sideID:'over',byBookmaker:{a:{available:true,odds:'-110',overUnder:'80.5'},b:{available:false,odds:'-110',overUnder:'82.5'}}},[under]:{byBookmaker:{a:{available:true,odds:'-110',overUnder:'80.5'}}}}};
  const result=normalizeEvents([raw],now)[0];
  assert.equal(result.players[0].props[0].overProbability,.5);
  assert.equal(result.players[0].props[0].books,1);
  raw.odds[under].byBookmaker.a.overUnder='79.5';
  assert.equal(normalizeEvents([raw],now)[0].players[0].props.length,0);
  assert.equal(impliedProbability('garbage'),null);
});
test('complete coverage uses scoring, while partial/unknown data produces no estimate',()=>{
  const row=edgeProjection(player,[event],context,now);
  assert.equal(row.usable,true);assert.ok(row.projection>player.projection);assert.equal(row.modeledTd,true);
  assert.equal(edgeProjection(player,[{...event,players:[{...event.players[0],props:props.slice(0,1)}]}],context,now).projection,null);
  assert.equal(edgeProjection(player,[event],{...context,scoringRules:undefined},now).projection,null);
  assert.equal(edgeProjection(player,[event],{...context,scoringRules:{}},now).projection,null);
  const standard=edgeProjection(player,[event],{...context,scoringRules:{...context.scoringRules,rec:0}},now);
  assert.ok(standard.projection<row.projection);
});
test('Michael Wilson cannot display defensive or quarterback markets from cached props',()=>{
  const wilson={...player,name:'Michael Wilson',team:'ARI'};
  const mixed={...event,players:[{name:wilson.name,team:'ARI',status:'active',props:[...props,...['defense_tackles','defense_sacks','interceptions','passing_interceptions'].map(stat=>({stat,line:2.5,overProbability:.5,books:2}))]}]};
  const row=edgeProjection(wilson,[mixed],context,now);
  assert.deepEqual(row.props.map(p=>p.stat),props.map(p=>p.stat));
  const defenseOnly={...mixed,players:[{...mixed.players[0],props:mixed.players[0].props.slice(3)}]};
  assert.equal(edgeProjection(wilson,[defenseOnly],context,now).projection,null);
  assert.equal(edgeProjection(wilson,[defenseOnly],context,now).props.length,0);
});
test('Cardinals Wilson nickname fallback is team scoped and exact matches win',()=>{
  const wilson={...player,name:'Michael Wilson',team:'ARI'};
  const mike={name:'Mike Wilson',team:'ARI',status:'active',props};
  const feed={...event,players:[mike]};
  assert.equal(edgeProjection(wilson,[feed],context,now).usable,true);
  assert.equal(edgeProjection(wilson,[{...feed,players:[{...mike,team:'NYJ'}]}],context,now).usable,false);
  assert.equal(edgeProjection(wilson,[{...feed,players:[mike,mike]}],context,now).usable,false);
  const exact={...mike,name:'Michael Wilson',props:[]};
  assert.equal(edgeProjection(wilson,[{...feed,players:[mike,exact]}],context,now).usable,false);
  assert.equal(edgeProjection(wilson,[{...feed,players:[{...mike,name:'M. Wilson'}]}],context,now).usable,false);
});
test('wrong team and ambiguous identities cannot match',()=>{
  assert.equal(edgeProjection({...player,team:'NYG'},[event],context,now).usable,false);
  assert.equal(edgeProjection(player,[event,event],context,now).usable,false);
});
test('real feed reception field and full-name alias match without guessing initials',()=>{
  const data={...event,players:[{...event.players[0],name:'Cameron Ward',aliases:['Cam Ward'],props:props.map(p=>p.stat==='receptions'?{...p,stat:'receiving_receptions'}:p)}]};
  assert.equal(edgeProjection({...player,name:'Cam Ward'},[data],context,now).usable,true);
  assert.equal(edgeProjection({...player,name:'C. Ward'},[data],context,now).usable,false);
});
test('anytime TD requires available Yes books and an explicit fair consensus pair',()=>{
  const yes='touchdowns-P-game-yn-yes',no='touchdowns-P-game-yn-no';
  const raw={eventID:'e',status:{startsAt:event.startsAt},teams:{home:{teamID:'BUF',names:{short:'BUF'}}},players:{P:{name:'Test',teamID:'BUF'}},odds:{[yes]:{statID:'touchdowns',statEntityID:'P',periodID:'game',betTypeID:'yn',sideID:'yes',opposingOddID:no,fairOdds:'+124',fairOddsAvailable:true,byBookmaker:{a:{available:true,odds:'+110'}}},[no]:{fairOdds:'-124',fairOddsAvailable:true,byBookmaker:{}}}};
  const p=normalizeEvents([raw],now)[0].players[0].props[0];
  assert.equal(p.source,'provider-fair');assert.ok(Math.abs(p.overProbability-100/224)<.00001);
  assert.ok(Math.abs(countExpectation(p)+Math.log(1-p.overProbability))<.00001);
  raw.odds[no].fairOddsAvailable=false;
  assert.equal(normalizeEvents([raw],now)[0].players[0].props.length,0);
});
test('identical lines with different prices produce different estimates',()=>{
  const price=(stat,p)=>edgeProjection(player,[{...event,players:[{...event.players[0],props:props.map(x=>x.stat===stat?{...x,overProbability:p}:x)}]}],context,now).projection;
  for(const stat of ['touchdowns','receiving_yards','receptions'])assert.ok(price(stat,.7)>price(stat,.3),stat);
  assert.ok(Math.abs(countExpectation({line:.5,overProbability:.25})+Math.log(.75))<1e-9);
  assert.ok(Math.abs(countExpectation({line:.5,overProbability:.75})+Math.log(.25))<1e-9);
});
test('discrete TD projection accounts for price, rather than using the line as the mean',()=>{
  assert.ok(countExpectation({line:1.5,overProbability:.33})<1.5);
  assert.equal(countExpectation({line:.5,overProbability:1}),undefined);
});
test('locked, stale, and unavailable players are not recommended',()=>{
  assert.equal(edgeProjection(player,[event],context,now+3600001).projection,null);
  assert.equal(edgeProjection(player,[event],context,now+16*60000).stale,true);
  assert.equal(edgeProjection({...player,status:'Out'},[event],context,now).projection,null);
  assert.equal(edgeProjection(player,[{...event,locked:true}],context,now).projection,null);
});
test('slot eligibility handles receiving flex correctly',()=>{
  assert.equal(slotEligible('RB','REC_FLEX'),false);assert.equal(slotEligible('TE','REC_FLEX'),true);assert.equal(slotEligible('QB','SUPER_FLEX'),true);assert.equal(slotEligible('QB','FLEX'),false);
});
test('suggestions do not reuse players or include questionable/reserve players',()=>{
  const row=edgeProjection(player,[event],context,now);
  const starter={...row,projection:10,player:{...player,id:'s'}};
  const bench={...row,projection:20,player:{...player,id:'b',role:'Bench'}};
  assert.equal(edgeSuggestions([starter,bench],[]).swaps.length,1);
  assert.equal(edgeSuggestions([starter,{...starter,player:{...player,id:'s2'}},bench],[]).swaps.length,1);
  assert.equal(edgeSuggestions([starter,{...bench,questionable:true}],[]).swaps.length,0);
  assert.equal(edgeSuggestions([starter,{...bench,player:{...bench.player,role:'IR'}}],[]).swaps.length,0);
});
test('UI and API require Elite without an owner restriction',()=>{
  const ui=readFileSync(new URL('../app/FantasyHub.tsx',import.meta.url),'utf8');
  const route=readFileSync(new URL('../app/api/vegas-edge/route.ts',import.meta.url),'utf8');
  assert.match(ui,/const visibleNav = nav;/);
  assert.match(ui,/view === 'Vegas Edge' && entitlement.elite/);
  assert.doesNotMatch(route,/access.owner/);assert.match(route,/if\(!access.elite\)/);
  assert.ok(route.indexOf('if(!access.elite)')<route.indexOf('await vegasFeed'));
});
test('API denies anonymous and non-Elite accounts while allowing non-owner Elite',async()=>{
  const route=readFileSync(new URL('../app/api/vegas-edge/route.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
  for(const [user,access,status,calls]of [[null,{},401,0],[{userId:'u'},{owner:false,elite:true},200,1],[{userId:'u'},{owner:false,elite:false},402,0],[{userId:'u'},{owner:true,elite:false},402,0],[{userId:'u'},{owner:true,elite:true},200,1]]){
    const setup=`let calls=0;const getChatGPTUser=async()=>(${JSON.stringify(user)});const entitlementFor=async()=>(${JSON.stringify(access)});const vegasFeed=async()=>{calls++;return {configured:false,events:[]};};export const count=()=>calls;`;
    const code=ts.transpile(setup+route,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022});
    const mod=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
    const response=await mod.GET();assert.equal(response.status,status);assert.equal(mod.count(),calls);
    const cross=await mod.POST(new Request('https://fantasyhubapp.com/api/vegas-edge',{method:'POST',headers:{origin:'https://other.example'}}));
    assert.equal(cross.status,403);assert.equal(mod.count(),calls);
  }
});
