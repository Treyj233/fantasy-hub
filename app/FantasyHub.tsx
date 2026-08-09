"use client";

import { useMemo, useState } from "react";

type View = "Command Center" | "My Team" | "Start / Sit" | "Waiver Wire" | "Trade Lab" | "Matchups" | "Simulator";
type Player = { id: string; name: string; position: string; team: string; opponent: string; projection: number; floor: number; ceiling: number; trend: number; status: string; role: string };
type TradeStyle = "Aggressive" | "Neutral" | "Strict";
type LeagueManager = { id: string; name: string; teamName: string; style: TradeStyle };
type TradeSuggestion = { id: string; title: string; receive: { name: string; meta: string; value: number }[]; send: { name: string; meta: string; value: number }[]; yourBenefit: number; partnerBenefit: number; acceptance: number; confidence: number; whyYou: string; whyThem: string };

const nav: { label: View; mark: string }[] = [
  { label: "Command Center", mark: "C" }, { label: "My Team", mark: "T" },
  { label: "Start / Sit", mark: "S" }, { label: "Waiver Wire", mark: "W" },
  { label: "Trade Lab", mark: "↔" }, { label: "Matchups", mark: "M" },
  { label: "Simulator", mark: "%" },
];

const demoPlayers: Player[] = [
  { id: "1", name: "Jahmyr Gibbs", position: "RB", team: "DET", opponent: "@ GB", projection: 20.8, floor: 13.2, ceiling: 31.4, trend: 2.1, status: "Healthy", role: "RB1" },
  { id: "2", name: "CeeDee Lamb", position: "WR", team: "DAL", opponent: "vs NYG", projection: 19.4, floor: 11.8, ceiling: 30.2, trend: 1.4, status: "Healthy", role: "WR1" },
  { id: "3", name: "Trey McBride", position: "TE", team: "ARI", opponent: "@ LAR", projection: 15.7, floor: 9.6, ceiling: 24.8, trend: 1.8, status: "Healthy", role: "TE1" },
  { id: "4", name: "Jayden Daniels", position: "QB", team: "WAS", opponent: "vs PHI", projection: 22.1, floor: 15.1, ceiling: 30.7, trend: -0.4, status: "Questionable", role: "QB1" },
  { id: "5", name: "Rome Odunze", position: "WR", team: "CHI", opponent: "@ MIN", projection: 13.6, floor: 7.1, ceiling: 23.9, trend: 2.8, status: "Healthy", role: "FLEX" },
  { id: "6", name: "RJ Harvey", position: "RB", team: "DEN", opponent: "vs LV", projection: 11.8, floor: 6.4, ceiling: 20.1, trend: 1.2, status: "Healthy", role: "RB2" },
  { id: "7", name: "Emeka Egbuka", position: "WR", team: "TB", opponent: "@ CAR", projection: 10.9, floor: 5.3, ceiling: 19.6, trend: 1.9, status: "Healthy", role: "Bench" },
  { id: "8", name: "Tyler Warren", position: "TE", team: "IND", opponent: "vs TEN", projection: 9.8, floor: 4.9, ceiling: 17.7, trend: 0.8, status: "Healthy", role: "Bench" },
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
      const data = await response.json() as { league: { name: string }; roster?: Player[]; managers?: LeagueManager[] };
      setLeagueName(data.league.name);
      if (data.roster?.length) setPlayers(data.roster);
      if (data.managers?.length) setManagers(data.managers);
      setImportState("success");
    } catch {
      setImportState("error");
    }
  }

  function runSimulation() {
    setSimShift(Number((Math.random() * 4 - 1.5).toFixed(1)));
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">FH</span><div><strong>Fantasy Hub</strong><small>Make every week count.</small></div></div>
        <div className="league-card"><span>ACTIVE LEAGUE</span><strong>{leagueName}</strong><small>12-team · PPR · Week 8</small></div>
        <nav aria-label="Fantasy Hub sections">{nav.map((item) => <button key={item.label} className={view === item.label ? "active" : ""} onClick={() => setView(item.label)}><i>{item.mark}</i>{item.label}</button>)}</nav>
        <div className="sidebar-bottom"><div><span className="live-dot" /> DATA CURRENT</div><small>Lineups lock Sunday · 12:00 PM</small></div>
      </aside>

      <section className="workspace">
        <header className="topbar"><div><p>WEEK 8 · 2026 SEASON</p><h1>{view}</h1></div><div className="top-actions"><button className="ghost" onClick={() => setView("Simulator")}>Run season sim</button><div className="avatar">JM</div></div></header>

        {view === "Command Center" && <CommandCenter players={players} totals={totals} setView={setView} setSelectedPlayer={setSelectedPlayer} starterChoice={starterChoice} setStarterChoice={setStarterChoice} />}
        {view === "My Team" && <MyTeam players={players} setSelectedPlayer={setSelectedPlayer} />}
        {view === "Start / Sit" && <StartSit players={players} choice={starterChoice} setChoice={setStarterChoice} />}
        {view === "Waiver Wire" && <WaiverWire />}
        {view === "Trade Lab" && <TradeLab managers={managers} />}
        {view === "Matchups" && <Matchups players={players} />}
        {view === "Simulator" && <Simulator simulations={simulations} setSimulations={setSimulations} shift={simShift} run={runSimulation} />}

        <section className="connect-strip">
          <div><span>CONNECT YOUR LEAGUE</span><strong>Replace demo data with your actual roster</strong><small>Enter a public league ID to import settings, managers, rosters, and scoring.</small></div>
          <div className="connect-form"><input value={leagueId} onChange={(e) => setLeagueId(e.target.value)} placeholder="League ID" aria-label="League ID" /><button onClick={importLeague} disabled={importState === "loading"}>{importState === "loading" ? "Connecting…" : "Import league"}</button></div>
          {importState === "error" && <p className="form-error">We couldn’t find that league. Confirm the ID and try again.</p>}
          {importState === "success" && <p className="form-success">League connected. Your workspace has been updated.</p>}
        </section>
      </section>

      {selectedPlayer && <PlayerPanel player={selectedPlayer} close={() => setSelectedPlayer(null)} />}
    </main>
  );
}

