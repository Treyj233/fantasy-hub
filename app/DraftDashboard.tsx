"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";

type DraftPlayer = { id: string; name: string; position: string; team: string; overallRank?: number; rankingValue?: number; age?: number | null; adpBySite?: Record<string, number | null>; fantasyPpg2025?: number | null; gamesPlayed2025?: number | null; snapAverage?: number | null; teamOffenseRank2025?: number | null; teamPointsPerGame2025?: number | null };
type RosterConfig = { QB: number; RB: number; WR: number; TE: number; FLEX: number; BENCH: number };
type DraftSettings = { teams: number; slot: number; format: "Redraft" | "Keeper" | "Dynasty"; lineup: "1QB" | "Superflex"; scoring: "Standard" | "Half PPR" | "Full PPR" | "TE Premium"; cpu: "Balanced" | "Competitive" | "Chaotic"; timer: number; roster: RosterConfig };
type Pick = DraftPlayer & { overall: number; round: number; draftTeam: number; user: boolean };
type RosterSlot = { id: string; label: "QB" | "RB" | "WR" | "TE" | "FLEX" | "SUPERFLEX" | "BENCH"; player?: Pick };
type AdpWeights = { underdog: number; sleeper: number; espn: number };
type CpuProfile = { name: string; summary: string; position: "RB" | "WR" | "QB" | "TE" | "BALANCED"; strategy: "volume" | "elite" | "zero-rb" | "hero-rb" | "balanced"; weights: AdpWeights; risk: number };

const cpuArchetypes: Omit<CpuProfile, "weights" | "risk">[] = [
  { name: "RB Collector", summary: "Builds through running-back volume", position: "RB", strategy: "volume" },
  { name: "WR Avalanche", summary: "Attacks receiver value and weekly ceiling", position: "WR", strategy: "volume" },
  { name: "Elite QB", summary: "Pays for a difference-maker, then waits", position: "QB", strategy: "elite" },
  { name: "Elite TE", summary: "Targets the scarce top tight-end tier", position: "TE", strategy: "elite" },
  { name: "Zero RB", summary: "Loads up elsewhere before chasing RB value", position: "WR", strategy: "zero-rb" },
  { name: "Hero RB", summary: "Anchors one early RB, then builds receivers", position: "RB", strategy: "hero-rb" },
  { name: "Market Reader", summary: "Lets blended market value lead the room", position: "BALANCED", strategy: "balanced" },
];
const adpBlends: { label: string; weights: AdpWeights }[] = [
  { label: "Underdog-led", weights: { underdog: .8, sleeper: .1, espn: .1 } },
  { label: "ESPN-led", weights: { underdog: .1, sleeper: .2, espn: .7 } },
  { label: "Sleeper-led", weights: { underdog: .15, sleeper: .7, espn: .15 } },
  { label: "Sharp blend", weights: { underdog: .55, sleeper: .3, espn: .15 } },
  { label: "Consensus", weights: { underdog: .34, sleeper: .33, espn: .33 } },
];

