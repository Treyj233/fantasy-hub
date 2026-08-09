"use client";

import { useEffect, useMemo, useState } from "react";

type View = "Command Center" | "My Team" | "Player Ranks" | "Start / Sit" | "Waiver Wire" | "Trade Lab" | "Matchups" | "Simulator";
type Player = { id: string; name: string; position: string; team: string; opponent: string; projection: number; leagueProjection?: number | null; floor: number; ceiling: number; trend: number; status: string; role: string };
type RankedPlayer = Player & { overallRank: number; positionRank: number; tier: 1 | 2 | 3 | 4; outlook: string };
type PlayerWeek = { season: string; week: number; points: number; totalYards: number; touchdowns: number; passYards: number; passTouchdowns: number; interceptions: number; rushAttempts: number; rushYards: number; rushTouchdowns: number; targets: number; receptions: number; receivingYards: number; receivingTouchdowns: number };
type PlayerHistory = { sourceStatus: "available" | "unavailable"; player: { id: string; age?: number; yearsExp?: number; college?: string; height?: string; weight?: string }; seasons: { season: string; games: number; points: number; pointsPerGame: number; positionRank: number | null; yards: number; touchdowns: number; receptions: number }[]; recentWeeks: { week: number; points: number; yards: number; touchdowns: number; targets: number }[]; weeks: PlayerWeek[] };
type TradeStyle = "Aggressive" | "Neutral" | "Strict";
type LeagueManager = { id: string; name: string; teamName: string; style: TradeStyle };
type LeagueTeam = { id: string; ownerId?: string; managerName: string; teamName: string; roster: Player[] };
type TradeSuggestion = { id: string; title: string; receive: { name: string; meta: string; value: number }[]; send: { name: string; meta: string; value: number }[]; yourBenefit: number; partnerBenefit: number; acceptance: number; confidence: number; whyYou: string; whyThem: string };

const nav: { label: View; mark: string }[] = [
  { label: "Command Center", mark: "★" }, { label: "My Team", mark: "●" },
  { label: "Player Ranks", mark: "♛" }, { label: "Start / Sit", mark: "⚡" }, { label: "Waiver Wire", mark: "+" },
  { label: "Trade Lab", mark: "↔" }, { label: "Matchups", mark: "◎" },
  { label: "Simulator", mark: "✦" },
];

const demoPlayers: Player[] = [
  { id: "1", name: "Jahmyr Gibbs", position: "RB", team: "DET", opponent: "@ GB", projection: 20.8, floor: 13.2, ceiling: 31.4, trend: 2.1, status: "Healthy", role: "RB1" },
  { id: "2", name: "CeeDee Lamb", position: "WR", team: "DAL", opponent: "vs NYG", projection: 19.4, floor: 11.8, ceiling: 30.2, trend: 1.4, status: "Healthy", role: "WR1" },
  { id: "3", name: "Trey McBride", position: "TE", team: "ARI", opponent: "@ LAR", projection: 15.7, floor: 9.6, ceiling: 24.8, trend: 1.8, status: "Healthy", role: "TE1" },
  { id: "4", name: "Jayden Daniels", position: "QB", team: "WAS", opponent: "vs PHI", projection: 22.1, floor: 15.1, ceiling: 30.7, trend: -0.4, status: "Questionable", role: "QB1" },
  { id: "5", name: "Rome Odunze", position: "WR", team: "CHI", opponent: "@ MIN", projection: 13.6, floor: 7.1, ceiling: 23.9, trend: 2.8, status: "Healthy", role: "FLEX" },
  { id: "6", name: "RJ Harvey", position: "RB", team: "DEN", opponent: "vs LV", projection: 11.8, floor: 6.4, ceiling: 20.1, trend: 1.2, status: "Healthy", role: "RB2" },
  { id: "7", name: "Emeka Egbuka", position: "WR", team: "TB", opponent: "@ CAR", projection: 10.9, floor: 5.3, ceiling: 27.8, trend: 1.9, status: "Healthy", role: "Bench" },
  { id: "8", name: "Tyler Warren", position: "TE", team: "IND", opponent: "vs TEN", projection: 9.8, floor: 4.9, ceiling: 17.7, trend: 0.8, status: "Healthy", role: "Bench" },
];

