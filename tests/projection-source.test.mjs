import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const moduleUrl=(source)=>`data:text/javascript;base64,${Buffer.from(ts.transpile(source,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022})).toString('base64')}`;
const edgeUrl=moduleUrl(readFileSync(new URL('../app/vegas-edge-model.ts',import.meta.url),'utf8'));
const source=readFileSync(new URL('../app/projection-source.ts',import.meta.url),'utf8').replace("'./vegas-edge-model'",JSON.stringify(edgeUrl));
const {projectionAdapter,platformPlayer,VEGAS_PROJECTION_LABEL}=await import(moduleUrl(source));
const now=Date.parse('2026-09-13T16:00:00Z');
const rules={rec:1,rec_yd:.1,rush_yd:.1,rush_td:6,rec_td:6};
const context={scoring:'PPR',scoringRules:rules,rosterSlots:['WR'],tePremium:0,passTouchdown:4,interception:-2};
const p={id:'p',name:'Test Receiver',team:'BUF',position:'WR',role:'WR',status:'Healthy',projection:10,leagueProjection:10,floor:6,ceiling:16};
const event={id:'e',home:'BUF',away:'NYJ',startsAt:new Date(now+3600000).toISOString(),updatedAt:new Date(now).toISOString(),locked:false,total:45,homeSpread:-3,players:[{name:p.name,team:'BUF',status:'active',props:[{stat:'receiving_yards',line:80.5,overProbability:.5,books:2},{stat:'receiving_receptions',line:6.5,overProbability:.5,books:2},{stat:'touchdowns',line:.5,overProbability:.5,books:2}]}]};
const schedule={season:2026,weeks:[{week:1,games:[{date:event.startsAt,home:{abbreviation:'BUF'},away:{abbreviation:'NYJ'}}]}]};
const on=projectionAdapter(true,[event],schedule,now),off=projectionAdapter(false,[event],schedule,now);
test('toggle changes weekly projection and ranges, restores platform exactly',()=>{
  const before=structuredClone(p),changed=on.player(p,context,2026,1);
  assert.ok(changed.projection>p.projection);assert.equal(changed.leagueProjection,changed.projection);
  assert.ok(changed.floor>p.floor);assert.ok(changed.ceiling>p.ceiling);
  assert.deepEqual(p,before);assert.deepEqual(off.player(changed,context,2026,1),p);
});
test('repeat application never compounds the odds estimate',()=>{
  const once=on.player(p,context,2026,1);
  assert.equal(on.player(once,context,2026,1).projection,once.projection);
  assert.deepEqual(platformPlayer(once),p);
});
test('Vegas estimate is entirely independent of platform projections',()=>{
  const low=on.player({...p,projection:1,leagueProjection:1},context,2026,1);
  const high=on.player({...p,projection:99,leagueProjection:99},context,2026,1);
  assert.equal(low.projection,high.projection);
  // 80.5 receiving yards + 6.5 receptions + odds-implied TD expectation.
  assert.equal(low.projection,Math.round((8.05+6.5+6*Math.log(2))*10)/10);
});
test('week, season and missing markets fail to labeled platform fallback',()=>{
  assert.equal(on.player(p,context,2026,2).projection,p.projection);
  assert.equal(on.player(p,context,2025,1).projectionOrigin,'Platform fallback');
  assert.equal(on.player({...p,name:'Someone Else'},context,2026,1).projectionOrigin,'Platform fallback');
});
const board=(scoring)=>({league:{season:'2026',provider:'Sleeper',projectionSource:'Sleeper Projections',scoring},week:1,matchups:[{status:'Live',teams:[{points:22.4,topPlayers:[{id:p.id,name:p.name,position:'WR',nflTeam:'BUF',projection:10,points:4.2,gameProgress:.25,isStarter:true,lineupSlot:'WR'}]}]}]});
test('scoreboard overlay preserves every actual score and game progress',()=>{
  const raw=board(rules),copy=structuredClone(raw),changed=on.scoreboard(raw);
  assert.equal(changed.league.projectionSource,VEGAS_PROJECTION_LABEL);
  assert.equal(changed.matchups[0].teams[0].points,22.4);
  const cp=changed.matchups[0].teams[0].topPlayers[0];assert.equal(cp.points,4.2);assert.equal(cp.gameProgress,.25);assert.ok(cp.projection>10);
  assert.deepEqual(raw,copy);assert.equal(off.scoreboard(raw),raw);
});
test('each league uses its own reception scoring rather than the active league',()=>{
  const ppr=on.scoreboard(board(rules)).matchups[0].teams[0].topPlayers[0].projection;
  const standard=on.scoreboard(board({...rules,rec:0})).matchups[0].teams[0].topPlayers[0].projection;
  assert.ok(ppr>standard);
});
test('last fresh pregame estimate can remain after kickoff without replacing actual scores',()=>{
  const fresh={...event,updatedAt:new Date(now+55*60000).toISOString()};
  const live=projectionAdapter(true,[fresh],schedule,now+65*60000);
  assert.equal(live.player(p,context,2026,1).projectionOrigin,VEGAS_PROJECTION_LABEL);
});
test('game day impact remaining projection scales, fantasy points do not',()=>{
  const raw={league:{season:'2026',scoring:rules},week:1,games:[{impactPlayers:[{...p,nflTeam:'BUF',fantasyPoints:8,remainingProjection:5}]}]};
  const changed=on.nflGames(raw,null).games[0].impactPlayers[0];
  assert.equal(changed.fantasyPoints,8);assert.equal(changed.remainingProjection,changed.projection*.5);
});
test('root keeps raw platform caches and only authorizes owner Elite mode',()=>{
  const ui=readFileSync(new URL('../app/FantasyHub.tsx',import.meta.url),'utf8');
  assert.match(ui,/useProjectionController\(entitlement.owner && entitlement.elite/);
  assert.match(ui,/roster=\{platformPlayers\} waivers=\{platformWaivers\}/);
  assert.match(ui,/rawScores, setScores/);assert.match(ui,/projectionSource.scoreboard\(rawData\)/);
  const page=readFileSync(new URL('../app/VegasEdge.tsx',import.meta.url),'utf8');
  assert.match(page,/role="switch" aria-checked=\{enabled\}/);
});