const demoPlayers: DraftPlayer[] = [
  ["Ja'Marr Chase","WR","CIN"],["Bijan Robinson","RB","ATL"],["Justin Jefferson","WR","MIN"],["Jahmyr Gibbs","RB","DET"],["CeeDee Lamb","WR","DAL"],["Puka Nacua","WR","LAR"],["Amon-Ra St. Brown","WR","DET"],["Saquon Barkley","RB","PHI"],["Malik Nabers","WR","NYG"],["Brian Thomas Jr.","WR","JAX"],["Josh Allen","QB","BUF"],["Lamar Jackson","QB","BAL"],["Brock Bowers","TE","LV"],["De'Von Achane","RB","MIA"],["Nico Collins","WR","HOU"],["Drake London","WR","ATL"],["Jonathan Taylor","RB","IND"],["Ashton Jeanty","RB","LV"],["Trey McBride","TE","ARI"],["A.J. Brown","WR","PHI"],["Kyren Williams","RB","LAR"],["Breece Hall","RB","NYJ"],["Jayden Daniels","QB","WAS"],["Jaxon Smith-Njigba","WR","SEA"],["Josh Jacobs","RB","GB"],["Tee Higgins","WR","CIN"],["Garrett Wilson","WR","NYJ"],["Ladd McConkey","WR","LAC"],["Chase Brown","RB","CIN"],["George Kittle","TE","SF"],["Joe Burrow","QB","CIN"],["James Cook","RB","BUF"],["Davante Adams","WR","LAR"],["Marvin Harrison Jr.","WR","ARI"],["Derrick Henry","RB","BAL"],["DK Metcalf","WR","PIT"],["Sam LaPorta","TE","DET"],["Rome Odunze","WR","CHI"],["TreVeyon Henderson","RB","NE"],["Bucky Irving","RB","TB"],["Terry McLaurin","WR","WAS"],["Patrick Mahomes","QB","KC"],["Xavier Worthy","WR","KC"],["DJ Moore","WR","CHI"],["Kenneth Walker III","RB","SEA"],["DeVonta Smith","WR","PHI"],["Zay Flowers","WR","BAL"],["Jameson Williams","WR","DET"],["David Montgomery","RB","DET"],["Calvin Ridley","WR","TEN"],["Isiah Pacheco","RB","KC"],["Jordan Addison","WR","MIN"],["Mark Andrews","TE","BAL"],["Kyler Murray","QB","ARI"],["Tony Pollard","RB","TEN"],["Chris Olave","WR","NO"],["Courtland Sutton","WR","DEN"],["George Pickens","WR","DAL"],["D'Andre Swift","RB","CHI"],["Jaylen Waddle","WR","MIA"],["Rashee Rice","WR","KC"],["Travis Kelce","TE","KC"],["Tetairoa McMillan","WR","CAR"],["RJ Harvey","RB","DEN"],["Stefon Diggs","WR","NE"],["T.J. Hockenson","TE","MIN"],["Dak Prescott","QB","DAL"],["Caleb Williams","QB","CHI"],["Baker Mayfield","QB","TB"],["Bo Nix","QB","DEN"],["Jordan Love","QB","GB"],["Justin Herbert","QB","LAC"],["Khalil Shakir","WR","BUF"],["DeMario Douglas","WR","NE"],["Dallas Goedert","TE","PHI"],["Jake Ferguson","TE","DAL"],["Tyjae Spears","RB","TEN"],["Rhamondre Stevenson","RB","NE"],["Jaylen Warren","RB","PIT"],["Rachaad White","RB","WAS"]
].map(([name, position, team], index) => ({ id: `demo-${index + 1}`, name, position, team, overallRank: index + 1, rankingValue: 100 - index * .7 }));