const rankedPlayers: RankedPlayer[] = [
  { id:"rank-1",name:"Ja'Marr Chase",position:"WR",team:"CIN",opponent:"vs PIT",projection:22.8,floor:14.1,ceiling:35.4,trend:1.8,status:"Healthy",role:"WR1",overallRank:1,positionRank:1,tier:1,outlook:"League-winning target volume and touchdown ceiling." },
  { id:"1",name:"Jahmyr Gibbs",position:"RB",team:"DET",opponent:"@ GB",projection:20.8,floor:13.2,ceiling:31.4,trend:2.1,status:"Healthy",role:"RB1",overallRank:2,positionRank:1,tier:1,outlook:"Elite efficiency, receiving work, and explosive-play access." },
  { id:"rank-3",name:"Bijan Robinson",position:"RB",team:"ATL",opponent:"vs NO",projection:21.2,floor:13.8,ceiling:32.1,trend:1.2,status:"Healthy",role:"RB1",overallRank:3,positionRank:2,tier:1,outlook:"Three-down usage creates one of fantasy's safest ceilings." },
  { id:"rank-4",name:"Justin Jefferson",position:"WR",team:"MIN",opponent:"@ CHI",projection:21.5,floor:13.5,ceiling:34.2,trend:.9,status:"Healthy",role:"WR1",overallRank:4,positionRank:2,tier:1,outlook:"Elite talent and historical production sustain a top-tier range." },
  { id:"2",name:"CeeDee Lamb",position:"WR",team:"DAL",opponent:"vs NYG",projection:19.4,floor:11.8,ceiling:30.2,trend:1.4,status:"Healthy",role:"WR1",overallRank:5,positionRank:3,tier:1,outlook:"Dominant target share keeps both floor and spike-week upside intact." },
  { id:"rank-6",name:"Josh Allen",position:"QB",team:"BUF",opponent:"vs MIA",projection:24.9,floor:17.2,ceiling:36.5,trend:.6,status:"Healthy",role:"QB1",overallRank:6,positionRank:1,tier:1,outlook:"Rushing equity separates him from most weekly quarterback outcomes." },
  { id:"rank-7",name:"Amon-Ra St. Brown",position:"WR",team:"DET",opponent:"@ GB",projection:20.1,floor:13.1,ceiling:29.8,trend:1.1,status:"Healthy",role:"WR1",overallRank:7,positionRank:4,tier:2,outlook:"High-confidence volume anchors an elite weekly floor." },
  { id:"3",name:"Trey McBride",position:"TE",team:"ARI",opponent:"@ LAR",projection:15.7,floor:9.6,ceiling:24.8,trend:1.8,status:"Healthy",role:"TE1",overallRank:8,positionRank:1,tier:2,outlook:"Wide-receiver usage at tight end creates positional leverage." },
  { id:"rank-9",name:"Brock Bowers",position:"TE",team:"LV",opponent:"@ DEN",projection:15.3,floor:9.1,ceiling:25.2,trend:1.3,status:"Healthy",role:"TE1",overallRank:9,positionRank:2,tier:2,outlook:"Target earning and yards after catch support elite TE upside." },
  { id:"rank-10",name:"Lamar Jackson",position:"QB",team:"BAL",opponent:"vs CLE",projection:23.7,floor:16.2,ceiling:35.1,trend:.4,status:"Healthy",role:"QB1",overallRank:10,positionRank:2,tier:2,outlook:"Dual-threat ceiling remains capable of deciding a matchup." },
  { id:"rank-11",name:"Saquon Barkley",position:"RB",team:"PHI",opponent:"@ WAS",projection:19.2,floor:11.7,ceiling:30.8,trend:-.2,status:"Healthy",role:"RB1",overallRank:11,positionRank:3,tier:2,outlook:"High-value touches preserve elite upside with modest workload risk." },
  { id:"rank-12",name:"Puka Nacua",position:"WR",team:"LAR",opponent:"vs ARI",projection:19.6,floor:11.9,ceiling:31.6,trend:.8,status:"Healthy",role:"WR1",overallRank:12,positionRank:5,tier:2,outlook:"Volume and after-catch production drive a strong weekly range." },
  { id:"rank-13",name:"Jalen Hurts",position:"QB",team:"PHI",opponent:"@ WAS",projection:22.9,floor:15.8,ceiling:33.7,trend:.1,status:"Healthy",role:"QB1",overallRank:13,positionRank:3,tier:3,outlook:"Goal-line role protects his ceiling even when passing volume dips." },
  { id:"rank-14",name:"De'Von Achane",position:"RB",team:"MIA",opponent:"@ BUF",projection:18.6,floor:9.8,ceiling:33.2,trend:1.5,status:"Healthy",role:"RB1",overallRank:14,positionRank:4,tier:3,outlook:"Volatility is offset by rare per-touch upside." },
  { id:"rank-15",name:"George Kittle",position:"TE",team:"SF",opponent:"vs SEA",projection:13.8,floor:7.4,ceiling:23.9,trend:-.7,status:"Questionable",role:"TE1",overallRank:15,positionRank:3,tier:3,outlook:"Efficiency remains elite, with availability and volume adding risk." },
  { id:"rank-16",name:"Malik Nabers",position:"WR",team:"NYG",opponent:"@ DAL",projection:18.2,floor:10.7,ceiling:29.7,trend:1.6,status:"Healthy",role:"WR1",overallRank:16,positionRank:6,tier:3,outlook:"Target dominance supports WR1 outcomes despite team volatility." },
];

const waivers = [
  { name: "Tre Harris", pos: "WR", team: "LAC", rostered: 38, score: 91, faab: "12–17%", why: "Route participation and red-zone role are rising together." },
  { name: "Bhayshul Tuten", pos: "RB", team: "JAX", rostered: 31, score: 87, faab: "9–13%", why: "High-leverage touches create an immediate contingent ceiling." },
  { name: "Harold Fannin Jr.", pos: "TE", team: "CLE", rostered: 19, score: 82, faab: "5–8%", why: "Target share is stronger than his current roster rate implies." },
];

const demoManagers: LeagueManager[] = [
  { id: "north-shore", name: "Alex R.", teamName: "North Shore Blitz", style: "Aggressive" },
  { id: "fourth-down", name: "Morgan K.", teamName: "Fourth Down Theory", style: "Neutral" },
  { id: "red-zone", name: "Sam T.", teamName: "Red Zone Republic", style: "Strict" },
  { id: "waiver-wire", name: "Chris M.", teamName: "Waiver Wire Wolves", style: "Neutral" },
];

const tradeSuggestions: Record<TradeStyle, TradeSuggestion[]> = {
  Aggressive: [
    { id: "star-consolidation", title: "Consolidate for an elite weekly anchor", receive: [{ name: "Amon-Ra St. Brown", meta: "WR · DET", value: 94 }], send: [{ name: "Rome Odunze", meta: "WR · CHI", value: 82 }, { name: "RJ Harvey", meta: "RB · DEN", value: 76 }], yourBenefit: 91, partnerBenefit: 84, acceptance: 78, confidence: 82, whyYou: "Adds elite target volume without opening a starting-lineup hole.", whyThem: "Turns one premium asset into two young weekly starters and needed RB depth." },
    { id: "ceiling-swap", title: "Exchange depth for playoff ceiling", receive: [{ name: "Drake London", meta: "WR · ATL", value: 90 }], send: [{ name: "Emeka Egbuka", meta: "WR · TB", value: 78 }, { name: "Tyler Warren", meta: "TE · IND", value: 74 }], yourBenefit: 87, partnerBenefit: 81, acceptance: 72, confidence: 77, whyYou: "Raises FLEX ceiling and concentrates points in the starting lineup.", whyThem: "Adds two ascending assets while filling a thin tight-end spot." },
  ],
  Neutral: [
    { id: "balanced-upgrade", title: "Solve both teams’ weakest starter", receive: [{ name: "Garrett Wilson", meta: "WR · NYJ", value: 88 }], send: [{ name: "Rome Odunze", meta: "WR · CHI", value: 82 }, { name: "Tyler Warren", meta: "TE · IND", value: 74 }], yourBenefit: 85, partnerBenefit: 83, acceptance: 66, confidence: 85, whyYou: "Upgrades weekly WR output while preserving running-back depth.", whyThem: "Receives a starting receiver plus a scarce young tight end." },
    { id: "rb-balance", title: "Trade surplus receiver depth for RB stability", receive: [{ name: "Kenneth Walker III", meta: "RB · SEA", value: 84 }], send: [{ name: "Emeka Egbuka", meta: "WR · TB", value: 78 }], yourBenefit: 82, partnerBenefit: 80, acceptance: 62, confidence: 81, whyYou: "Improves RB2 floor with only a bench receiver leaving.", whyThem: "Moves surplus RB value into a higher-upside receiver need." },
  ],
  Strict: [
    { id: "strict-premium", title: "Pay a measured premium for certainty", receive: [{ name: "Tee Higgins", meta: "WR · CIN", value: 86 }], send: [{ name: "Rome Odunze", meta: "WR · CHI", value: 82 }, { name: "Tyler Warren", meta: "TE · IND", value: 74 }], yourBenefit: 81, partnerBenefit: 88, acceptance: 54, confidence: 79, whyYou: "Adds proven weekly volume without sacrificing an active starter at another position.", whyThem: "Receives the value cushion a strict manager typically requires plus TE upside." },
    { id: "strict-need", title: "Target a clear roster surplus", receive: [{ name: "James Cook", meta: "RB · BUF", value: 86 }], send: [{ name: "Emeka Egbuka", meta: "WR · TB", value: 78 }, { name: "RJ Harvey", meta: "RB · DEN", value: 76 }], yourBenefit: 80, partnerBenefit: 86, acceptance: 49, confidence: 75, whyYou: "Creates a dependable RB2 while retaining the roster’s elite core.", whyThem: "Replaces one back with two young assets and addresses receiver depth." },
  ],
};

