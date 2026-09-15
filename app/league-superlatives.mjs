/** Result-only awards. Equal scores share honors; missing player scores never become zero. */
export function leagueSuperlatives(games, previousGames, playerName, context = {}) {
  const awards = [];
  const add = (id, label, candidates) => {
    const valid = candidates.filter((entry) => Number.isFinite(entry.value));
    if (!valid.length) return;
    const best = Math.max(...valid.map((entry) => entry.value));
    const winners = valid.filter((entry) => Math.abs(entry.value - best) < 0.000001);
    awards.push({ id, label, recipient: winners.map((entry) => entry.name).join(" · "), detail: winners.length > 1 ? winners.map((entry) => `${entry.name}: ${entry.detail}`).join("; ") + " · Shared honors" : winners[0].detail });
  };
  const decided = games.filter(({ teams }) => teams.length === 2 && teams.every((team) => Number.isFinite(team.points)) && teams[0].points !== teams[1].points);
  const winners = decided.map(({ teams }) => teams[0].points > teams[1].points ? teams[0] : teams[1]);
  const losers = decided.map(({ teams }) => teams[0].points < teams[1].points ? teams[0] : teams[1]);
  add("hard-luck", "HARD-LUCK LOSS", losers.map((team) => ({ value: team.points, name: team.teamName, detail: `${team.points.toFixed(1)} points · Highest-scoring loss` })));
  add("just-enough", "JUST ENOUGH", winners.map((team) => ({ value: -team.points, name: team.teamName, detail: `${team.points.toFixed(1)} points · Lowest-scoring win` })));
  add("shootout", "SHOOTOUT", games.map(({ teams }) => {
    const total = teams.reduce((sum, team) => sum + team.points, 0);
    return { value: total, name: teams.map((team) => team.teamName).join(" vs "), detail: `${total.toFixed(1)} combined points` };
  }));
  const teams = games.flatMap((game) => game.teams);
  for (const bench of [false, true]) {
    add(bench ? "bench-spark" : "mvp", bench ? "BENCH FIREPOWER" : "WEEKLY MVP", teams.flatMap((team) => [...new Set(bench ? team.players : team.starters)].filter((id) => id !== "0" && (!bench || !team.starters.includes(id))).flatMap((id) => {
      const points = team.playerPoints[id];
      return Number.isFinite(points) && points > 0 ? [{ value: points, name: `${playerName(id)} · ${team.teamName}`, detail: `${points.toFixed(1)} points · ${bench ? "Highest bench score" : "Highest starting-player score"}` }] : [];
    })));
  }
  const previous = new Map(previousGames.flatMap((game) => game.teams).map((team) => [team.rosterId, team.points]));
  add("bounce-back", "BIGGEST BOUNCE-BACK", teams.flatMap((team) => {
    const before = previous.get(team.rosterId);
    const gain = team.points - before;
    return Number.isFinite(before) && gain > 0 ? [{ value: gain, name: team.teamName, detail: `+${gain.toFixed(1)} points vs last week` }] : [];
  }));
  const margin = ({ teams: [a, b] }) => Math.abs(a.points - b.points);
  add("heartbreaker", "HEARTBREAKER", decided.map((game, i) => ({ value: -margin(game), name: losers[i].teamName, detail: `Lost by ${margin(game).toFixed(2)} points` })));
  add("wrong-week", "WRONG WEEK, WRONG OPPONENT", losers.flatMap((team) => {
    const others = teams.filter((other) => other.rosterId !== team.rosterId);
    const beat = others.filter((other) => team.points > other.points).length;
    return beat > others.length / 2 ? [{ value: beat, name: team.teamName, detail: `Outscored ${beat} of ${others.length} other teams and still lost` }] : [];
  }));
  add("team-effort", "TEAM EFFORT", teams.flatMap((team) => {
    const count = [...new Set(team.starters)].filter((id) => id !== "0" && team.playerPoints[id] >= 10).length;
    return count ? [{ value: count, name: team.teamName, detail: `${count} starters scored 10+ points` }] : [];
  }));
  add("one-player", "ONE-PLAYER ARMY", teams.flatMap((team) => team.points > 0 ? [...new Set(team.starters)].flatMap((id) => {
    const score = team.playerPoints[id];
    return Number.isFinite(score) && score > 0 ? [{ value: score / team.points, name: `${playerName(id)} · ${team.teamName}`, detail: `${(100 * score / team.points).toFixed(1)}% of team points (${score.toFixed(1)} pts)` }] : [];
  }) : []));
  const { history = [], week = 0, transactions = [], slots = [], players = {} } = context;
  const acquisitions = new Set(transactions.filter((t) => t.status === "complete" && ["waiver", "free_agent"].includes(t.type)).flatMap((t) => Object.entries(t.adds ?? {}).map(([id, roster]) => `${roster}:${id}`)));
  add("waiver-hero", "WAIVER WIRE HERO", teams.flatMap((team) => [...new Set(team.starters)].flatMap((id) => {
    const points = team.playerPoints[id];
    return acquisitions.has(`${team.rosterId}:${id}`) && Number.isFinite(points) && points > 0 ? [{ value: points, name: `${playerName(id)} · ${team.teamName}`, detail: `${points.toFixed(1)} starting points · Added this week` }] : [];
  })));
  const perfect = teams.filter((team) => isPerfectLineup(team, slots, players));
  add("perfect-lineup", "PERFECT LINEUP", perfect.map((team) => ({ value: 1, name: team.teamName, detail: "100% of available legal lineup points · Retrospective" })));
  const histories = new Map(teams.map((team) => [team.rosterId, history.filter((game) => game.week < week && game.teams.some((t) => t.rosterId === team.rosterId)).sort((a,b) => a.week - b.week)]));
  const complete = (list) => list.length === week - 1 && list.every((game, i) => game.week === i + 1);
  const result = (game, id) => Math.sign(game.teams.find(t => t.rosterId === id).points - game.teams.find(t => t.rosterId !== id).points);
  const streak = (id, sign) => {
    const list = histories.get(id) ?? [];
    if (!complete(list)) return 0;
    let count = 0;
    for (const game of [...list].reverse()) { if (result(game, id) !== sign) break; count++; }
    return count;
  };
  add("streak-breaker", "STREAK BREAKER", winners.flatMap((team, i) => {
    const count = streak(losers[i].rosterId, 1);
    return count >= 2 ? [{ value: count, name: team.teamName, detail: `Ended ${losers[i].teamName}'s ${count}-game winning streak` }] : [];
  }));
  add("back-in-business", "BACK IN BUSINESS", winners.flatMap((team) => {
    const count = streak(team.rosterId, -1);
    return count >= 2 ? [{ value: count, name: team.teamName, detail: `Won after ${count} straight losses` }] : [];
  }));
  if (week > 1 && [...histories.values()].every(complete)) {
    const ranks = teams.map((team) => {
      const list = histories.get(team.rosterId);
      return { id: team.rosterId, wins: list.reduce((sum,g) => sum + (result(g,team.rosterId)+1)/2,0), points: list.reduce((sum,g) => sum + g.teams.find(t=>t.rosterId===team.rosterId).points,0) };
    }).sort((a,b)=>b.wins-a.wins || b.points-a.points);
    const leaders = new Set(ranks.filter(t=>t.wins===ranks[0].wins && t.points===ranks[0].points).map(t=>t.id));
    add("giant-slayer", "GIANT SLAYER", winners.flatMap((team,i)=>leaders.has(losers[i].rosterId) ? [{ value: 1, name: team.teamName, detail: `Beat league leader ${losers[i].teamName} · Entering-week record, then points` }] : []));
  }
  const season = teams.flatMap((team) => {
    const prior = histories.get(team.rosterId);
    if (!complete(prior)) return [];
    const list = [...prior, ...games.filter(g=>g.teams.some(t=>t.rosterId===team.rosterId))];
    return [{ team, list, scores: list.map(g=>g.teams.find(t=>t.rosterId===team.rosterId).points) }];
  });
  add("photo-regular", "PHOTO-FINISH REGULAR", season.flatMap(({team,list}) => {
    const count = list.filter(g=>margin(g)<5).length;
    return count >= 2 ? [{value:count,name:team.teamName,detail:`${count} matchups within 5 points this season`}] : [];
  }));
  add("consistency", "CONSISTENCY KING", season.flatMap(({team,scores}) => {
    if(scores.length<3 || scores.some(s=>s<=0)) return [];
    const mean = scores.reduce((a,b)=>a+b,0)/scores.length;
    const sd = Math.sqrt(scores.reduce((sum,s)=>sum+(s-mean)**2,0)/scores.length);
    return [{value:-sd,name:team.teamName,detail:`${sd.toFixed(1)}-point scoring deviation across ${scores.length} weeks`}];
  }));
  add("unlucky", "UNLUCKY SCHEDULE", season.flatMap(({team,list}) => {
    if(list.length<3 || list.filter(g=>result(g,team.rosterId)<0).length<=list.filter(g=>result(g,team.rosterId)>0).length) return [];
    if (list.some(game => game.week < week && history.filter(g => g.week === game.week).flatMap(g => g.teams).length !== teams.length)) return [];
    let beat=0, possible=0;
    for(const game of list){ const mine=game.teams.find(t=>t.rosterId===team.rosterId); const field=[...history.filter(g=>g.week===game.week && g.week<week), ...games.filter(()=>game.week===week)].flatMap(g=>g.teams).filter(t=>t.rosterId!==team.rosterId); possible+=field.length; beat+=field.reduce((sum,t)=>sum+(mine.points>t.points?1:mine.points===t.points?.5:0),0); }
    const rate=possible?beat/possible:0;
    return rate>.5 ? [{value:rate,name:team.teamName,detail:`${(rate*100).toFixed(1)}% all-play win rate, but a losing head-to-head record`}] : [];
  }));
  return awards;
}