const defaultSettings: DraftSettings = { teams: 10, slot: 5, format: "Redraft", lineup: "1QB", scoring: "Half PPR", cpu: "Balanced", timer: 60, roster: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, BENCH: 1 } };
const rosterRounds = (settings: DraftSettings) => Object.values(settings.roster).reduce((sum, count) => sum + count, 0) + (settings.lineup === "Superflex" ? 1 : 0);
const rosterSlots = (settings: DraftSettings, picks: Pick[]) => {
  const slots: RosterSlot[] = [];
  for (const label of ["QB", "RB", "WR", "TE", "FLEX", "BENCH"] as const) {
    for (let index = 0; index < settings.roster[label]; index += 1) slots.push({ id: `${label}-${index}`, label });
    if (label === "FLEX" && settings.lineup === "Superflex") slots.push({ id: "SUPERFLEX-0", label: "SUPERFLEX" });
  }
  for (const player of picks) {
    const exact = slots.find((slot) => !slot.player && slot.label === player.position);
    const flex = slots.find((slot) => !slot.player && slot.label === "FLEX" && ["RB", "WR", "TE"].includes(player.position));
    const superflex = slots.find((slot) => !slot.player && slot.label === "SUPERFLEX" && ["QB", "RB", "WR", "TE"].includes(player.position));
    const bench = slots.find((slot) => !slot.player && slot.label === "BENCH");
    const destination = exact ?? flex ?? superflex ?? bench;
    if (destination) destination.player = player;
  }
  return slots;
};
const canRosterPlayer = (settings: DraftSettings, picks: Pick[], position: string) => rosterSlots(settings, picks).some((slot) =>
  !slot.player && (slot.label === position || slot.label === "BENCH" || (slot.label === "FLEX" && ["RB", "WR", "TE"].includes(position)) || (slot.label === "SUPERFLEX" && ["QB", "RB", "WR", "TE"].includes(position))),
);
const teamForPick = (overall: number, teams: number) => { const round = Math.ceil(overall / teams); const within = (overall - 1) % teams; return round % 2 ? within + 1 : teams - within; };
const positionNeed = (picks: Pick[]) => { const counts: Record<string, number> = {}; for (const pick of picks) counts[pick.position] = (counts[pick.position] || 0) + 1; return ["RB","WR","QB","TE"].sort((a,b) => (counts[a] || 0) - (counts[b] || 0))[0]; };
const shuffled = <T,>(items: T[]) => [...items].sort(() => Math.random() - .5);
const createCpuProfiles = (teams: number, userSlot: number) => {
  const archetypes = shuffled(Array.from({ length: teams }, (_, index) => cpuArchetypes[index % cpuArchetypes.length]));
  const blends = shuffled(Array.from({ length: teams }, (_, index) => adpBlends[index % adpBlends.length]));
  return Object.fromEntries(Array.from({ length: teams }, (_, index) => {
    const team = index + 1;
    const archetype = archetypes[index];
    const blend = blends[index];
    return [team, { ...archetype, name: `${archetype.name} · ${blend.label}`, weights: blend.weights, risk: .7 + Math.random() * .7 } satisfies CpuProfile];
  }).filter(([team]) => team !== userSlot)) as Record<number, CpuProfile>;
};
const siteAdp = (player: DraftPlayer, source: keyof AdpWeights, settings: DraftSettings) => {
  const sites = player.adpBySite ?? {};
  if (source === "espn") return sites.ESPN;
  if (source === "sleeper") return sites[settings.lineup === "Superflex" ? "Sleeper Superflex" : "Sleeper Single-QB"] ?? sites.Sleeper;
  const scoring = settings.scoring === "Full PPR" || settings.scoring === "TE Premium" ? "Full PPR" : "Half PPR";
  return sites[`Underdog ${settings.lineup === "Superflex" ? "Superflex Half PPR" : `Single-QB ${scoring}`}`];
};
const blendedAdp = (player: DraftPlayer, profile: CpuProfile, settings: DraftSettings) => {
  const fallback = player.overallRank ?? 220;
  let total = 0;
  let weight = 0;
  for (const source of ["underdog", "sleeper", "espn"] as const) {
    const value = siteAdp(player, source, settings);
    if (typeof value === "number" && value > 0) { total += value * profile.weights[source]; weight += profile.weights[source]; }
  }
  return weight ? total / weight : fallback;
};
const displayAdp = (player: DraftPlayer, settings: DraftSettings) => {
  const values = (["underdog", "sleeper", "espn"] as const)
    .map((source) => siteAdp(player, source, settings))
    .filter((value): value is number => typeof value === "number" && value > 0);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : player.overallRank ?? null;
};
const historicalContext = (player: DraftPlayer) => {
  if (player.position === "QB") {
    return [
      { label: "2025 FPPG", value: player.fantasyPpg2025 == null ? "—" : player.fantasyPpg2025.toFixed(1) },
      { label: "GAMES", value: player.gamesPlayed2025 == null ? "—" : String(player.gamesPlayed2025) },
      { label: "OFFENSE", value: player.teamOffenseRank2025 == null ? "—" : `#${player.teamOffenseRank2025}` },
      { label: "TEAM PPG", value: player.teamPointsPerGame2025 == null ? "—" : player.teamPointsPerGame2025.toFixed(1) },
    ];
  }
  return [
    { label: "2025 FPPG", value: player.fantasyPpg2025 == null ? "—" : player.fantasyPpg2025.toFixed(1) },
    { label: "GAMES", value: player.gamesPlayed2025 == null ? "—" : String(player.gamesPlayed2025) },
    { label: "SNAP SHARE", value: player.snapAverage == null ? "—" : `${Math.round(player.snapAverage)}%` },
    { label: "AGE", value: player.age == null ? "—" : String(player.age) },
  ];
};
const cpuScore = (player: DraftPlayer, profile: CpuProfile, teamPicks: Pick[], overall: number, settings: DraftSettings) => {
  if (!canRosterPlayer(settings, teamPicks, player.position)) return -1_000;
  const round = Math.ceil(overall / settings.teams);
  const counts = teamPicks.reduce<Record<string, number>>((map, pick) => { map[pick.position] = (map[pick.position] || 0) + 1; return map; }, {});
  const market = blendedAdp(player, profile, settings);
  let score = 260 - market;
  const elite = market <= (player.position === "QB" ? (settings.lineup === "Superflex" ? 34 : 45) : player.position === "TE" ? 38 : 28);
  if (profile.strategy === "volume" && player.position === profile.position) score += round <= 6 ? 20 : 10;
  if (profile.strategy === "elite" && player.position === profile.position && elite && !counts[player.position]) score += 38;
  if (profile.strategy === "zero-rb" && player.position === "RB") score += round <= 5 ? -42 : 20;
  if (profile.strategy === "hero-rb") {
    if (player.position === "RB" && !counts.RB && round <= 3) score += 34;
    if (player.position === "RB" && counts.RB) score += round <= 7 ? -28 : 4;
    if (player.position === "WR" && counts.RB) score += 15;
  }
  if (settings.lineup === "Superflex" && player.position === "QB") score += counts.QB < 2 ? 34 : round <= 5 ? -24 : 0;
  if (settings.lineup === "1QB" && player.position === "QB") {
    if (counts.QB >= 1 && round <= 9) score -= 90;
    else if (!elite && round <= 4) score -= 26;
  }
  if (player.position === "TE") {
    if (settings.scoring === "TE Premium") score += counts.TE < 2 ? 20 : -6;
    else if (counts.TE >= 1 && round <= 10) score -= 82;
    else if (!elite && round <= 5) score -= 30;
  }
  if ((player.position === "RB" || player.position === "WR") && counts[player.position] < 3) score += 5;
  if (settings.format === "Dynasty" && typeof player.age === "number") score += Math.max(-12, 28 - player.age) * 1.4;
  if (settings.cpu === "Competitive") {
    const marketScore = 260 - market;
    score = marketScore + (score - marketScore) * .3;
    if (round === 1 && player.position === "QB") return -1_000;
    if (settings.lineup === "1QB" && counts.QB >= 1 && round <= 10 && player.position === "QB") return -1_000;
    if (settings.scoring !== "TE Premium" && counts.TE >= 1 && round <= 10 && player.position === "TE") return -1_000;
    const reach = market - overall;
    if (reach > 10) score -= (reach - 10) * 2.4;
    if (round >= 6 && (player.position === "RB" || player.position === "WR") && (counts[player.position] || 0) < 2) score += 14;
    if (settings.lineup === "Superflex" && round >= 5 && player.position === "QB" && (counts.QB || 0) < 2) score += 18;
  }
  const volatility = settings.cpu === "Competitive" ? 2 : settings.cpu === "Chaotic" ? 22 : 6;
  return score + (Math.random() - .5) * volatility * profile.risk;
};

