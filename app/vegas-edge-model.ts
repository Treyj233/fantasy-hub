export type EdgePlayer = { id: string; name: string; position: string; team: string; role: string; status: string; opponent?: string; projection: number; leagueProjection?: number | null };
export type EdgeContext = { scoring: string; tePremium: number; passTouchdown: number; interception: number; scoringRules?: Record<string, number>; rosterSlots: string[] };
export type EdgeProp = { stat: string; line: number; overProbability: number; books: number; source?: 'paired-books' | 'provider-fair'; };
export type EdgeEvent = { id: string; startsAt: string; home: string; away: string; locked: boolean; updatedAt: string; total: number | null; homeSpread: number | null; players: { name: string; aliases?: string[]; team: string; status: string; props: EdgeProp[] }[] };
export type EdgeFeed = { configured: boolean; events: EdgeEvent[]; message: string; checkedAt?: string; usage?: number; budget?: number };
const number = (v: unknown) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
const median = (values: number[]) => { const v = [...values].sort((a,b)=>a-b); return v.length ? (v[Math.floor((v.length-1)/2)] + v[Math.floor(v.length/2)]) / 2 : null; };
export const teamCode = (s: string) => ({JAC:'JAX',WSH:'WAS',LA:'LAR'}[s.toUpperCase()] ?? s.toUpperCase());
const nameKey = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z]/g,'');
// Allow only the offensive markets this model understands. Apply after cache
// reads too, so older snapshots cannot display unrelated defensive props.
function positionMarket(position:string,stat:string) {
  const skill=['rushing_yards','receiving_yards','receiving_receptions','receptions','touchdowns','rushing_receiving_touchdowns'];
  if(position==='QB')return [...skill,'passing_yards','passing_touchdowns','passing_interceptions'].includes(stat);
  return ['RB','WR','TE'].includes(position)&&skill.includes(stat);
}
export function impliedProbability(value: unknown) { const n = number(value); return n === null || Math.abs(n) < 100 ? null : n < 0 ? -n / (-n + 100) : 100 / (n + 100); }
export function refreshInterval(startsAt: string, now = Date.now()) { const left = Date.parse(startsAt)-now; return left <= 0 ? Infinity : left <= 2*3600000 ? 600000 : left <= 86400000 ? 7200000 : 43200000; }
// Invert a Poisson tail for discrete TD/INT props. A line of 1.5 with
// P(over)=0.33 is not an expected 1.5 touchdowns. This is an approximation.
export function countExpectation(prop:EdgeProp|undefined) {
  if(!prop || !Number.isFinite(prop.line) || !Number.isFinite(prop.overProbability) || prop.line<0 || prop.line>20 || prop.overProbability<=0 || prop.overProbability>=1)return undefined;
  const k=Math.floor(prop.line);
  let low=0,high=60;
  for(let i=0;i<50;i++){
    const mean=(low+high)/2;let term=Math.exp(-mean),cdf=term;
    for(let n=1;n<=k;n++){term*=mean/n;cdf+=term;}
    if(1-cdf<prop.overProbability)low=mean;else high=mean;
  }
  return (low+high)/2;
}
// A single priced threshold cannot uniquely identify a yardage mean. Use an
// explicit logistic location approximation (scale = 20% of line, min 1 yard).
// This uses only the line and its no-vig price, never platform projections.
export function marketExpectation(prop:EdgeProp|undefined) {
  if(!prop||!Number.isFinite(prop.line)||!Number.isFinite(prop.overProbability)||prop.line<0||prop.overProbability<=0||prop.overProbability>=1)return undefined;
  if(!prop.stat.endsWith('_yards'))return countExpectation(prop);
  return Math.max(0,prop.line+Math.max(1,prop.line*.2)*Math.log(prop.overProbability/(1-prop.overProbability)));
}
// Provider payload stays on the server. Only validated, paired main markets are exposed.
export function normalizeEvents(raw: unknown, now = Date.now()): EdgeEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((e): EdgeEvent[] => {
    if (!e?.eventID || !Number.isFinite(Date.parse(e.status?.startsAt))) return [];
    const odds = e.odds ?? {};
    const team = (id: string) => !id ? '' : id === e.teams?.home?.teamID ? teamCode(e.teams.home.names?.short ?? '') : id === e.teams?.away?.teamID ? teamCode(e.teams.away.names?.short ?? '') : '';
    const activeBooks = (o: any) => Object.entries(o?.byBookmaker ?? {}).filter(([,b]: any)=>b.available === true && b.isMainLine !== false);
    const gameLine = (id: string, field: string) => median(activeBooks(odds[id]).flatMap(([,b]: any)=>{const n=number(b[field]);return n===null?[]:[n];}));
    return [{ id:e.eventID, startsAt:e.status.startsAt, home:team(e.teams?.home?.teamID), away:team(e.teams?.away?.teamID), locked:Boolean(e.status.started || e.status.ended || e.status.cancelled || e.status.delayed || e.status.live), updatedAt:new Date(now).toISOString(), total:gameLine('points-all-game-ou-over','overUnder'),homeSpread:gameLine('points-home-game-sp-home','spread'), players:Object.entries(e.players ?? {}).map(([id,p]: any)=>({name:p.name ?? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim(),aliases:p.firstName&&p.lastName?[`${p.firstName} ${p.lastName}`]:[],team:team(p.teamID),status:p.status ?? '',props:Object.values(odds).flatMap((o: any): EdgeProp[]=>{
      if(o.statEntityID!==id || typeof o.statID!=='string' || o.periodID!=='game' || o.started || o.ended || o.cancelled) return [];
      if(o.statID==='touchdowns' && o.betTypeID==='yn' && o.sideID==='yes') {
        const no=odds[o.opposingOddID] ?? odds[`touchdowns-${id}-game-yn-no`];
        const yesP=impliedProbability(o.fairOdds),noP=impliedProbability(no?.fairOdds);
        const books=activeBooks(o).length;
        // Sportsbooks commonly offer only Yes. Use provider's explicit fair
        // consensus pair, never mistake raw one-sided book odds for fair odds.
        if(books && o.fairOddsAvailable===true && no?.fairOddsAvailable===true && !no.started && !no.ended && !no.cancelled && yesP!==null && noP!==null)
          return [{stat:'touchdowns',line:.5,overProbability:yesP/(yesP+noP),books,source:'provider-fair'}];
        return [];
      }
      if(o.betTypeID!=='ou' || o.sideID!=='over')return [];
      const under:any = odds[o.opposingOddID] ?? odds[`${o.statID}-${id}-game-ou-under`];
      const pairs=activeBooks(o).flatMap(([book,b]: any)=>{const u=under?.byBookmaker?.[book]; const line=number(b.overUnder), ul=number(u?.overUnder), op=impliedProbability(b.odds),up=impliedProbability(u?.odds);return u?.available===true && u.isMainLine!==false && line!==null && line===ul && op!==null && up!==null ? [{line,p:op/(op+up)}]:[];});
      if(!pairs.length) return [];
      // Choose a real quoted line with the most paired books. Never combine
      // the median line with probabilities quoted at different thresholds.
      const lines=[...new Set(pairs.map(p=>p.line))].sort((a,b)=>pairs.filter(p=>p.line===b).length-pairs.filter(p=>p.line===a).length||a-b);
      const line=lines[0],sameLine=pairs.filter(p=>p.line===line);
      return [{stat:o.statID,line,overProbability:median(sameLine.map(p=>p.p))!,books:sameLine.length,source:'paired-books'}];
    })})) }];
  });
}
export function edgeProjection(player: EdgePlayer, events: EdgeEvent[], context: EdgeContext, now=Date.now()) {
  const baseline = player.leagueProjection ?? player.projection;
  const matches = events.flatMap(event=>event.players.filter(p=>p.team===teamCode(player.team) && [p.name,...(p.aliases ?? [])].some(name=>nameKey(name)===nameKey(player.name))).map(p=>({event,p})));
  const match=matches.length===1?matches[0]:null;
  const props=[...new Map([...(match?.p.props ?? [])].filter(p=>positionMarket(player.position,p.stat)).sort((a,b)=>Number(a.source==='provider-fair')-Number(b.source==='provider-fair')).map(p=>[p.stat,p])).values()];
  const find=(...names:string[])=>props.find(p=>names.includes(p.stat));
  const value=(...names:string[])=>marketExpectation(find(...names));
  const weights={pass_yd:0,rush_yd:0,rec_yd:0,pass_td:0,pass_int:0,rush_td:0,rec_td:0,rec:0,...context.scoringRules};
  const py=value('passing_yards'),pt=countExpectation(find('passing_touchdowns')),pi=countExpectation(find('passing_interceptions')),ry=value('rushing_yards'),cy=value('receiving_yards'),c=value('receiving_receptions','receptions');
  const td=find('touchdowns','rushing_receiving_touchdowns');
  // A 0.5 TD line measures P(at least one), not expected TD count. Poisson
  // conversion is an explicit approximation; never present it as a direct prop.
  const expectedTd=countExpectation(td);
  const qb=player.position==='QB';
  const complete=qb ? py!==undefined && pt!==undefined && pi!==undefined : ['RB','WR','TE'].includes(player.position) && (player.position==='RB'?ry!==undefined:cy!==undefined) && cy!==undefined && c!==undefined && expectedTd!==undefined && weights.rush_td===weights.rec_td;
  const unavailable=/^(out|ir|injured reserve|suspend|doubt|pup|nfi|inactive)/i.test(player.status) || /^(out|ir|suspend|doubt)/i.test(match?.p.status ?? '') || player.opponent?.toUpperCase()==='BYE';
  const questionable=/question/i.test(player.status+' '+(match?.p.status ?? ''));
  const locked=Boolean(match && (match.event.locked || Date.parse(match.event.startsAt)<=now));
  const stale=Boolean(match && now-Date.parse(match.event.updatedAt)>refreshInterval(match.event.startsAt,now)*1.5);
  const points=qb ? (py??0)*weights.pass_yd+(pt??0)*weights.pass_td+(pi??0)*weights.pass_int+(ry??0)*weights.rush_yd : (ry??0)*weights.rush_yd+(cy??0)*weights.rec_yd+(c??0)*(weights.rec+(player.position==='TE'?context.tePremium:0))+(expectedTd??0)*weights.rush_td;
  const scoringKnown=Boolean(context.scoringRules && Object.keys(context.scoringRules).length);
  const usable=Boolean(complete && !locked && !stale && !unavailable && scoringKnown);
  // Platform projections are comparison-only. No platform contribution is
  // added to the odds-derived estimate, including for unmodeled scoring stats.
  const projection=usable?Math.round(points*10)/10:null;
  return {player,baseline,projection,delta:projection===null?null:Math.round((projection-baseline)*10)/10,props,event:match?.event,usable,questionable,locked,stale,label:locked?'Locked':unavailable?'Unavailable':!scoringKnown?'Refresh league scoring':stale?'Stale lines':usable?'Odds implied':props.length?'Partial coverage':'Awaiting props',modeledTd:td?.line===.5};
}
export function slotEligible(position:string, slot:string) {
  const s=slot.toUpperCase().replace(/\s/g,'_');
  if(['SUPER_FLEX','SUPERFLEX','QB_FLEX','Q/W/R/T'].includes(s))return ['QB','RB','WR','TE'].includes(position);
  if(['FLEX','W/R/T'].includes(s))return ['RB','WR','TE'].includes(position);
  if(['REC_FLEX','WR_TE_FLEX','W/T'].includes(s))return ['WR','TE'].includes(position);
  if(['WR_RB_FLEX','RB_WR_FLEX','W/R'].includes(s))return ['WR','RB'].includes(position);
  return position===s;
}
export const isBench=(role:string)=>['BENCH','BN','BE'].includes(role.toUpperCase());
export const isReserve=(role:string)=>isBench(role)||['IR','TAXI','RESERVE'].includes(role.toUpperCase());
export function edgeSuggestions(roster: ReturnType<typeof edgeProjection>[], waivers: ReturnType<typeof edgeProjection>[]) {
  const ready=(r:ReturnType<typeof edgeProjection>)=>r.usable&&!r.questionable;
  const starters=roster.filter(r=>!isReserve(r.player.role) && ready(r));
  const bench=roster.filter(r=>isBench(r.player.role)&&ready(r));
  const swaps=starters.flatMap(out=>bench.filter(p=>slotEligible(p.player.position,out.player.role)).map(into=>({out,into,gain:Math.round((into.projection!-out.projection!)*10)/10}))).filter(s=>s.gain>=1).sort((a,b)=>b.gain-a.gain);
  const used=new Set<string>();
  const selected=swaps.filter(s=>{if(used.has(s.out.player.id)||used.has(s.into.player.id))return false;used.add(s.out.player.id);used.add(s.into.player.id);return true;});
  const targets=waivers.filter(ready).flatMap(into=>{
    const options=starters.filter(out=>slotEligible(into.player.position,out.player.role)).sort((a,b)=>a.projection!-b.projection!);
    const out=options[0];const gain=out?Math.round((into.projection!-out.projection!)*10)/10:0;
    return gain>=1?[{out,into,gain}]:[];
  }).sort((a,b)=>b.gain-a.gain).slice(0,5);
  return {swaps:selected,targets};
}