// Maximum-weight bipartite assignment, including FLEX and multi-position players.
export function optimalLineupPoints(team, rosterSlots, directory) {
  const slots = rosterSlots.filter(s=>!["BN","IR","TAXI"].includes(s));
  const flex = { FLEX:["RB","WR","TE"], SUPER_FLEX:["QB","RB","WR","TE"], REC_FLEX:["WR","TE"], WRRB_FLEX:["RB","WR"], IDP_FLEX:["DL","LB","DB","DE","DT","CB","S"] };
  if(!slots.length || slots.length>24 || team.starters.length!==slots.length || team.starters.includes("0")) return null;
  const ids=[...new Set(team.players)];
  if(!ids.length || ids.some(id=>!Number.isFinite(team.playerPoints[id]) || !directory[id]?.position) || team.starters.some(id=>!ids.includes(id)) || new Set(team.starters).size!==slots.length) return null;
  const eligible=(id,slot)=> (directory[id].fantasy_positions ?? [directory[id].position]).some(p=>(flex[slot]??[slot]).includes(p));
  if(team.starters.some((id,i)=>!eligible(id,slots[i]))) return null;
  const n=2+ids.length+slots.length, source=n-2,sink=n-1, graph=Array.from({length:n},()=>[]);
  const edge=(a,b,cost)=>{graph[a].push({to:b,rev:graph[b].length,cap:1,cost});graph[b].push({to:a,rev:graph[a].length-1,cap:0,cost:-cost});};
  ids.forEach((id,i)=>{edge(source,i,-team.playerPoints[id]);slots.forEach((s,j)=>{if(eligible(id,s))edge(i,ids.length+j,0);});});
  slots.forEach((_,j)=>edge(ids.length+j,sink,0));
  let total=0;
  for(let flow=0;flow<slots.length;flow++){
    const dist=Array(n).fill(Infinity), prev=Array(n);dist[source]=0;
    for(let pass=0;pass<n-1;pass++){let changed=false;graph.forEach((edges,a)=>edges.forEach((e,i)=>{if(e.cap && dist[a]+e.cost<dist[e.to]-1e-9){dist[e.to]=dist[a]+e.cost;prev[e.to]=[a,i];changed=true;}}));if(!changed)break;}
    if(!Number.isFinite(dist[sink]))return null;
    total-=dist[sink];for(let v=sink;v!==source;){const [a,i]=prev[v],e=graph[a][i];e.cap--;graph[v][e.rev].cap++;v=a;}
  }
  return total;
}

export function isPerfectLineup(team, rosterSlots, directory) {
  const best=optimalLineupPoints(team,rosterSlots,directory);
  return best !== null && Math.abs(best-team.starters.reduce((sum,id)=>sum+team.playerPoints[id],0))<.005;
}
