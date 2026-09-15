import { optimalLineupPoints } from './league-superlatives.mjs';

/** Both the page and the shared report consume this same result-only dataset. */
export function weeklyVisuals(games, history, directory, slots, identities, week) {
  const teams=games.flatMap(g=>g.teams);
  const playerName=id=>directory[id]?.full_name || [directory[id]?.first_name,directory[id]?.last_name].filter(Boolean).join(' ') || `Player ${id}`;
  const leaders=bench=>{
    const groups=new Map();
    for(const team of teams)for(const id of new Set(bench?team.players:team.starters)){
      const position=directory[id]?.position;
      const points=team.playerPoints[id];
      if(id==='0'||!position||!Number.isFinite(points)||points<=0||(bench&&team.starters.includes(id)))continue;
      const entry={id,position,name:playerName(id),points,teamName:team.teamName,rosterId:team.rosterId,nflTeam:directory[id]?.team??'',image:/^\d+$/.test(id)?`https://sleepercdn.com/content/nfl/players/${id}.jpg`:null};
      const current=groups.get(position)??[];
      if(!current.length||points>current[0].points)groups.set(position,[entry]);
      else if(points===current[0].points)current.push(entry);
    }
    const order=['QB','RB','WR','TE','K','DEF','DL','LB','DB'];
    return [...groups.entries()].sort(([a],[b])=>(order.includes(a)?order.indexOf(a):99)-(order.includes(b)?order.indexOf(b):99)||a.localeCompare(b)).flatMap(([,entries])=>entries.map(e=>({...e,shared:entries.length>1})));
  };
  const efficiency=teams.map(team=>{
    const maximum=optimalLineupPoints(team,slots,directory);
    const actual=team.starters.every(id=>id!=='0'&&Number.isFinite(team.playerPoints[id]))?team.starters.reduce((sum,id)=>sum+team.playerPoints[id],0):null;
    return {rosterId:team.rosterId,teamName:team.teamName,avatar:team.avatar??null,actual,maximum,percent:maximum!==null&&maximum>0&&actual!==null&&actual>=0?Math.min(100,actual/maximum*100):null};
  }).sort((a,b)=>(b.percent??-1)-(a.percent??-1));
  const records=through=>identities.map(team=>{
    const played=history.filter(g=>g.week<=through&&g.teams.some(t=>t.rosterId===team.rosterId));
    let wins=0,losses=0,ties=0,pf=0,pa=0;
    for(const g of played){const own=g.teams.find(t=>t.rosterId===team.rosterId),opp=g.teams.find(t=>t.rosterId!==team.rosterId);pf+=own.points;pa+=opp.points;if(own.points>opp.points)wins++;else if(own.points<opp.points)losses++;else ties++;}
    return {...team,wins,losses,ties,pf,pa,complete:played.length===through};
  }).sort((a,b)=>(b.wins+b.ties*.5)-(a.wins+a.ties*.5)||b.pf-a.pf);
  const prior=records(Math.max(0,week-1)), current=records(week);
  const ranks=list=>list.map((t,i)=>({...t,rank:i>0&&t.wins+t.ties*.5===list[i-1].wins+list[i-1].ties*.5&&t.pf===list[i-1].pf?list.findIndex(v=>v.wins+v.ties*.5===t.wins+t.ties*.5&&v.pf===t.pf)+1:i+1}));
  const previous=new Map(ranks(prior).map(t=>[t.rosterId,t.rank]));
  const standings=ranks(current).map(t=>({...t,movement:week>1&&t.complete&&prior.every(p=>p.complete)?previous.get(t.rosterId)-t.rank:null}));
  return {starters:leaders(false),bench:leaders(true),efficiency,standings};
}
