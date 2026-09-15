"use client";
import { useState } from 'react';
import type { LeagueStoryData } from './FantasyHub';
import { recapAwardCards } from './league-recap-design.mjs';

type Performer={id:string;position:string;name:string;points:number;teamName:string;rosterId:number;nflTeam:string;image:string|null;shared:boolean};
export type WeeklyVisualReport={starters:Performer[];bench:Performer[];efficiency:{rosterId:number;teamName:string;avatar:string|null;actual:number|null;maximum:number|null;percent:number|null}[];standings:{rosterId:number;teamName:string;managerName:string;avatar:string|null;rank:number;wins:number;losses:number;ties:number;pf:number;pa:number;movement:number|null;complete:boolean;isMine:boolean}[]};

function Identity({src,name}:{src?:string|null;name:string}){
  const [failed,setFailed]=useState<string|null>(null);
  return <span className="lw-identity" aria-hidden="true">{src&&failed!==src?<img src={src} alt="" loading="lazy" onError={()=>setFailed(src)}/>:<b>{name.trim().slice(0,2).toUpperCase()}</b>}</span>;
}
function Performers({title,players}:{title:string;players:Performer[]}){
  return <section className="lw-section"><header><span>POSITION SPOTLIGHTS</span><h3>{title}</h3></header>{players.length?<div className="lw-performers">{players.map(p=><article key={`${p.rosterId}:${p.id}`}><div className="lw-player-top"><span className="lw-position">{p.position}</span><Identity src={p.image} name={p.name}/></div><h4>{p.name}</h4><span className="lw-nfl">{p.nflTeam}{p.shared?' · Shared honors':''}</span><strong className="lw-player-score">{p.points.toFixed(2)}<small>PTS</small></strong><footer>{p.teamName}</footer></article>)}</div>:<p className="lw-empty">No confirmed player scoring available for this group.</p>}</section>;
}
export default function LeagueWeeklyReport({story,onShare,shared}:{story:LeagueStoryData;onShare:()=>void;shared:boolean}){
  const {recap}=story,visual=recap.visual;
  const awards=recapAwardCards(recap);
  const champion=visual?.standings.find(t=>t.teamName===recap.highScore?.teamName);
  const mvp=visual?.starters.slice().sort((a,b)=>b.points-a.points)[0];
  return <section className="lw-report" aria-label={`Week ${recap.week} league report`}>
    <header className="lw-heading"><div><span>WEEK {recap.week} / THE LEAGUE EDITION</span><h2>Your week. In focus.</h2></div><button onClick={onShare} disabled={!recap.available}>{shared?'Report ready':'Share weekly report'} <span aria-hidden="true">↗</span></button></header>
    {!recap.available?<p className="lw-empty">Your weekly report will appear once completed matchup scores are available.</p>:<>
      <nav className="lw-nav" aria-label="Weekly report sections"><a href="#lw-spotlight">Spotlight</a><a href="#lw-honors">Honors</a><a href="#lw-efficiency">Efficiency</a><a href="#lw-ladder">Standings</a></nav>
      <section className="lw-spotlight" id="lw-spotlight"><article className="lw-champion"><span>HIGH-SCORE HONORS</span><div><Identity src={champion?.avatar} name={recap.highScore?.teamName??'FH'}/><h3>{recap.highScore?.teamName}</h3></div><strong>{recap.highScore?.points.toFixed(2)}<small>POINTS</small></strong></article><article className="lw-feature"><span>PHOTO FINISH</span><strong>{recap.closestGame?Math.abs(recap.closestGame.teams[0].points-recap.closestGame.teams[1].points).toFixed(2):'—'}<small>POINT MARGIN</small></strong><p>{recap.closestGame?.teams.map(t=>t.teamName).join(' vs ')}</p></article>{mvp&&<article className="lw-feature"><span>WEEKLY MVP</span><div className="lw-mvp"><Identity src={mvp.image} name={mvp.name}/><h3>{mvp.name}</h3></div><strong>{mvp.points.toFixed(2)}<small>POINTS</small></strong><p>{mvp.teamName}</p></article>}</section>
      {visual&&<><Performers title="Impact starters" players={visual.starters}/><Performers title="Bench firepower" players={visual.bench}/></>}
      <section className="lw-section" id="lw-honors"><header><span>THE BRAGGING RIGHTS</span><h3>Fantasy Hub honors</h3></header><div className="lw-honors">{awards.map((award,index)=>{const metric=award.detail.match(/^([+\-]?\d+(?:\.\d+)?%?)/)?.[1];return <article key={award.id}><header><b>{String(index+1).padStart(2,'0')}</b><span>{award.label}</span></header><h4>{award.recipient}</h4>{metric&&<strong className="lw-award-value">{metric}</strong>}<p>{award.detail}</p></article>;})}</div></section>
      {visual&&<div className="lw-analysis"><section className="lw-section" id="lw-efficiency"><header><span>POINTS CAPTURED</span><h3>Lineup efficiency</h3><p>Actual starter points against your best legal lineup. A look back, not a judgment of the original decision.</p></header><div className="lw-efficiencies">{visual.efficiency.map(t=><article key={t.rosterId}><div><Identity src={t.avatar} name={t.teamName}/><h4>{t.teamName}</h4><strong>{t.percent===null?'—':`${t.percent.toFixed(1)}%`}</strong></div>{t.percent!==null?<><meter min={0} max={100} value={t.percent} aria-label={`${t.teamName}: ${t.percent.toFixed(1)} percent of optimal points`}/><p><b>{t.actual?.toFixed(2)}</b> of {t.maximum?.toFixed(2)} available points</p></>:<p>Complete lineup scoring unavailable</p>}</article>)}</div></section>
      <section className="lw-section" id="lw-ladder"><header><span>THROUGH WEEK {recap.week}</span><h3>The league ladder</h3><p>Head-to-head record, then points scored.</p></header><div className="lw-standings">{visual.standings.map(t=><article key={t.rosterId} className={t.isMine?'is-mine':''}><span className="lw-rank">{t.rank}</span><Identity src={t.avatar} name={t.teamName}/><div className="lw-standing-team"><h4>{t.teamName}</h4><small>{t.wins}-{t.losses}{t.ties?`-${t.ties}`:''} · {t.managerName}{!t.complete?' · Partial data':''}</small></div><span className="lw-standing-points"><b>{t.pf.toFixed(2)}</b><small>PF</small></span><span className="lw-standing-points"><b>{t.pa.toFixed(2)}</b><small>PA</small></span><span className="lw-movement" aria-label={t.movement?`${Math.abs(t.movement)} places ${t.movement>0?'up':'down'}`:'No rank movement'}>{t.movement?`${t.movement>0?'↑':'↓'}${Math.abs(t.movement)}`:'—'}</span></article>)}</div></section></div>}
    </>}
  </section>;
}
