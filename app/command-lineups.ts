import { stackPick } from './stacks';
type Player = {id:string;name:string;team:string;position:string;role:string;status:string;opponent?:string;projection:number;floor:number;ceiling:number;projectionLocked?:boolean};
const reserve=(s:string)=>['BENCH','BN','BE','IR','TAXI','RESERVE'].includes(s.toUpperCase());
const eligible=(p:Player,s:string)=>{
  if(['SUPER_FLEX','SUPERFLEX','QB_FLEX','OP','Q/W/R/T'].includes(s))return ['QB','RB','WR','TE'].includes(p.position);
  if(['FLEX','W/R/T'].includes(s))return ['RB','WR','TE'].includes(p.position);
  if(['REC_FLEX','WR_TE','W/T'].includes(s))return ['WR','TE'].includes(p.position);
  if(['WR_RB_FLEX','RB_WR_FLEX','WRRB_FLEX','W/R'].includes(s))return ['WR','RB'].includes(p.position);
  return p.position===s;
};
export function commandLineup<T extends Player>(players:T[],required:string[]|undefined,metric:'floor'|'projection'|'ceiling'|((player:T)=>number),stackAggression=50) {
  const slots=(required?.length?required:players.filter(p=>!reserve(p.role)).map(p=>p.role)).map(s=>s.toUpperCase()).filter(s=>!reserve(s));
  const assigned:(T|null)[]=slots.map(()=>null),fixed=new Set<number>();
  players.filter(p=>p.projectionLocked&&!reserve(p.role)).forEach(p=>{const i=slots.findIndex((s,i)=>!fixed.has(i)&&s===p.role.toUpperCase());if(i>=0){assigned[i]=p;fixed.add(i);}});
  const pool=[...new Map(players.map(p=>[p.id,p])).values()].filter(p=>!p.projectionLocked&&!['IR','TAXI','RESERVE'].includes(p.role.toUpperCase())&&!/^(out|ir|injured|suspend|doubt|pup|nfi|inactive)/i.test(p.status)&&p.opponent!=='BYE');
  const order=slots.map((_,i)=>i).sort((a,b)=>pool.filter(p=>eligible(p,slots[a])).length-pool.filter(p=>eligible(p,slots[b])).length);
  const place=(p:T,seen:Set<number>):boolean=>{for(const i of order){if(fixed.has(i)||seen.has(i)||!eligible(p,slots[i]))continue;seen.add(i);const previous=assigned[i];if(!previous||place(previous,seen)){assigned[i]=p;return true;}}return false;};
  const score=(p:T)=>typeof metric==='function'?metric(p):p[metric];
  const scores=new Map(pool.map(p=>[p.id,score(p)]));
  pool.sort((a,b)=>scores.get(b.id)!-scores.get(a.id)!||a.id.localeCompare(b.id)).forEach(p=>place(p,new Set()));
  if(stackAggression>65)for(const i of order){
    const current=assigned[i];if(!current||fixed.has(i))continue;
    const options=[current,...pool.filter(p=>eligible(p,slots[i])&&!assigned.some(a=>a?.id===p.id))];
    const roster=assigned.flatMap((p,j)=>p?[{...p,role:slots[j]}]:[]);
    assigned[i]=stackPick(options,roster,stackAggression,score)??current;
  }
  return slots.map((slot,i)=>({slot,player:assigned[i]}));
}