export default function FantasyHub() {
  const [view, setView] = useState<View>("Command Center");
  const [players, setPlayers] = useState(demoPlayers);
  const [leagueId, setLeagueId] = useState("");
  const [leagueName, setLeagueName] = useState("Sunday Night Strategists");
  const [importState, setImportState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [starterChoice, setStarterChoice] = useState("Rome Odunze");
  const [simulations, setSimulations] = useState(10000);
  const [simShift, setSimShift] = useState(0);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [managers, setManagers] = useState<LeagueManager[]>(demoManagers);
  const [leagueTeams, setLeagueTeams] = useState<LeagueTeam[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState("");

  const totals = useMemo(() => ({
    projection: players.filter((p) => p.role !== "Bench").reduce((sum, p) => sum + p.projection, 0),
    ceiling: players.filter((p) => p.role !== "Bench").reduce((sum, p) => sum + p.ceiling, 0),
  }), [players]);

  async function importLeague() {
    if (!leagueId.trim()) return;
    setImportState("loading");
    try {
      const response = await fetch(`/api/league?id=${encodeURIComponent(leagueId.trim())}`);
      if (!response.ok) throw new Error("League not found");
      const data = await response.json() as { league: { name: string }; teams?: LeagueTeam[]; managers?: LeagueManager[] };
      setLeagueName(data.league.name);
      const importedTeams = data.teams ?? [];
      setLeagueTeams(importedTeams);
      if (importedTeams.length === 1) {
        setSelectedTeamId(importedTeams[0].id);
        if (importedTeams[0].roster.length) setPlayers(importedTeams[0].roster);
      } else {
        setSelectedTeamId("");
      }
      if (data.managers?.length) setManagers(data.managers);
      setImportState("success");
    } catch {
      setImportState("error");
    }
  }

  function runSimulation() {
    setSimShift(Number((Math.random() * 4 - 1.5).toFixed(1)));
  }

  function selectLeagueTeam(teamId: string) {
    setSelectedTeamId(teamId);
    const team = leagueTeams.find((candidate) => candidate.id === teamId);
    if (team?.roster.length) setPlayers(team.roster);
  }

  const selectedLeagueTeam = leagueTeams.find((team) => team.id === selectedTeamId);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">FH</span><div><strong>Fantasy Hub</strong><small>Make every week count.</small></div></div>
        <div className="league-card"><span>ACTIVE LEAGUE</span><strong>{leagueName}</strong><small>{selectedLeagueTeam ? `${selectedLeagueTeam.teamName} · ` : ""}PPR · Week 8</small></div>
        <nav aria-label="Fantasy Hub sections">{nav.map((item) => <button key={item.label} className={view === item.label ? "active" : ""} onClick={() => setView(item.label)}><i>{item.mark}</i>{item.label}</button>)}</nav>
        <div className="sidebar-bottom"><div><span className="live-dot" /> DATA CURRENT</div><small>Lineups lock Sunday · 12:00 PM</small></div>
      </aside>

      <section className="workspace">
        <header className="topbar"><div><p>WEEK 8 · 2026 SEASON</p><h1>{view}</h1></div><div className="top-actions"><button className="ghost" onClick={() => setView("Simulator")}>Roll the season 🎲</button><div className="avatar">JM</div></div></header>

        {leagueTeams.length > 1 && <section className={`team-picker-strip ${selectedTeamId ? "selected" : ""}`}><div><span>{selectedTeamId ? "YOUR TEAM IS ACTIVE" : "ONE MORE STEP"}</span><strong>{selectedLeagueTeam ? selectedLeagueTeam.teamName : "Which team is yours?"}</strong><small>{selectedLeagueTeam ? `Managed by ${selectedLeagueTeam.managerName}. Your roster now powers every dashboard view.` : "Choose your fantasy team so another manager’s roster never replaces yours."}</small></div><label>Fantasy team<select value={selectedTeamId} onChange={(event) => selectLeagueTeam(event.target.value)}><option value="">Choose your team</option>{leagueTeams.map((team) => <option key={team.id} value={team.id}>{team.teamName} · {team.managerName}</option>)}</select></label></section>}

        {view === "Command Center" && <CommandCenter players={players} totals={totals} setView={setView} setSelectedPlayer={setSelectedPlayer} starterChoice={starterChoice} setStarterChoice={setStarterChoice} />}
        {view === "My Team" && <MyTeam players={players} setSelectedPlayer={setSelectedPlayer} />}
        {view === "Player Ranks" && <PlayerRanks roster={players} setSelectedPlayer={setSelectedPlayer} />}
        {view === "Start / Sit" && <StartSit players={players} choice={starterChoice} setChoice={setStarterChoice} teamProjection={totals.projection} />}
        {view === "Waiver Wire" && <WaiverWire />}
        {view === "Trade Lab" && <TradeLab managers={managers} />}
        {view === "Matchups" && <Matchups players={players} />}
        {view === "Simulator" && <Simulator simulations={simulations} setSimulations={setSimulations} shift={simShift} run={runSimulation} />}

        <section className="connect-strip">
          <div><span>CONNECT YOUR LEAGUE</span><strong>Replace demo data with your actual roster</strong><small>Enter a public league ID to import settings, managers, rosters, and scoring.</small></div>
          <div className="connect-form"><input value={leagueId} onChange={(e) => setLeagueId(e.target.value)} placeholder="League ID" aria-label="League ID" /><button onClick={importLeague} disabled={importState === "loading"}>{importState === "loading" ? "Connecting…" : "Import league"}</button></div>
          {importState === "error" && <p className="form-error">We couldn’t find that league. Confirm the ID and try again.</p>}
          {importState === "success" && <p className="form-success">{leagueTeams.length > 1 && !selectedTeamId ? "League connected. Choose your team above to finish setup." : "League connected. Your roster is ready."}</p>}
        </section>
      </section>

      {selectedPlayer && <PlayerPanel key={selectedPlayer.id} player={selectedPlayer} close={() => setSelectedPlayer(null)} />}
    </main>
  );
}

function CommandCenter({ players, totals, setView, setSelectedPlayer, starterChoice, setStarterChoice }: { players: Player[]; totals: { projection: number; ceiling: number }; setView: (v: View) => void; setSelectedPlayer: (p: Player) => void; starterChoice: string; setStarterChoice: (v: string) => void }) {
  const concern = players.find((p) => p.status !== "Healthy");
  const flexCandidates = players.filter((player) => player.position !== "QB" && player.position !== "DEF");
  const primaryDecision = players.find((player) => player.name === "Rome Odunze") ?? flexCandidates.at(-2) ?? players[0];
  const secondaryDecision = players.find((player) => player.name === "Emeka Egbuka") ?? flexCandidates.at(-1) ?? players[1] ?? primaryDecision;
  const activeStarter = [primaryDecision.name, secondaryDecision.name].includes(starterChoice) ? starterChoice : primaryDecision.name;
  return <div className="page-content">
    <section className="hero"><div><p>LINEUP LOCK · GAME DAY HQ</p><h2>Let’s go win<br /><em>Week 8.</em></h2><span>Your roster is in the mix. One smart FLEX call and an early waiver swing can turn a good week into a statement win.</span><div className="game-day-pills"><b>🔥 3-week heater</b><b>⚡ 2 lineup edges</b><b>🎯 64% win odds</b></div></div><div className="hero-score"><small>YOU’RE PROJECTED FOR</small><strong>{totals.projection.toFixed(1)}</strong><span>Ceiling {totals.ceiling.toFixed(1)} · Let it fly</span></div></section>
    <div className="metric-grid"><Metric label="Win probability" value="64%" detail="+7% after lineup optimization" tone="good" /><Metric label="Projected rank" value="3rd" detail="of 12 teams this week" /><Metric label="Playoff odds" value="72%" detail="+4.2% over last week" tone="good" /><Metric label="Roster health" value="86" detail={concern ? `Monitor ${concern.name}` : "No active concerns"} tone="warn" /></div>
    <div className="main-grid"><section className="panel decision-panel"><Header eyebrow="TOP DECISION" title="Set the final FLEX spot" action="Open Start / Sit" onClick={() => setView("Start / Sit")} /><div className="player-versus"><PlayerChoice player={primaryDecision} active={activeStarter === primaryDecision.name} onClick={() => setStarterChoice(primaryDecision.name)} /><div className="versus">VS</div><PlayerChoice player={secondaryDecision} active={activeStarter === secondaryDecision.name} onClick={() => setStarterChoice(secondaryDecision.name)} /></div><div className="recommendation"><b>START {activeStarter.toUpperCase()}</b><p>Higher route certainty and a better projected game environment create the stronger median outcome.</p></div></section>
      <section className="panel"><Header eyebrow="LINEUP PULSE" title="Your core starters" action="View team" onClick={() => setView("My Team")} /><div className="player-list">{players.slice(0, 4).map((p) => <button key={p.id} onClick={() => setSelectedPlayer(p)}><span className={`pos pos-${p.position.toLowerCase()}`}>{p.position}</span><div><strong>{p.name}</strong><small>{p.team} · {p.opponent}</small></div><div className="points"><strong>{p.projection}</strong><small>PTS</small></div></button>)}</div></section>
    </div>
    <div className="lower-grid"><section className="panel"><Header eyebrow="WAIVER PRIORITY" title="Move before your league does" action="See all" onClick={() => setView("Waiver Wire")} /><div className="waiver-preview">{waivers.slice(0, 2).map((w, i) => <div key={w.name}><b>0{i + 1}</b><span className="pos pos-wr">{w.pos}</span><p><strong>{w.name}</strong><small>{w.team} · {w.rostered}% rostered</small></p><em>{w.faab} FAAB</em></div>)}</div></section>
      <section className="panel matchup-card"><Header eyebrow="MATCHUP EDGE" title="Attack this coverage profile" action="Explore" onClick={() => setView("Matchups")} /><strong>DAL receivers vs NYG secondary</strong><p>New York’s zone-heavy profile elevates CeeDee Lamb’s target floor and yards-after-catch opportunity.</p><div><span>Zone rate <b>71%</b></span><span>WR advantage <b>+8.4</b></span></div></section>
    </div>
  </div>;
}

function MyTeam({ players, setSelectedPlayer }: { players: Player[]; setSelectedPlayer: (p: Player) => void }) {
  const starters = players.filter((player) => player.role !== "Bench");
  const bench = players.filter((player) => player.role === "Bench");
  return <div className="page-content"><SectionIntro kicker="ROSTER CONTROL" title="Your lineup in league order" text="Starters follow the exact slot sequence configured by your league. Bench players remain separate and preserve roster order." /><RosterSection title="Starters" detail={`${starters.length} active lineup slots`} players={starters} setSelectedPlayer={setSelectedPlayer} /><RosterSection title="Bench" detail={`${bench.length} reserve players`} players={bench} setSelectedPlayer={setSelectedPlayer} /></div>;
}

function RosterSection({ title, detail, players, setSelectedPlayer }: { title: string; detail: string; players: Player[]; setSelectedPlayer: (player: Player) => void }) {
  return <section className="roster-section panel"><header><div><span>{title === "Starters" ? "ACTIVE LINEUP" : "RESERVES"}</span><h3>{title}</h3></div><small>{detail}</small></header><div className="table-panel"><table><thead><tr><th>Player</th><th>Slot</th><th>Matchup</th><th>League projection</th><th>Fantasy Hub</th><th>FH edge</th><th>Status</th></tr></thead><tbody>{players.map((player) => { const hasLeagueProjection = typeof player.leagueProjection === "number"; const edge = hasLeagueProjection ? player.projection - player.leagueProjection! : null; return <tr key={player.id} onClick={() => setSelectedPlayer(player)}><td><span className={`pos pos-${player.position.toLowerCase()}`}>{player.position}</span><strong>{player.name}</strong><small>{player.team}</small></td><td><span className={player.role === "Bench" ? "roster-slot bench" : "roster-slot"}>{player.role}</span></td><td>{player.opponent}</td><td><span className="league-projection">{hasLeagueProjection ? player.leagueProjection!.toFixed(1) : "—"}</span></td><td><b className="hub-projection">{player.projection.toFixed(1)}</b></td><td><span className={edge === null ? "projection-edge neutral" : edge >= 0 ? "projection-edge positive" : "projection-edge negative"}>{edge === null ? "N/A" : `${edge >= 0 ? "+" : ""}${edge.toFixed(1)}`}</span></td><td><Status value={player.status} /></td></tr>; })}</tbody></table>{!players.length && <p className="empty-roster">No players are assigned to this section.</p>}</div></section>;
}

function PlayerRanks({ roster, setSelectedPlayer }: { roster: Player[]; setSelectedPlayer: (player: Player) => void }) {
  const [position, setPosition] = useState("ALL");
  const [query, setQuery] = useState("");
  const rosterNames = new Set(roster.map((player) => player.name.toLowerCase()));
  const pool = [...rankedPlayers, ...roster.filter((player) => !rankedPlayers.some((ranked) => ranked.name === player.name)).map((player, index) => ({ ...player, overallRank: rankedPlayers.length + index + 1, positionRank: rankedPlayers.filter((ranked) => ranked.position === player.position).length + index + 1, tier: 4 as const, outlook: "Roster player awaiting a larger league-wide projection sample." }))];
  const filtered = pool.filter((player) => (position === "ALL" || player.position === position) && player.name.toLowerCase().includes(query.trim().toLowerCase()));
  const tiers = [1, 2, 3, 4] as const;
  const tierLabels = { 1: "Elite difference-makers", 2: "Weekly advantages", 3: "Strong starters", 4: "Depth and emerging value" };
  return <div className="page-content"><SectionIntro kicker="PLAYER RANKINGS" title="Rank the player pool in decision-ready tiers" text="Ranks combine projected production, floor, ceiling, role stability, health, and positional advantage. Tiers matter more than tiny differences between adjacent players." /><section className="rank-controls panel"><div className="position-filters" role="group" aria-label="Filter rankings by position">{["ALL","QB","RB","WR","TE"].map((value) => <button key={value} className={position === value ? "active" : ""} onClick={() => setPosition(value)}>{value}</button>)}</div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search players" aria-label="Search player rankings" /><span>{filtered.length} players</span></section><div className="tier-list">{tiers.map((tier) => { const tierPlayers = filtered.filter((player) => player.tier === tier); if (!tierPlayers.length) return null; return <section className={`tier-section tier-${tier}`} key={tier}><header><div><span>TIER {tier}</span><h3>{tierLabels[tier]}</h3></div><small>{tierPlayers.length} players</small></header><div className="rank-table"><div className="rank-row rank-head"><span>Rank</span><span>Player</span><span>Pos.</span><span>FH projection</span><span>Range</span><span>Outlook</span></div>{tierPlayers.map((player) => { const onRoster = rosterNames.has(player.name.toLowerCase()); return <button className={`rank-row ${onRoster ? "on-roster" : ""}`} key={`${player.name}-${player.team}`} onClick={() => setSelectedPlayer(player)}><b>#{player.overallRank}</b><span className="rank-player"><strong>{player.name}</strong><small>{player.team}{onRoster ? " · YOUR TEAM" : ""}</small></span><span><i className={`pos pos-${player.position.toLowerCase()}`}>{player.position}{player.positionRank}</i></span><strong className="rank-projection">{player.projection.toFixed(1)}</strong><span className="rank-range">{player.floor.toFixed(1)}–{player.ceiling.toFixed(1)}</span><p>{player.outlook}</p></button>; })}</div></section>; })}{!filtered.length && <section className="panel rank-empty">No players match this filter.</section>}</div></div>;
}

function StartSit({ players, choice, setChoice, teamProjection }: { players: Player[]; choice: string; setChoice: (v: string) => void; teamProjection: number }) {
  const preferred = players.filter((player) => ["Rome Odunze", "Emeka Egbuka"].includes(player.name));
  const fallback = players.filter((player) => player.position !== "QB" && player.position !== "DEF").slice(-2);
  const options = preferred.length === 2 ? preferred : fallback;
  const [opponentProjection, setOpponentProjection] = useState(Math.round(teamProjection + 8));
  const recommendedAggression = Math.max(10, Math.min(90, Math.round(50 + (opponentProjection - teamProjection) * 2.5)));
  const [aggressiveness, setAggressiveness] = useState(recommendedAggression);
  const posture = aggressiveness < 35 ? "Play it safe" : aggressiveness > 65 ? "Shoot for upside" : "Balanced";
  const activeChoice = options.some((player) => player.name === choice) ? choice : options[0]?.name ?? choice;
  const scorePlayer = (player: Player) => player.projection * .5 + player.floor * .5 * (1 - aggressiveness / 100) + player.ceiling * .5 * (aggressiveness / 100);
  const recommendedPlayer = [...options].sort((a, b) => scorePlayer(b) - scorePlayer(a))[0];
  const matchupGap = opponentProjection - teamProjection;
  return <div className="page-content"><SectionIntro kicker="WEEKLY DECISIONS" title="Choose the outcome your matchup requires" text="A favorite should protect its floor. An underdog may need more volatility and ceiling to create a realistic path to win." />
    <section className="risk-console panel"><div className="matchup-inputs"><label>Your team projection<input type="number" step="0.1" value={teamProjection.toFixed(1)} readOnly /></label><span>VS</span><label>Opponent projection<input type="number" step="0.1" value={opponentProjection} onChange={(event) => setOpponentProjection(Number(event.target.value))} /></label></div><div className="risk-recommendation"><span>RECOMMENDED APPROACH</span><strong>{recommendedAggression}% · {recommendedAggression < 35 ? "Play it safe" : recommendedAggression > 65 ? "Shoot for upside" : "Balanced"}</strong><p>{matchupGap > 3 ? `You project ${matchupGap.toFixed(1)} points behind. Accept more variance to improve your upset path.` : matchupGap < -3 ? `You project ${Math.abs(matchupGap).toFixed(1)} points ahead. Protect the favorite outcome with dependable volume.` : "The matchup is close enough to favor balanced median outcomes."}</p><button onClick={() => setAggressiveness(recommendedAggression)}>Use recommended</button></div></section>
    <section className="aggression-panel panel"><div><span>START / SIT AGGRESSIVENESS</span><strong>{aggressiveness}%</strong><small>{posture}</small></div><input aria-label="Start sit aggressiveness" type="range" min="0" max="100" step="1" value={aggressiveness} onChange={(event) => setAggressiveness(Number(event.target.value))} style={{ background: `linear-gradient(90deg, var(--green) 0%, var(--gold) ${aggressiveness}%, #dfe7df ${aggressiveness}%, #dfe7df 100%)` }} /><div className="aggression-labels"><span>Protect floor</span><span>Balanced</span><span>Chase ceiling</span></div></section>
    <div className="compare-grid">{options.map((player) => { const modelChoice = recommendedPlayer?.id === player.id; return <button key={player.id} className={`compare-card ${activeChoice === player.name ? "selected" : ""}`} onClick={() => setChoice(player.name)}><div className="choice-top"><span className={`pos pos-${player.position.toLowerCase()}`}>{player.position}</span>{modelChoice && <b>MODEL PICK</b>}</div><small>{player.team} · {player.opponent}</small><h3>{player.name}</h3><div className="range-bar"><i style={{ left: `${player.floor * 2.3}%`, width: `${(player.ceiling - player.floor) * 2.3}%` }} /><b style={{ left: `${player.projection * 2.3}%` }} /></div><div className="range-labels"><span>Floor <b>{player.floor}</b></span><span>Projection <b>{player.projection}</b></span><span>Ceiling <b>{player.ceiling}</b></span></div><p>{aggressiveness > 65 ? `Ceiling carries more weight at this setting. Risk-adjusted score: ${scorePlayer(player).toFixed(1)}.` : aggressiveness < 35 ? `Floor and role certainty carry more weight. Risk-adjusted score: ${scorePlayer(player).toFixed(1)}.` : `Median projection leads the decision. Risk-adjusted score: ${scorePlayer(player).toFixed(1)}.`}</p><strong className="select-label">{activeChoice === player.name ? "CURRENT STARTER" : "SELECT PLAYER"}</strong></button>; })}</div>
    <section className="insight-box"><span>FANTASY HUB VERDICT</span><h3>Start {recommendedPlayer?.name ?? activeChoice}</h3><p>At {aggressiveness}% aggressiveness, the model weights {aggressiveness > 65 ? "ceiling and game-breaking outcomes" : aggressiveness < 35 ? "floor, role certainty, and downside protection" : "floor, median, and ceiling more evenly"}. The recommendation can change as your matchup posture changes.</p></section>
  </div>;
}

function WaiverWire() { const [claimed, setClaimed] = useState<string[]>([]); return <div className="page-content"><SectionIntro kicker="ROSTER MARKET" title="Turn available players into weekly leverage" text="Recommendations account for your roster, role growth, positional scarcity, and FAAB opportunity cost." /><div className="waiver-grid">{waivers.map((w, i) => <article className="waiver-card" key={w.name}><div><b>0{i + 1}</b><span className="score">{w.score} FIT</span></div><span className="pos pos-wr">{w.pos}</span><h3>{w.name}</h3><small>{w.team} · {w.rostered}% rostered</small><p>{w.why}</p><dl><div><dt>Recommended bid</dt><dd>{w.faab}</dd></div><div><dt>Priority</dt><dd>{i === 0 ? "Aggressive" : "Measured"}</dd></div></dl><button onClick={() => setClaimed((c) => c.includes(w.name) ? c.filter((n) => n !== w.name) : [...c, w.name])}>{claimed.includes(w.name) ? "Added to plan" : "Add to waiver plan"}</button></article>)}</div></div>; }

function TradeLab({ managers }: { managers: LeagueManager[] }) {
  const [selectedId, setSelectedId] = useState(managers[0]?.id ?? "");
  const [styles, setStyles] = useState<Record<string, TradeStyle>>(() => Object.fromEntries(managers.map((manager) => [manager.id, manager.style])));
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const partner = managers.find((manager) => manager.id === selectedId) ?? managers[0];
  const partnerStyle = partner ? (styles[partner.id] ?? partner.style) : "Neutral";
  const suggestions = tradeSuggestions[partnerStyle];
  const suggestion = suggestions[activeSuggestion % suggestions.length];
  function selectPartner(id: string) { setSelectedId(id); setActiveSuggestion(0); }
  function updateStyle(style: TradeStyle) { if (!partner) return; setStyles((current) => ({ ...current, [partner.id]: style })); setActiveSuggestion(0); }
  return <div className="page-content">
    <SectionIntro kicker="TRADE INTELLIGENCE" title="Find trades both managers have a reason to accept" text="GM Hub’s value-exchange framework is adapted for fantasy: lineup impact, positional scarcity, roster needs, manager behavior, mutual benefit, and acceptance likelihood all shape each suggestion." />
    <section className="trade-controls panel"><div><label htmlFor="trade-partner">Trade partner</label><select id="trade-partner" value={partner?.id ?? ""} onChange={(event) => selectPartner(event.target.value)}>{managers.map((manager) => <option key={manager.id} value={manager.id}>{manager.teamName} · {manager.name}</option>)}</select></div><div><span>Negotiation profile</span><div className="style-toggle" role="group" aria-label="Trade partner negotiation profile">{(["Aggressive", "Neutral", "Strict"] as TradeStyle[]).map((style) => <button key={style} className={partnerStyle === style ? "active" : ""} onClick={() => updateStyle(style)}>{style}</button>)}</div></div><p><strong>{partnerStyle}</strong>{partnerStyle === "Aggressive" ? "More willing to consolidate value and accept higher-variance packages." : partnerStyle === "Strict" ? "Requires a visible value cushion and a direct roster-need solution." : "Prefers balanced value with a clear benefit for both starting lineups."}</p></section>
    <div className="suggestion-tabs" role="tablist" aria-label="Recommended trade frameworks">{suggestions.map((item, index) => <button key={item.id} role="tab" aria-selected={index === activeSuggestion} className={index === activeSuggestion ? "active" : ""} onClick={() => setActiveSuggestion(index)}><span>OPTION {index + 1}</span><strong>{item.title}</strong><small>{item.acceptance}% estimated acceptance</small></button>)}</div>
    <div className="trade-board"><section><span>YOU RECEIVE</span>{suggestion.receive.map((asset) => <TradeAsset key={asset.name} name={asset.name} meta={asset.meta} value={String(asset.value)} />)}</section><div className="trade-balance"><strong>{Math.min(suggestion.yourBenefit, suggestion.partnerBenefit)}</strong><span>Mutual benefit</span><i>↔</i><b>{suggestion.acceptance}% likely</b></div><section><span>{partner?.teamName.toUpperCase() ?? "PARTNER"} RECEIVES</span>{suggestion.send.map((asset) => <TradeAsset key={asset.name} name={asset.name} meta={asset.meta} value={String(asset.value)} />)}</section></div>
    <div className="mutual-grid"><article><span>YOUR TEAM</span><strong>{suggestion.yourBenefit}</strong><h3>Why this helps you</h3><p>{suggestion.whyYou}</p></article><article><span>{partner?.teamName ?? "Trade partner"}</span><strong>{suggestion.partnerBenefit}</strong><h3>Why they may accept</h3><p>{suggestion.whyThem}</p></article><article><span>DEAL CONFIDENCE</span><strong>{suggestion.confidence}%</strong><h3>Framework quality</h3><p>Confidence reflects role certainty, valuation range, roster-need evidence, and the selected manager profile.</p></article></div>
    <section className="trade-note"><strong>Behavior setting, not a guarantee</strong><p>Aggressive, Neutral, and Strict change the acceptance threshold and package construction. They do not override player value or force every suggestion to look equal.</p></section>
  </div>;
}

function Matchups({ players }: { players: Player[] }) { return <div className="page-content"><SectionIntro kicker="MATCHUP INTELLIGENCE" title="Find where role and opponent tendency intersect" text="Coverage, pressure, pace, and game environment refine—not replace—player talent and opportunity." /><div className="matchup-grid">{players.slice(0, 6).map((p, i) => <article key={p.id}><div><span className={`pos pos-${p.position.toLowerCase()}`}>{p.position}</span><b className={i < 3 ? "edge-positive" : "edge-neutral"}>{i < 3 ? `+${(8.4 - i * 1.7).toFixed(1)}` : "+1.2"}</b></div><h3>{p.name}</h3><small>{p.team} · {p.opponent}</small><p>{i % 2 ? "Opponent pressure profile increases quick-game volume and scramble opportunity." : "Coverage tendency aligns with the player’s strongest route and usage profile."}</p><div className="match-meter"><i style={{ width: `${78 - i * 5}%` }} /></div><span>{i < 2 ? "Strong advantage" : "Playable matchup"}</span></article>)}</div></div>; }

function Simulator({ simulations, setSimulations, shift, run }: { simulations: number; setSimulations: (n: number) => void; shift: number; run: () => void }) { const playoff = 72 + shift; const title = 14.8 + shift * .7; return <div className="page-content"><SectionIntro kicker="MONTE CARLO LAB" title="See the range—not just one projection" text="Simulate injuries, weekly variance, roster moves, playoff paths, and opponent strength across the rest of the season." /><section className="sim-hero"><div><label>Simulation volume<select value={simulations} onChange={(e) => setSimulations(Number(e.target.value))}><option value="5000">5,000 seasons</option><option value="10000">10,000 seasons</option><option value="25000">25,000 seasons</option></select></label><button onClick={run}>Run simulation</button></div><div className="sim-results"><Metric label="Playoff odds" value={`${playoff.toFixed(1)}%`} detail="Median finish: 3rd" tone="good" /><Metric label="First-round bye" value={`${(21.4 + shift * .4).toFixed(1)}%`} detail="Top-two finish" /><Metric label="Title odds" value={`${title.toFixed(1)}%`} detail="League baseline: 8.3%" tone="good" /></div></section><div className="scenario-grid"><Scenario title="Floor outcome · 10th percentile" record="6–8" odds="8% playoffs" text="A starter injury and declining FLEX efficiency leave the roster dependent on waiver replacement production." /><Scenario title="Median outcome · 50th percentile" record="9–5" odds="72% playoffs" text="Core players retain volume while one waiver addition stabilizes the second running-back spot." /><Scenario title="Ceiling outcome · 90th percentile" record="11–3" odds="24% title" text="Elite players remain healthy and the roster converts its matchup advantages during the fantasy playoffs." /></div></div>; }

function PlayerPanel({ player, close }: { player: Player; close: () => void }) {
  const [history, setHistory] = useState<PlayerHistory | null>(null);
  const [historyState, setHistoryState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [selectedSeason, setSelectedSeason] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/player-history?id=${encodeURIComponent(player.id)}&name=${encodeURIComponent(player.name)}`, { signal: controller.signal }).then((response) => response.ok ? response.json() : Promise.reject()).then((data: PlayerHistory) => { setHistory(data); setHistoryState(data.sourceStatus === "available" ? "ready" : "unavailable"); }).catch((error) => { if (error?.name !== "AbortError") setHistoryState("unavailable"); });
    return () => controller.abort();
  }, [player.id, player.name]);
  const maxSeasonPoints = Math.max(1, ...(history?.seasons.map((season) => season.points) ?? []));
  const activeSeason = selectedSeason || history?.seasons[0]?.season || "";
  const seasonWeeks = history?.weeks.filter((week) => week.season === activeSeason).sort((a, b) => a.week - b.week) ?? [];
  const playedWeeks = seasonWeeks.filter((week) => week.points || week.totalYards || week.touchdowns);
  const weeklyAverage = playedWeeks.length ? playedWeeks.reduce((total, week) => total + week.points, 0) / playedWeeks.length : 0;
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}><aside className="player-panel player-dossier"><header><div><span className={`pos pos-${player.position.toLowerCase()}`}>{player.position}</span><small>{player.team} · {player.opponent}</small><h2>{player.name}</h2><Status value={player.status} /></div><button className="close" onClick={close}>×</button></header><section className="dossier-hero"><div><span>FANTASY HUB PROJECTION</span><strong>{player.projection.toFixed(1)}</strong><small>{typeof player.leagueProjection === "number" ? `League ${player.leagueProjection.toFixed(1)} · FH edge ${(player.projection - player.leagueProjection) >= 0 ? "+" : ""}${(player.projection - player.leagueProjection).toFixed(1)}` : "Independent weekly model"}</small></div><div className="outcome-range"><span>Floor <b>{player.floor.toFixed(1)}</b></span><span>Median <b>{player.projection.toFixed(1)}</b></span><span>Ceiling <b>{player.ceiling.toFixed(1)}</b></span></div></section><section className="dossier-facts"><div><span>Role</span><strong>{player.role}</strong></div><div><span>Trend</span><strong className={player.trend >= 0 ? "up" : "down"}>{player.trend >= 0 ? "+" : ""}{player.trend.toFixed(1)}</strong></div><div><span>Experience</span><strong>{history?.player.yearsExp != null ? `${history.player.yearsExp} yrs` : "—"}</strong></div><div><span>Age</span><strong>{history?.player.age ?? "—"}</strong></div></section><section className="history-section"><header><div><span>HISTORICAL PRODUCTION</span><h3>Season performance</h3></div>{historyState === "ready" && <small>Full PPR</small>}</header>{historyState === "loading" && <div className="history-loading"><i /><i /><i /></div>}{historyState === "unavailable" && <p className="history-empty">Historical production is unavailable for this player.</p>}{historyState === "ready" && <div className="season-history">{history!.seasons.map((season) => <article key={season.season}><div><strong>{season.season}</strong><span>{season.games} games · {season.positionRank ? `Pos. #${season.positionRank}` : "Rank unavailable"}</span></div><div className="season-bar"><i style={{ width: `${Math.max(4, season.points / maxSeasonPoints * 100)}%` }} /></div><div><b>{season.points.toFixed(1)} pts</b><span>{season.pointsPerGame.toFixed(1)} PPG</span></div><dl><div><dt>Yards</dt><dd>{season.yards.toLocaleString()}</dd></div><div><dt>TD</dt><dd>{season.touchdowns}</dd></div><div><dt>Rec</dt><dd>{season.receptions}</dd></div></dl></article>)}</div>}</section><section className="history-section"><header><div><span>RECENT FORM</span><h3>Latest weekly results</h3></div></header>{historyState === "ready" && history!.recentWeeks.length > 0 ? <div className="week-strip">{history!.recentWeeks.map((week) => <article key={week.week}><span>W{week.week}</span><strong>{week.points.toFixed(1)}</strong><small>{week.yards} yd · {week.touchdowns} TD</small><i style={{ height: `${Math.min(100, Math.max(8, week.points / 30 * 100))}%` }} /></article>)}</div> : historyState === "ready" && <p className="history-empty">No recent weekly results were returned.</p>}</section>{historyState === "ready" && <section className="history-section full-game-log"><header><div><span>FULL GAME LOG</span><h3>Week-by-week production</h3></div><label>Season<select value={activeSeason} onChange={(event) => setSelectedSeason(event.target.value)}>{history!.seasons.map((season) => <option key={season.season} value={season.season}>{season.season}</option>)}</select></label></header><div className="game-log-summary"><span>Games <b>{playedWeeks.length}</b></span><span>Average <b>{weeklyAverage.toFixed(1)}</b></span><span>Best week <b>{playedWeeks.length ? Math.max(...playedWeeks.map((week) => week.points)).toFixed(1) : "—"}</b></span><span>10+ points <b>{playedWeeks.filter((week) => week.points >= 10).length}</b></span></div><div className="game-log-scroll"><table><thead><tr><th>Week</th><th>PPR</th><th>Total yd</th><th>Pass</th><th>Rush</th><th>Receiving</th><th>TD</th></tr></thead><tbody>{seasonWeeks.map((week) => <tr key={`${week.season}-${week.week}`}><td><b>W{week.week}</b></td><td><strong>{week.points.toFixed(1)}</strong></td><td>{week.totalYards}</td><td><span>{week.passYards} yd · {week.passTouchdowns} TD{week.interceptions ? ` · ${week.interceptions} INT` : ""}</span></td><td><span>{week.rushAttempts} att · {week.rushYards} yd · {week.rushTouchdowns} TD</span></td><td><span>{week.receptions}/{week.targets} · {week.receivingYards} yd · {week.receivingTouchdowns} TD</span></td><td>{week.touchdowns}</td></tr>)}</tbody></table>{!seasonWeeks.length && <p className="history-empty">No weekly results were returned for this season.</p>}</div></section>}<section className="dossier-outlook"><span>FANTASY HUB OUTLOOK</span><h3>{player.ceiling - player.floor > 18 ? "High-variance matchup weapon" : "Stable weekly lineup asset"}</h3><p>{player.ceiling - player.floor > 18 ? "The outcome range is wide enough that matchup posture should influence the decision. The ceiling is valuable when chasing an upset; the floor carries more risk when favored." : "Role security and a tighter outcome range support dependable lineup usage. Historical production provides context, while the weekly model remains matchup-specific."}</p></section></aside></div>;
}

function Metric({ label, value, detail, tone = "" }: { label: string; value: string; detail: string; tone?: string }) { return <article className={`metric ${tone}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>; }
function Header({ eyebrow, title, action, onClick }: { eyebrow: string; title: string; action: string; onClick: () => void }) { return <header className="panel-header"><div><span>{eyebrow}</span><h3>{title}</h3></div><button onClick={onClick}>{action} →</button></header>; }
function SectionIntro({ kicker, title, text }: { kicker: string; title: string; text: string }) { return <header className="section-intro"><span>{kicker}</span><h2>{title}</h2><p>{text}</p></header>; }
function Status({ value }: { value: string }) { return <span className={`status ${value === "Healthy" ? "healthy" : "questionable"}`}>{value}</span>; }
function PlayerChoice({ player, active, onClick }: { player: Player; active: boolean; onClick: () => void }) { return <button className={`player-choice ${active ? "chosen" : ""}`} onClick={onClick}><span className={`pos pos-${player.position.toLowerCase()}`}>{player.position}</span><small>{player.team} · {player.opponent}</small><strong>{player.name}</strong><div><b>{player.projection}</b><span>PROJECTED</span></div></button>; }
function TradeAsset({ name, meta, value }: { name: string; meta: string; value: string }) { return <article className="trade-asset"><span className="pos pos-wr">WR</span><p><strong>{name}</strong><small>{meta}</small></p><b>{value}</b></article>; }
function Scenario({ title, record, odds, text }: { title: string; record: string; odds: string; text: string }) { return <article><span>{title}</span><h3>{record}</h3><strong>{odds}</strong><p>{text}</p></article>; }
