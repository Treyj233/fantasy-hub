'use client';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { edgeProjection, edgeRosterProjection, edgeSuggestions, marketExpectation, isReserve, teamCode, type EdgePlayer, type EdgeContext, type EdgeFeed } from './vegas-edge-model';
import { startVisiblePolling } from './live-polling.mjs';
import { myTeamScore } from './my-team-score.mjs';
import './vegas-edge.css';

export default function VegasEdge({leagueId,teamId,roster,waivers,context,season,week,onPlayer,onWaivers,enabled,onToggle,onFeed,renderRosterColumns}:{leagueId:string;teamId:string;renderRosterColumns:(p:EdgePlayer)=>ReactNode;roster:EdgePlayer[];waivers:EdgePlayer[];context:EdgeContext;season:string;week:number;onPlayer:(p:EdgePlayer)=>void;onWaivers:()=>void;enabled:boolean;onToggle:(on:boolean)=>void;onFeed:(feed:EdgeFeed)=>void}) {
  const [livePlayers,setLivePlayers]=useState<Map<string,{player:{id:string;points:number;gameProgress?:number};status:string}>>(new Map());
  useEffect(()=>{
    let active=true;setLivePlayers(new Map());
    const stop=startVisiblePolling(async(signal:AbortSignal)=>{
      if(!leagueId)return;
      try{
        const response=await fetch(`/api/scoreboard?leagueId=${encodeURIComponent(leagueId)}&week=${week}`,{signal});
        if(!response.ok)return;
        const data=await response.json() as {matchups:{status:string;teams:{rosterId:string;topPlayers:{id:string;points:number;gameProgress?:number}[]}[]}[]};
        const match=data.matchups.find(m=>m.teams.some(t=>String(t.rosterId)===String(teamId)));
        const team=match?.teams.find(t=>String(t.rosterId)===String(teamId));
        if(active&&!signal.aborted&&team&&match)setLivePlayers(new Map(team.topPlayers.map(player=>[player.id,{player,status:match.status}])));
      }catch{/* Keep roster visible if scores are temporarily unavailable. */}
    });
    return()=>{active=false;stop();};
  },[leagueId,teamId,week]);
  const marketDialog=useRef<HTMLDialogElement>(null);
  const [marketPlayer,setMarketPlayer]=useState<string|null>(null);
  useEffect(()=>{const dialog=marketDialog.current;if(!marketPlayer||!dialog)return;dialog.showModal();return()=>{if(dialog.open)dialog.close();};},[marketPlayer]);
  const [feed,setFeed]=useState<EdgeFeed|null>(null);
  const [games,setGames]=useState<{date:string;away:{abbreviation:string};home:{abbreviation:string}}[]>([]);
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [refresh,setRefresh]=useState(0);
  const [filter,setFilter]=useState('All');const [clock,setClock]=useState(Date.now);
  useEffect(()=>{if(feed)onFeed(feed);},[feed,onFeed]);
  useEffect(()=>{
    const controller=new AbortController(); let active=true;
    setBusy(true);setError('');
    const json=async(r:Response)=>{const data=await r.json();if(!r.ok)throw new Error(data.error ?? 'Markets unavailable');return data;};
    Promise.all([fetch('/api/vegas-edge',{method:'POST',signal:controller.signal}).then(json),fetch(`/api/nfl-schedule?season=${encodeURIComponent(season)}`,{signal:controller.signal}).then(json)]).then(([data,schedule])=>{if(active){setFeed(data);setGames(schedule.weeks?.find((w:{week:number})=>w.week===week)?.games ?? []);}}).catch(e=>{if(active&&e.name!=='AbortError')setError(e.message);}).finally(()=>{if(active)setBusy(false);});
    return()=>{active=false;controller.abort();};
  },[refresh,season,week]);
  useEffect(()=>{
    // Light visibility-aware clock invalidates stale/locked advice. No animation loop.
    const timer=window.setInterval(()=>{if(document.visibilityState==='visible')setClock(Date.now());},30000);
    const resume=()=>{if(document.visibilityState==='visible')setClock(Date.now());};
    document.addEventListener('visibilitychange',resume);
    return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',resume);};
  },[]);
  const events=useMemo(()=>(feed?.events ?? []).filter(e=>games.some(g=>teamCode(g.away.abbreviation)===e.away&&teamCode(g.home.abbreviation)===e.home&&Math.abs(Date.parse(g.date)-Date.parse(e.startsAt))<12*3600000)),[feed,games]);
  const rows=useMemo(()=>roster.map(p=>edgeRosterProjection(p,events,context,clock)),[roster,events,context,clock]);
  const waiverRows=useMemo(()=>waivers.filter(p=>!roster.some(r=>r.id===p.id)).map(p=>edgeProjection(p,events,context,clock)),[waivers,roster,events,context,clock]);
  const {swaps,targets}=useMemo(()=>edgeSuggestions(rows,waiverRows),[rows,waiverRows]);
  const covered=rows.filter(r=>r.usable).length;
  const starters=rows.filter(r=>!isReserve(r.player.role));
  const coveredStarters=starters.filter(r=>r.usable);
  const delta=coveredStarters.reduce((sum,r)=>sum+(r.delta ?? 0),0);
  const visible=rows.filter(r=>filter==='All'||filter==='Starters'&&!isReserve(r.player.role)||filter==='Bench'&&isReserve(r.player.role)||filter==='Covered'&&r.usable);
  const selectedMarket=rows.find(r=>r.player.id===marketPlayer);
  const signed=(n:number)=>`${n>0?'+':''}${n.toFixed(1)}`;
  const timestamp=(date:string)=>new Date(date).toLocaleString(undefined,{weekday:'short',hour:'numeric',minute:'2-digit'});
  return <div className="page-content vegas-edge-page">
    <section className="all-leagues-hero edge-intro"><div><h2 className="mission-hub-title">Vegas Edge</h2><p className="mission-hub-subtitle">Your market edge, revealed.</p><span className="edge-preview">ELITE · OWNER PREVIEW</span></div><button type="button" className="edge-refresh" disabled={busy} onClick={()=>setRefresh(n=>n+1)}>{busy?'Refreshing…':'Refresh markets'}</button></section>
    <section className="panel edge-source-toggle"><div><span className="edge-eyebrow">PROJECTION SOURCE</span><h3>{enabled?'Vegas Implied Projections':'Platform projections'}</h3><small>App-wide · This device</small></div><button type="button" role="switch" aria-checked={enabled} aria-label="Use Vegas Implied Projections across the app" onClick={()=>onToggle(!enabled)}><span aria-hidden="true"/>{enabled?'On':'Off'}</button></section>
    <div className="edge-source-note">Actual scores unchanged · Uncovered players use platform projections</div>
    {error && <p className="panel" role="alert">{error} <button onClick={()=>setRefresh(n=>n+1)}>Try again</button></p>}
    <div className="edge-connection" role="status"><span className={feed?.configured?'edge-live-dot is-ready':'edge-live-dot'}/><b>{!feed?'Connecting…':feed.configured?'Markets connected':'Connection needed'}</b>{feed?.checkedAt&&<small>Checked {timestamp(feed.checkedAt)}</small>}</div>
    <div className="edge-metrics"><section className="panel"><small>COVERED</small><strong>{covered}<em> / {rows.length}</em></strong><span>players with fresh lines</span></section><section className="panel"><small>STARTER EDGE</small><strong>{coveredStarters.length?signed(delta):'—'}</strong><span>{coveredStarters.length} of {starters.length} covered starters</span></section><section className="panel"><small>UPGRADES</small><strong>{swaps.length}</strong><span>lineup moves</span></section></div>
    <section className="panel edge-board"><header><div><h3>Roster outlook</h3><p>Week {week} · {context.scoring}</p></div><div className="edge-filters" aria-label="Roster filters">{['All','Starters','Bench','Covered'].map(f=><button key={f} aria-pressed={filter===f} onClick={()=>setFilter(f)}>{f}</button>)}</div></header>
      <div className="edge-table-wrap"><table><colgroup><col className="edge-name-col"/><col className="edge-slot-col"/><col className="edge-matchup-col"/><col/><col/><col className="edge-props-cell"/><col/></colgroup><thead><tr><th>Player</th><th>Slot</th><th>Matchup</th><th>Fantasy points</th><th>Vegas</th><th className="edge-props-cell">Props</th><th>Edge</th></tr></thead><tbody>{visible.map(r=>{const score=myTeamScore(r.baseline,livePlayers.get(r.player.id));return <tr key={r.player.id}>{renderRosterColumns(r.player)}<td data-score-label={score.label === "PROJ" ? "PLATFORM" : score.label} className={score.label === "PROJ" ? "edge-score" : "edge-score is-actual"}>{score.value?.toFixed(1) ?? "—"}<small className="edge-score-status">{score.label}</small></td><td className="edge-projection">{r.projection?.toFixed(1) ?? '—'}<small className="edge-coverage-label">{r.label}</small></td><td className="edge-props-cell">{r.props.length>0&&<button type="button" className="edge-market-trigger" aria-haspopup="dialog" aria-label={`View prop markets for ${r.player.name}`} onClick={()=>setMarketPlayer(r.player.id)}>{r.props.length} props ↗</button>}</td><td data-direction={(r.delta ?? 0)>0?'up':(r.delta ?? 0)<0?'down':'flat'}>{r.delta===null?'—':signed(r.delta)}</td></tr>})}</tbody></table></div>
      {!visible.length&&<p className="edge-empty">No players match this filter yet.</p>}
    </section>
    <div className="edge-actions-grid"><section className="panel"><div className="edge-section-heading"><span className="edge-section-icon" aria-hidden="true">↗</span><h3>Lineup moves</h3><span className="edge-count">{swaps.length}</span></div>{swaps.length?swaps.map(s=><article className="edge-opportunity" key={s.into.player.id}><span className="edge-gain">+{s.gain.toFixed(1)} pts</span><b>Start <button onClick={()=>onPlayer(s.into.player)}>{s.into.player.name}</button></b><span>Over {s.out.player.name} at {s.out.player.role}</span></article>):<p className="edge-empty">{covered?'No clear upgrades.':'Waiting for fresh player lines.'}</p>}</section><section className="panel"><div className="edge-section-heading"><span className="edge-section-icon" aria-hidden="true">+</span><h3>Waiver targets</h3><span className="edge-count">{targets.length}</span></div>{targets.length?targets.map(s=><article className="edge-opportunity" key={s.into.player.id}><span className="edge-gain">+{s.gain.toFixed(1)} pts</span><button className="edge-player" onClick={()=>onPlayer(s.into.player)}>{s.into.player.name}</button><span>{s.into.player.position} · Alternative to {s.out.player.name}</span></article>):<p className="edge-empty">No clear waiver upgrades.</p>}<button className="edge-link" onClick={onWaivers}>Open Waiver Wire →</button></section></div>
    <section className="panel"><h3>Game environment</h3><div className="edge-games">{events.map(e=><article key={e.id}><b>{e.away} at {e.home}</b><small>{timestamp(e.startsAt)} · {e.locked||Date.parse(e.startsAt)<=clock?'Locked':'Pregame'}</small><span>Total <strong>{e.total ?? '—'}</strong> · {e.home} spread <strong>{e.homeSpread===null?'—':e.homeSpread>0?`+${e.homeSpread}`:e.homeSpread}</strong></span></article>)}</div>{!events.length&&<p className="edge-empty">No game lines available yet.</p>}</section>

    <dialog ref={marketDialog} className="edge-market-dialog" aria-labelledby="edge-market-title" onCancel={()=>setMarketPlayer(null)} onClose={()=>setMarketPlayer(null)}>
      <header><div><span>PROP MARKETS</span><h3 id="edge-market-title">{selectedMarket?.player.name ?? 'Player markets'}</h3></div><button type="button" aria-label="Close prop markets" onClick={()=>setMarketPlayer(null)}>×</button></header>
      <div className="edge-market-body">{selectedMarket&&<><p className="edge-market-meta">{selectedMarket.player.position} · {selectedMarket.player.team} · {selectedMarket.label}</p><div className="edge-market-list">{selectedMarket.props.map(p=><article key={p.stat}><div><b>{p.stat.replaceAll('_',' ')}</b><small>{p.source==='provider-fair'?'Fair consensus':`${p.books} books`} · Over {p.line}: {(p.overProbability*100).toFixed(1)}%</small><small>Modeled estimate: {marketExpectation(p)?.toFixed(2) ?? '—'} · Odds-adjusted approximation</small></div><strong>{p.line}</strong></article>)}</div>{selectedMarket.event&&<footer><span>Snapshot <b>{timestamp(selectedMarket.event.updatedAt)}</b></span><span>Kickoff <b>{timestamp(selectedMarket.event.startsAt)}</b></span></footer>}</>}</div>
    </dialog>
  </div>;
}