function CommandCenter({ players, totals, setView, setSelectedPlayer, starterChoice, setStarterChoice }: { players: Player[]; totals: { projection: number; ceiling: number }; setView: (v: View) => void; setSelectedPlayer: (p: Player) => void; starterChoice: string; setStarterChoice: (v: string) => void }) {
  const concern = players.find((p) => p.status !== "Healthy");
  return <div className="page-content">
    <section className="hero"><div><p>FANTASY INTELLIGENCE · LIVE DECISION BOARD</p><h2>Your clearest path to<br /><em>winning Week 8.</em></h2><span>One lineup decision and two waiver opportunities can materially raise your weekly ceiling.</span></div><div className="hero-score"><small>PROJECTED SCORE</small><strong>{totals.projection.toFixed(1)}</strong><span>Ceiling {totals.ceiling.toFixed(1)}</span></div></section>
    <div className="metric-grid"><Metric label="Win probability" value="64%" detail="+7% after lineup optimization" tone="good" /><Metric label="Projected rank" value="3rd" detail="of 12 teams this week" /><Metric label="Playoff odds" value="72%" detail="+4.2% over last week" tone="good" /><Metric label="Roster health" value="86" detail={concern ? `Monitor ${concern.name}` : "No active concerns"} tone="warn" /></div>
    <div className="main-grid"><section className="panel decision-panel"><Header eyebrow="TOP DECISION" title="Set the final FLEX spot" action="Open Start / Sit" onClick={() => setView("Start / Sit")} /><div className="player-versus"><PlayerChoice player={players.find((p) => p.name === "Rome Odunze")!} active={starterChoice === "Rome Odunze"} onClick={() => setStarterChoice("Rome Odunze")} /><div className="versus">VS</div><PlayerChoice player={players.find((p) => p.name === "Emeka Egbuka")!} active={starterChoice === "Emeka Egbuka"} onClick={() => setStarterChoice("Emeka Egbuka")} /></div><div className="recommendation"><b>START {starterChoice.toUpperCase()}</b><p>Higher route certainty and a better projected game environment create the stronger median outcome.</p></div></section>
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
  return <section className="roster-section panel"><header><div><span>{title === "Starters" ? "ACTIVE LINEUP" : "RESERVES"}</span><h3>{title}</h3></div><small>{detail}</small></header><div className="table-panel"><table><thead><tr><th>Player</th><th>Slot</th><th>Matchup</th><th>Floor</th><th>Projection</th><th>Ceiling</th><th>Status</th></tr></thead><tbody>{players.map((player) => <tr key={player.id} onClick={() => setSelectedPlayer(player)}><td><span className={`pos pos-${player.position.toLowerCase()}`}>{player.position}</span><strong>{player.name}</strong><small>{player.team}</small></td><td><span className={player.role === "Bench" ? "roster-slot bench" : "roster-slot"}>{player.role}</span></td><td>{player.opponent}</td><td>{player.floor}</td><td><b>{player.projection}</b></td><td>{player.ceiling}</td><td><Status value={player.status} /></td></tr>)}</tbody></table>{!players.length && <p className="empty-roster">No players are assigned to this section.</p>}</div></section>;
}

