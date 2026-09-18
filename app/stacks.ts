export type StackPlayer = {id:string;name:string;team:string;position:string;role:string;status?:string;opponent?:string;projection:number;projectionLocked?:boolean};
const team=(s:string)=>({WSH:'WAS',JAC:'JAX',LA:'LAR'}[s]??s)?.trim().toUpperCase();
export const stackStarter=(p:StackPlayer)=>!['BN','BE','BENCH','IR','TAXI','RESERVE'].includes(p.role.toUpperCase());
const available=(p:StackPlayer)=>!(/^(out|ir|injured|suspend|doubt|pup|nfi|inactive)/i.test(p.status??''))&&p.opponent!=='BYE';
export const stackPair=(a:StackPlayer,b:StackPlayer)=>a.id!==b.id&&Boolean(team(a.team))&&team(a.team)===team(b.team)&&((a.position==='QB'&&['WR','TE'].includes(b.position))||(b.position==='QB'&&['WR','TE'].includes(a.position)));
export function stackPartners(player:StackPlayer,roster:StackPlayer[]) {return roster.filter(p=>stackStarter(p)&&available(p)&&stackPair(player,p));}
export function stackConnections(yours:StackPlayer[],theirs:StackPlayer[]) {
  const own=yours.filter(p=>stackStarter(p)&&available(p)),opp=theirs.filter(p=>stackStarter(p)&&available(p));
  return [
    ...own.filter(p=>p.position==='QB').flatMap(q=>own.filter(p=>stackPair(q,p)).map(r=>({kind:'Your Stack',qb:q,receiver:r,direction:'Your QB → Your receiver'}))),
    ...opp.filter(p=>p.position==='QB').flatMap(q=>opp.filter(p=>stackPair(q,p)).map(r=>({kind:'Opponent Stack',qb:q,receiver:r,direction:'Their QB → Their receiver'}))),
    ...own.filter(p=>p.position==='QB').flatMap(q=>opp.filter(p=>stackPair(q,p)).map(r=>({kind:'Split Stack',qb:q,receiver:r,direction:'Your QB → Their receiver'}))),
    ...opp.filter(p=>p.position==='QB').flatMap(q=>own.filter(p=>stackPair(q,p)).map(r=>({kind:'Split Stack',qb:q,receiver:r,direction:'Their QB → Your receiver'}))),
  ];
}
// A correlation tiebreaker, never a change to displayed fantasy projections.
export function stackPick<T extends StackPlayer>(options:T[],roster:T[],aggression:number,score:(p:T)=>number):T|undefined {
  const ranked=[...options].sort((a,b)=>score(b)-score(a));
  const best=ranked[0];
  if(!best||aggression<=65||best.projectionLocked||!available(best))return best;
  const candidates=ranked.filter(p=>available(p)&&!p.projectionLocked&&Math.abs(p.projection-best.projection)<=1&&Math.abs(p.projection-best.projection)<=Math.min(p.projection,best.projection)*.1&&Math.abs(score(p)-score(best))<=1);
  const partners=(p:T)=>stackPartners(p,roster.filter(r=>!options.some(o=>o.id===r.id))).length;
  return candidates.sort((a,b)=>partners(b)-partners(a)||score(b)-score(a))[0]??best;
}