export default function DraftDashboard({ players, isPro, isElite, onUpgrade }: { players: DraftPlayer[]; isPro: boolean; isElite: boolean; onUpgrade: () => void }) {
  const [settings, setSettings] = useState(defaultSettings);
  const [started, setStarted] = useState(false);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState("ALL");
  const [showSetup, setShowSetup] = useState(true);
  const [cpuProfiles, setCpuProfiles] = useState<Record<number, CpuProfile>>({});
  const pool = useMemo(() => (players.length >= 40 ? players : demoPlayers).map((player, index) => ({ ...player, overallRank: player.overallRank ?? index + 1 })).sort((a,b) => (a.overallRank ?? 999) - (b.overallRank ?? 999)), [players]);
  const drafted = useMemo(() => new Set(picks.map((pick) => pick.id)), [picks]);
  const available = useMemo(() => pool.filter((player) => !drafted.has(player.id)), [pool, drafted]);
  const overall = picks.length + 1;
  const currentTeam = teamForPick(overall, settings.teams);
  const userTurn = started && currentTeam === settings.slot;
  const rounds = rosterRounds(settings);
  const complete = started && (picks.length >= settings.teams * rounds || !available.length);
  const userPicks = picks.filter((pick) => pick.user);
  const userRosterSlots = rosterSlots(settings, userPicks);
  const recommendation = available.map((player) => ({ player, score: 100 - (player.overallRank ?? 200) + (player.position === positionNeed(userPicks) ? 9 : 0) })).sort((a,b) => b.score - a.score).slice(0,3);

  const draft = (player: DraftPlayer) => {
    if (complete || drafted.has(player.id)) return;
    const nextOverall = picks.length + 1;
    const team = teamForPick(nextOverall, settings.teams);
    const teamPicks = picks.filter((pick) => pick.draftTeam === team);
    if (!canRosterPlayer(settings, teamPicks, player.position)) return;
    setPicks((current) => [...current, { ...player, overall: nextOverall, round: Math.ceil(nextOverall / settings.teams), draftTeam: team, user: team === settings.slot }]);
  };

  useEffect(() => {
    if (!started || complete || userTurn || !available.length) return;
    const delay = settings.cpu === "Chaotic" ? 420 : settings.cpu === "Competitive" ? 220 : 280;
    const timer = window.setTimeout(() => {
      const profile = cpuProfiles[currentTeam];
      const teamPicks = picks.filter((pick) => pick.draftTeam === currentTeam);
      const choice = profile
        ? available.map((player) => ({ player, score: cpuScore(player, profile, teamPicks, overall, settings) })).sort((a, b) => b.score - a.score)[0]?.player
        : available[0];
      if (choice) setPicks((current) => {
        const nextOverall = current.length + 1;
        const team = teamForPick(nextOverall, settings.teams);
        return [...current, { ...choice, overall: nextOverall, round: Math.ceil(nextOverall / settings.teams), draftTeam: team, user: team === settings.slot }];
      });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [available, complete, cpuProfiles, currentTeam, overall, picks, settings, started, userTurn]);

  const start = () => { setPicks([]); setCpuProfiles(createCpuProfiles(settings.teams, settings.slot)); setStarted(true); setShowSetup(false); };
  const setRosterCount = (position: keyof RosterConfig, count: number) => setSettings((current) => ({ ...current, roster: { ...current.roster, [position]: count } }));
  const filtered = available.filter((player) => (position === "ALL" || player.position === position) && player.name.toLowerCase().includes(query.toLowerCase())).slice(0, 60);
  const grade = Math.max(60, Math.min(98, Math.round(92 - userPicks.reduce((sum, pick) => sum + Math.max(0, pick.overall - (pick.overallRank ?? pick.overall)), 0) / Math.max(1, userPicks.length))));

  return <div className="page-content draft-hq-page">
    <section className="draft-hq-hero"><div><span>FANTASY HUB DRAFT HQ</span><h2>Build the roster<br/><em>before Sunday.</em></h2><p>Configure the room, run a complete snake mock, and practice every turn against CPU managers with distinct draft identities.</p><nav><b>{settings.teams} TEAMS</b><b>{settings.lineup.toUpperCase()}</b><b>{settings.scoring.toUpperCase()}</b><b>{settings.format.toUpperCase()}</b></nav></div><div className="draft-clock"><small>{complete ? "DRAFT COMPLETE" : userTurn ? "YOU'RE ON THE CLOCK" : started ? `TEAM ${currentTeam} PICKING` : "ROOM READY"}</small><strong>{started ? `${Math.ceil(overall / settings.teams)}.${String(((overall - 1) % settings.teams) + 1).padStart(2,"0")}` : "--"}</strong><span>{settings.timer}s pick clock</span></div></section>

    <section className="draft-hq-stats"><article><span>YOUR SLOT</span><strong>{settings.slot}</strong><small>Snake position</small></article><article><span>ROSTER</span><strong>{userPicks.length}</strong><small>of {rounds} picks</small></article><article><span>BEST NEED</span><strong>{positionNeed(userPicks)}</strong><small>Current build</small></article><article className={!isElite ? "locked" : ""}><span>DRAFT GRADE</span><strong>{isElite ? `${grade}` : "ELITE"}</strong><small>{isElite ? "Live team score" : "Unlock analysis"}</small></article></section>

    {showSetup && <section className="draft-setup panel"><header><div><span>ROOM SETTINGS</span><h3>Make this mock yours.</h3></div><div className="draft-setup-actions"><button type="button" onClick={() => setShowSetup(false)}>Collapse</button><button className="draft-primary" onClick={start}>{started ? "Restart Mock Draft" : "Start Mock Draft"} <b>→</b></button></div></header><div className={!isPro ? "draft-settings-grid gated" : "draft-settings-grid"}>
      <label>Teams<select disabled={!isPro} value={settings.teams} onChange={(event) => setSettings({...settings, teams:Number(event.target.value), slot:Math.min(settings.slot,Number(event.target.value))})}>{[8,10,12,14].map((value)=><option key={value}>{value}</option>)}</select></label>
      <label>Draft slot<select disabled={!isPro} value={settings.slot} onChange={(event) => setSettings({...settings, slot:Number(event.target.value)})}>{Array.from({length:settings.teams},(_,i)=><option key={i+1}>{i+1}</option>)}</select></label>
      <label>Format<select disabled={!isPro} value={settings.format} onChange={(event) => setSettings({...settings, format:event.target.value as DraftSettings["format"]})}>{["Redraft","Keeper","Dynasty"].map((value)=><option key={value}>{value}</option>)}</select></label>
      <label>QB format<select disabled={!isPro} value={settings.lineup} onChange={(event) => setSettings({...settings, lineup:event.target.value as DraftSettings["lineup"]})}>{["1QB","Superflex"].map((value)=><option key={value}>{value}</option>)}</select></label>
      <label>Scoring<select disabled={!isPro} value={settings.scoring} onChange={(event) => setSettings({...settings, scoring:event.target.value as DraftSettings["scoring"]})}>{["Standard","Half PPR","Full PPR","TE Premium"].map((value)=><option key={value}>{value}</option>)}</select></label>
      <label>CPU behavior<select disabled={!isElite} value={settings.cpu} onChange={(event) => setSettings({...settings, cpu:event.target.value as DraftSettings["cpu"]})}>{["Balanced","Competitive","Chaotic"].map((value)=><option key={value}>{value}</option>)}</select><small>{!isElite ? "Elite control" : settings.cpu === "Competitive" ? "Tight ADP discipline · no Round 1 QBs" : "Randomized room personalities"}</small></label>
    </div><section className={`draft-roster-builder ${!isPro ? "gated" : ""}`}><header><div><span>ROSTER SIZE</span><h4>Build your lineup.</h4></div><div><b>{rounds} ROUNDS</b><small>{settings.lineup === "Superflex" ? "Includes 1 Superflex spot" : "Single-QB roster"}</small></div></header><div>{(["QB","RB","WR","TE","FLEX","BENCH"] as const).map((rosterPosition)=><label key={rosterPosition}><span><b>{rosterPosition === "BENCH" ? "Bench" : rosterPosition}</b><small>{rosterPosition === "QB" && settings.lineup === "Superflex" ? "+ 1 Superflex starter" : rosterPosition === "FLEX" ? "RB / WR / TE" : rosterPosition === "BENCH" ? "Any position" : `${rosterPosition} starters`}</small></span><select disabled={!isPro} value={settings.roster[rosterPosition]} onChange={(event)=>setRosterCount(rosterPosition,Number(event.target.value))}>{Array.from({length:rosterPosition==="QB"?2:rosterPosition==="BENCH"?13:5},(_,index)=>rosterPosition==="QB"?index+1:index).map((value)=><option key={value}>{value}</option>)}</select></label>)}</div></section>{!isPro && <div className="draft-inline-gate"><b>PRO</b><span>Unlock custom teams, roster size, formats, scoring, and draft position.</span><button onClick={onUpgrade}>View plans</button></div>}<footer><small>{players.length >= 40 ? "Using your league-adjusted rankings" : "Previewing with the Fantasy Hub demo player pool"}</small></footer></section>}
    {!showSetup && <button className="draft-settings-toggle" onClick={() => setShowSetup(true)}>⚙ Draft settings</button>}

    {started && <div className="draft-room-layout">
      <section className="draft-board panel"><header><div><span>LIVE DRAFT BOARD</span><h3>{complete ? "Mock complete" : userTurn ? "Make your pick" : `Round ${Math.ceil(overall/settings.teams)} in progress`}</h3></div><button onClick={() => { setStarted(false); setShowSetup(true); }}>Exit room</button></header><div className="draft-board-scroll"><div className="draft-board-grid" style={{"--draft-teams":settings.teams} as CSSProperties}>{Array.from({length:settings.teams * rounds},(_,index)=>{const pick=picks[index];const round=Math.ceil((index+1)/settings.teams);const team=teamForPick(index+1,settings.teams);return <article key={index} style={{gridColumn:team,gridRow:round}} className={`${team===settings.slot?"user-team":""} ${pick?`pos-${pick.position.toLowerCase()}`:""}`}><small>{round}.{String(((index)%settings.teams)+1).padStart(2,"0")}</small>{pick?<><b>{pick.name}</b><span>{pick.position} · {pick.team}</span></>:<em>Team {team}</em>}</article>})}</div></div></section>
      <aside className="draft-roster panel"><header><span>YOUR ROSTER</span><b>TEAM {settings.slot}</b></header><div>{userRosterSlots.map((slot)=><article key={slot.id} className={slot.player?"filled":"empty"}><i>{slot.label === "SUPERFLEX" ? "SF" : slot.label === "BENCH" ? "BN" : slot.label}</i><span>{slot.player?<><b>{slot.player.name}</b><small>{slot.player.team} · Pick {slot.player.overall}</small></>:<><b>{slot.label}</b><small>Open roster spot</small></>}</span></article>)}</div></aside>
    </div>}

    {started && !complete && <section className="draft-player-pool panel"><header><div><span>AVAILABLE PLAYERS</span><h3>{userTurn ? "Your board is live." : "Scouting the next turn."}</h3></div><div><input aria-label="Search available players" value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search players"/><select aria-label="Filter players by position" value={position} onChange={(event)=>setPosition(event.target.value)}>{["ALL","QB","RB","WR","TE"].map((value)=><option key={value}>{value}</option>)}</select></div></header>{isElite?<div className="draft-recommendations"><span>ELITE PICK INTELLIGENCE</span>{recommendation.map(({player},index)=>{const eligible=canRosterPlayer(settings,userPicks,player.position);return <button key={player.id} disabled={!userTurn||!eligible} onClick={()=>draft(player)}><i>{index+1}</i><b>{player.name}</b><small>{eligible?`${player.position} · ${index===0?"Best roster fit":"Strong value"}`:"Roster position full"}</small></button>})}</div>:<div className="draft-elite-gate"><b>ELITE</b><span>Unlock live pick recommendations, roster construction scores, adaptive CPU rooms, and post-draft grades.</span><button onClick={onUpgrade}>Explore Elite</button></div>}<div className="draft-player-list">{filtered.map((player)=>{const stats=historicalContext(player);const adp=displayAdp(player,settings);const eligible=canRosterPlayer(settings,userPicks,player.position);return <button key={player.id} disabled={!userTurn||!eligible} onClick={()=>draft(player)}><i>#{player.overallRank}</i><span className="draft-player-identity"><b>{player.name}</b><small>{player.team} · {player.position}</small></span><span className="draft-player-history">{stats.map((stat)=><span key={stat.label}><small>{stat.label}</small><b>{stat.value}</b></span>)}</span><span className="draft-player-market"><small>CONSENSUS ADP</small><b>{adp == null ? "—" : adp.toFixed(1)}</b></span><strong>{!eligible?"FULL":userTurn?"DRAFT":"WATCH"}</strong></button>})}</div></section>}
    {complete && <section className="draft-results panel"><span>MOCK COMPLETE</span><h3>Your draft room has a final grade.</h3><strong>{isElite ? grade : "—"}</strong><p>{isElite ? `You built around ${userPicks[0]?.name ?? "your first-round anchor"} with ${positionNeed(userPicks)} as the clearest post-draft need.` : "Elite turns the completed board into a roster grade, positional build review, value report, and next-mock plan."}</p><div><button onClick={start}>Run it back</button>{!isElite && <button onClick={onUpgrade}>Unlock Elite report</button>}</div></section>}
  </div>;
}
