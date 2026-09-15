import test from 'node:test';
import assert from 'node:assert/strict';
import { leagueSuperlatives, isPerfectLineup } from '../app/league-superlatives.mjs';
const team = (id, points) => ({ rosterId: id, teamName: `Team ${id}`, points, players: ['a', 'b'], starters: ['a'], playerPoints: { a: 30, b: 40 } });
const games = [{ teams: [team(1, 120), team(2, 110)] }, { teams: [team(3, 80), team(4, 70)] }];
test('awards use actual wins, losses, starters, and bench scores', () => {
  const awards = leagueSuperlatives(games, [], (id) => id);
  assert.equal(awards.find(a => a.id === 'hard-luck').recipient, 'Team 2');
  assert.equal(awards.find(a => a.id === 'just-enough').recipient, 'Team 3');
  assert.equal(awards.find(a => a.id === 'shootout').detail, '230.0 combined points');
  assert.match(awards.find(a => a.id === 'mvp').detail, /30.0.*Shared honors/);
  assert.match(awards.find(a => a.id === 'bench-spark').detail, /40.0/);
  assert.equal(awards.some(a => a.id === 'bounce-back'), false);
});
test('legal optimum accounts for FLEX instead of selecting top players blindly', () => {
  const players = { a:{position:'QB'}, b:{position:'WR'}, c:{position:'RB'}, d:{position:'QB'} };
  const t = {players:Object.keys(players),starters:['a','b','c'],playerPoints:{a:20,b:30,c:25,d:40}};
  assert.equal(isPerfectLineup(t,['QB','WR','FLEX','BN'],players),false);
  assert.equal(isPerfectLineup({...t,starters:['d','b','c']},['QB','WR','FLEX','BN'],players),true);
  assert.equal(isPerfectLineup({...t,starters:['d','a','b']},['QB','WR','FLEX'],players),false);
  assert.equal(isPerfectLineup({...t,playerPoints:{}},['QB','WR','FLEX'],players),false);
  assert.equal(isPerfectLineup({...t,starters:['d','b','b']},['QB','WR','FLEX'],players),false);
});
test('history-backed awards require real streaks and enough completed weeks', () => {
  const game=(week,a,b)=>({week,teams:[team(1,a),team(2,b)]});
  const history=[game(1,99,100),game(2,99,101)];
  const current=[game(3,102,101)];
  const awards=leagueSuperlatives(current,[],String,{week:3,history});
  for(const id of ['giant-slayer','streak-breaker','back-in-business','photo-regular','consistency'])assert.ok(awards.some(a=>a.id===id),id);
  const incomplete=leagueSuperlatives(current,[],String,{week:3,history:history.slice(1)});
  for(const id of ['giant-slayer','streak-breaker','back-in-business','photo-regular','consistency'])assert.ok(!incomplete.some(a=>a.id===id),id);
});
test('waiver hero excludes pending moves, trades, bench players and other teams', () => {
  const transactions=[{status:'complete',type:'waiver',adds:{a:1,b:2}},{status:'pending',type:'waiver',adds:{a:2}},{status:'complete',type:'trade',adds:{a:3}}];
  const award=leagueSuperlatives(games,[],String,{transactions}).find(a=>a.id==='waiver-hero');
  assert.equal(award.recipient,'a · Team 1');
});
test('all-play luck and one-player contribution use the full scoring field', () => {
  const round=week=>[{week,teams:[team(1,110),team(2,120)]},{week,teams:[team(3,90),team(4,80)]}];
  const awards=leagueSuperlatives(round(3),round(2),String,{week:3,history:[...round(1),...round(2)]});
  assert.equal(awards.find(a=>a.id==='unlucky').recipient,'Team 1');
  assert.equal(awards.find(a=>a.id==='wrong-week').recipient,'Team 1');
  assert.equal(awards.find(a=>a.id==='one-player').recipient,'a · Team 4');
  assert.ok(awards.find(a=>a.id==='team-effort'));
  assert.equal(awards.find(a=>a.id==='heartbreaker').recipient,'Team 1 · Team 4');
});
test('bounce-back requires prior-week data and a positive improvement', () => {
  const awards = leagueSuperlatives(games, [{ teams: [team(1, 90), team(2, 130)] }], String);
  assert.equal(awards.find(a => a.id === 'bounce-back').recipient, 'Team 1');
});
test('ties do not earn winning or losing awards; missing stats do not earn player awards', () => {
  const a = { ...team(1, 90), playerPoints: {} };
  const b = { ...team(2, 90), playerPoints: {} };
  assert.deepEqual(leagueSuperlatives([{ teams: [a, b] }], [], String).map(a => a.id), ['shootout']);
  assert.deepEqual(leagueSuperlatives([], [], String), []);
});
