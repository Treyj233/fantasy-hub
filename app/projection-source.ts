import { edgeProjection, teamCode, type EdgeContext, type EdgeEvent, type EdgePlayer } from './vegas-edge-model';

export type ProjectionSchedule = {season:number|string;weeks:{week:number;games:{date:string;home:{abbreviation:string};away:{abbreviation:string}}[]}[]};
export const VEGAS_PROJECTION_LABEL='Vegas Implied Projections';
type Projectable=EdgePlayer & {floor?:number;ceiling?:number;projectionOrigin?:string;projectionLocked?:boolean;platformSnapshot?:{projection:number;leagueProjection?:number|null;floor?:number;ceiling?:number}};
export function platformPlayer<T extends Projectable>(p:T):T {
  if(!p.platformSnapshot&&!p.projectionOrigin&&p.projectionLocked===undefined)return p;
  const {platformSnapshot,projectionOrigin,projectionLocked,...rest}=p;
  return {...rest,...platformSnapshot} as T;
}
export function projectionAdapter(enabled:boolean,events:EdgeEvent[],schedule:ProjectionSchedule|null,now=Date.now()) {
  const forWeek=(season:string|number,week:number)=>{
    if(!schedule||String(schedule.season)!==String(season))return [];
    const games=schedule.weeks.find(w=>w.week===week)?.games ?? [];
    return events.filter(e=>games.some(g=>teamCode(g.home.abbreviation)===e.home&&teamCode(g.away.abbreviation)===e.away&&Math.abs(Date.parse(g.date)-Date.parse(e.startsAt))<12*3600000));
  };
  const player=<T extends Projectable>(input:T,context:EdgeContext|null,season:string|number,week:number):T=>{
    const p=platformPlayer(input);
    if(!enabled)return p;
    const relevant=forWeek(season,week);
    // Retain the last eligible pregame estimate after kickoff. Actual scores
    // and live progress are untouched by this projection-only overlay.
    const game=relevant.find(e=>[e.home,e.away].includes(teamCode(p.team)));
    const scheduleGame=schedule?.weeks.find(w=>w.week===week)?.games.find(g=>[teamCode(g.home.abbreviation),teamCode(g.away.abbreviation)].includes(teamCode(p.team)));
    const projectionLocked=Boolean(scheduleGame&&Date.parse(scheduleGame.date)<=now);
    const evaluationTime=game?Math.min(now,Date.parse(game.startsAt)-1):now;
    const result=context?edgeProjection(p,relevant,context,evaluationTime):null;
    if(result?.projection==null || !result.usable)return {...p,projectionOrigin:'Platform fallback',projectionLocked};
    const base=p.leagueProjection ?? p.projection;
    const ratio=base>0?result.projection/base:1;
    return {...p,platformSnapshot:{projection:p.projection,leagueProjection:p.leagueProjection,floor:p.floor,ceiling:p.ceiling},projection:result.projection,leagueProjection:result.projection,floor:p.floor===undefined?undefined:Math.round(p.floor*ratio*10)/10,ceiling:p.ceiling===undefined?undefined:Math.round(p.ceiling*ratio*10)/10,projectionOrigin:VEGAS_PROJECTION_LABEL,projectionLocked};
  };
  const contextFor=(scoring:Record<string,number>|undefined):EdgeContext|null=>scoring?{scoring:'League scoring',scoringRules:scoring,rosterSlots:[],tePremium:(scoring.bonus_rec_te??0)+(scoring.rec_te??0),passTouchdown:scoring.pass_td??0,interception:scoring.pass_int??0}:null;
  const scoreboard=<T>(input:T):T=>{
    const data=input as any;if(!enabled||!data?.matchups)return input;
    const context=contextFor(data.league.scoring);
    return {...data,league:{...data.league,projectionSource:VEGAS_PROJECTION_LABEL},matchups:data.matchups.map((m:any)=>({...m,teams:m.teams.map((t:any)=>({...t,topPlayers:t.topPlayers.map((p:any)=>{
      if(p.projection==null)return {...p,projectionOrigin:'Platform fallback'};
      const adjusted=player({...p,team:p.nflTeam,role:p.lineupSlot??p.position,status:p.status??'Healthy'},context,data.league.season,data.week);
      return {...p,projection:adjusted.projection,projectionOrigin:adjusted.projectionOrigin};
    })}))}))} as T;
  };
  const nflGames=<T>(input:T,fallbackContext:EdgeContext|null):T=>{
    const data=input as any;if(!enabled||!data?.games)return input;
    return {...data,league:{...data.league,projectionSource:VEGAS_PROJECTION_LABEL},games:data.games.map((g:any)=>({...g,impactPlayers:g.impactPlayers.map((p:any)=>{
      if(p.projection==null)return p;
      const adjusted=player({...p,team:p.nflTeam,role:p.position,status:'Healthy'},contextFor(data.league.scoring)??fallbackContext,data.league.season,data.week);
      const remaining=p.projection>0?p.remainingProjection/p.projection:0;
      return {...p,projection:adjusted.projection,remainingProjection:Math.max(0,remaining*adjusted.projection),projectionOrigin:adjusted.projectionOrigin};
    })}))} as T;
  };
  return {enabled,player,scoreboard,nflGames,contextFor};
}