function StartSit({ players, choice, setChoice }: { players: Player[]; choice: string; setChoice: (v: string) => void }) { const options = players.filter((p) => ["Rome Odunze", "Emeka Egbuka"].includes(p.name)); return <div className="page-content"><SectionIntro kicker="WEEKLY DECISIONS" title="Make the call with the full range in view" text="Compare role, matchup, floor, median, and ceiling without turning a narrow projection gap into false certainty." /><div className="compare-grid">{options.map((p) => <button key={p.id} className={`compare-card ${choice === p.name ? "selected" : ""}`} onClick={() => setChoice(p.name)}><span className={`pos pos-${p.position.toLowerCase()}`}>{p.position}</span><small>{p.team} · {p.opponent}</small><h3>{p.name}</h3><div className="range-bar"><i style={{ left: `${p.floor * 2.3}%`, width: `${(p.ceiling - p.floor) * 2.3}%` }} /><b style={{ left: `${p.projection * 2.3}%` }} /></div><div className="range-labels"><span>Floor <b>{p.floor}</b></span><span>Projection <b>{p.projection}</b></span><span>Ceiling <b>{p.ceiling}</b></span></div><p>{p.name === "Rome Odunze" ? "More stable route share and a favorable intermediate matchup." : "Stronger explosive-play path, but greater target volatility."}</p><strong className="select-label">{choice === p.name ? "CURRENT STARTER" : "SELECT PLAYER"}</strong></button>)}</div><section className="insight-box"><span>FANTASY HUB VERDICT</span><h3>Start {choice}</h3><p>The model prefers the stronger combination of role certainty and matchup-adjusted median. The alternative remains viable when you need maximum variance.</p></section></div>; }

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

function PlayerPanel({ player, close }: { player: Player; close: () => void }) { return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}><aside className="player-panel"><button className="close" onClick={close}>×</button><span className={`pos pos-${player.position.toLowerCase()}`}>{player.position}</span><small>{player.team} · {player.opponent}</small><h2>{player.name}</h2><Status value={player.status} /><div className="profile-projection"><strong>{player.projection}</strong><span>Week 8 projected points</span></div><div className="profile-grid"><Metric label="Floor" value={String(player.floor)} detail="Conservative outcome" /><Metric label="Ceiling" value={String(player.ceiling)} detail="High-end outcome" /></div><h3>Fantasy outlook</h3><p>Role security, recent usage, and opponent tendencies support a dependable weekly profile. Treat the range as a decision aid rather than a guarantee.</p><button className="primary" onClick={close}>Keep in lineup</button></aside></div>; }

function Metric({ label, value, detail, tone = "" }: { label: string; value: string; detail: string; tone?: string }) { return <article className={`metric ${tone}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>; }
function Header({ eyebrow, title, action, onClick }: { eyebrow: string; title: string; action: string; onClick: () => void }) { return <header className="panel-header"><div><span>{eyebrow}</span><h3>{title}</h3></div><button onClick={onClick}>{action} →</button></header>; }
function SectionIntro({ kicker, title, text }: { kicker: string; title: string; text: string }) { return <header className="section-intro"><span>{kicker}</span><h2>{title}</h2><p>{text}</p></header>; }
function Status({ value }: { value: string }) { return <span className={`status ${value === "Healthy" ? "healthy" : "questionable"}`}>{value}</span>; }
function PlayerChoice({ player, active, onClick }: { player: Player; active: boolean; onClick: () => void }) { return <button className={`player-choice ${active ? "chosen" : ""}`} onClick={onClick}><span className={`pos pos-${player.position.toLowerCase()}`}>{player.position}</span><small>{player.team} · {player.opponent}</small><strong>{player.name}</strong><div><b>{player.projection}</b><span>PROJECTED</span></div></button>; }
function TradeAsset({ name, meta, value }: { name: string; meta: string; value: string }) { return <article className="trade-asset"><span className="pos pos-wr">WR</span><p><strong>{name}</strong><small>{meta}</small></p><b>{value}</b></article>; }
function Scenario({ title, record, odds, text }: { title: string; record: string; odds: string; text: string }) { return <article><span>{title}</span><h3>{record}</h3><strong>{odds}</strong><p>{text}</p></article>; }
