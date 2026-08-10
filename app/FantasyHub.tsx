"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type View = "Command Center" | "Scoreboard" | "NFL Games" | "Dynasty Analytics" | "My Team" | "Team Rankings" | "Player Ranks" | "Start / Sit" | "Waiver Wire" | "Trade Lab" | "Matchups" | "Simulator" | "Manage Leagues";
type Player = { id: string; name: string; position: string; team: string; opponent: string; projection: number; leagueProjection?: number | null; floor: number; ceiling: number; trend: number; status: string; role: string };
type RankedPlayer = Player & { overallRank: number; positionRank: number; tier: 1 | 2 | 3 | 4; outlook: string };
type PlayerWeek = { season: string; week: number; points: number; totalYards: number; touchdowns: number; passYards: number; passTouchdowns: number; interceptions: number; rushAttempts: number; rushYards: number; rushTouchdowns: number; targets: number; receptions: number; receivingYards: number; receivingTouchdowns: number };
type PlayerHistory = { sourceStatus: "available" | "unavailable"; player: { id: string; age?: number; yearsExp?: number; college?: string; height?: string; weight?: string }; seasons: { season: string; games: number; points: number; pointsPerGame: number; positionRank: number | null; yards: number; touchdowns: number; receptions: number }[]; recentWeeks: { week: number; points: number; yards: number; touchdowns: number; targets: number }[]; weeks: PlayerWeek[] };
type TradeStyle = "Aggressive" | "Neutral" | "Strict";
type Theme = "light" | "dark";
type DraftPick = { season: number; round: number; originalRosterId: number; ownerRosterId: number; value: number };
type LeagueTeam = { id: string; ownerId?: string; managerName: string; teamName: string; roster: Player[]; draftCapital?: { score: number; picks: DraftPick[] } };
type LeagueRanking = Player & { overallRank: number; rankingValue: number; age?: number | null; ageAdjustment: number; lineupAdjustment: number };
type WaiverPlayer = LeagueRanking;
type RankingContext = { format: "Dynasty" | "Keeper" | "Redraft"; scoring: string; teams: number; rosterSlots: string[]; positionDemand: Record<string, number>; tePremium: number; passTouchdown: number; interception: number; bonusRuleCount: number; scoringRuleCount: number };
type AccountUser = { displayName: string; email: string };
type SleeperConnection = { sleeperUserId: string; sleeperUsername: string; displayName: string; avatar?: string | null };
type ConnectedLeague = { id: string; name: string; season?: string; teams: number; format: string; scoring: string; rosterId: string; starterCount: number };
type LeagueProvider = "sleeper" | "espn" | "yahoo";
type ManagedLeague = { id: string; provider: LeagueProvider; identifierType: "username" | "league_id"; identifier: string; status: "live" | "saved" | "oauth_required"; updatedAt: string };
type ScoreboardPlayer = { id: string; name: string; position: string; nflTeam: string; points: number; isStarter: boolean; yards: number; touchdowns: number; receptions: number; targets: number };
type ScoreboardTeam = { rosterId: string; managerName: string; teamName: string; points: number; isMine: boolean; topPlayers: ScoreboardPlayer[] };
type ScoreboardData = { league: { name: string; season: string; currentWeek: number }; week: number; updatedAt: string; matchups: { matchupId: number; status: string; teams: ScoreboardTeam[] }[] };
type NflImpactPlayer = { id: string; name: string; position: string; nflTeam: string; side: "You" | "Opponent"; starter: boolean; fantasyPoints: number };
type NflGameData = { league: { name: string; season: string }; week: number; updatedAt: string; fantasyMatchup: { yourPoints: number; opponentPoints: number; opponentName: string; playerCount: number }; games: { id: string; date: string; name: string; status: string; state: string; clock: string; venue: string; broadcast: string; teams: { abbreviation: string; name: string; displayName: string; homeAway: string; score: number; winner: boolean; color: string; logo: string | null; record: string }[]; impactPlayers: NflImpactPlayer[] }[] };
type ScheduleGame = { id: string; week: number; date: string; status: string; broadcast: string; away: { abbreviation: string; name: string }; home: { abbreviation: string; name: string } };
type NflScheduleData = { season: number; currentWeek: number; updatedAt: string; weeks: { week: number; games: ScheduleGame[] }[] };
type SimulationContext = { league: { name: string; season: string; currentWeek: number; totalTeams: number; playoffTeams: number; playoffWeekStart: number; regularSeasonWeeks: number; format: string; starterSlots: string[]; scoringRuleCount: number }; weeks: { week: number; matchups: { teams: string[]; points: number[] }[] }[] };
type SimulationResult = { playoffOdds: number; byeOdds: number; titleOdds: number; medianWins: number; winPercentiles: { label: string; value: number }[]; seed: number; topDrivers: string[]; riskDrivers: string[] };
type TradeAssetValue = { id: string; name: string; position: string; meta: string; value: number };
type TradeSuggestion = { id: string; title: string; receive: TradeAssetValue[]; send: TradeAssetValue[]; yourBenefit: number; partnerBenefit: number; acceptance: number; confidence: number; whyYou: string; whyThem: string };

const nav: { label: View; mark: string }[] = [
  { label: "Command Center", mark: "★" }, { label: "Scoreboard", mark: "▣" }, { label: "NFL Games", mark: "🏈" }, { label: "My Team", mark: "●" },
  { label: "Dynasty Analytics", mark: "◈" },
  { label: "Team Rankings", mark: "↥" }, { label: "Player Ranks", mark: "♛" }, { label: "Start / Sit", mark: "⚡" }, { label: "Waiver Wire", mark: "+" },
  { label: "Trade Lab", mark: "↔" }, { label: "Matchups", mark: "◎" },
  { label: "Simulator", mark: "✦" },
  { label: "Manage Leagues", mark: "⚙" },
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

export default function FantasyHub({ accountUser }: { accountUser: AccountUser | null }) {
  const [view, setView] = useState<View>("Command Center");
  const [players, setPlayers] = useState<Player[]>([]);
  const [leagueId, setLeagueId] = useState("");
  const [leagueName, setLeagueName] = useState("No league selected");
  const [importState, setImportState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [starterChoice, setStarterChoice] = useState("Rome Odunze");
  const [simulations, setSimulations] = useState(10000);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [leagueTeams, setLeagueTeams] = useState<LeagueTeam[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [leagueRankings, setLeagueRankings] = useState<LeagueRanking[]>([]);
  const [rankingContext, setRankingContext] = useState<RankingContext | null>(null);
  const [waiverPlayers, setWaiverPlayers] = useState<WaiverPlayer[]>([]);
  const [leagueStatus, setLeagueStatus] = useState("unknown");
  const [connection, setConnection] = useState<SleeperConnection | null>(null);
  const [availableLeagues, setAvailableLeagues] = useState<ConnectedLeague[]>([]);
  const [managedLeagues, setManagedLeagues] = useState<ManagedLeague[]>([]);
  const [accountLoading, setAccountLoading] = useState(Boolean(accountUser));
  const [accountError, setAccountError] = useState("");
  const [theme, setTheme] = useState<Theme>("light");
  const importRequest = useRef(0);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("fantasy-hub-theme");
    const initialTheme: Theme = savedTheme === "light" || savedTheme === "dark" ? savedTheme : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    const timer = window.setTimeout(() => setTheme(initialTheme), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem("fantasy-hub-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!accountUser) return;
    void (async () => {
      try {
        const response = await fetch("/api/account");
        if (!response.ok) throw new Error("Account unavailable");
        const data = await response.json() as { connection?: SleeperConnection | null };
        setConnection(data.connection ?? null);
        await loadManagedLeagues();
        if (data.connection) await loadLeagues();
        else setView("Manage Leagues");
      } catch {
        setAccountError("We couldn’t load your Fantasy Hub account. Refresh and try again.");
      } finally {
        setAccountLoading(false);
      }
    })();
  }, [accountUser]);

  const totals = useMemo(() => ({
    projection: players.filter((p) => p.role !== "Bench" && p.role !== "IR" && p.role !== "TAXI").reduce((sum, p) => sum + p.projection, 0),
    ceiling: players.filter((p) => p.role !== "Bench" && p.role !== "IR" && p.role !== "TAXI").reduce((sum, p) => sum + p.ceiling, 0),
  }), [players]);

  async function importLeague(idOverride?: string, ownerIdOverride?: string) {
    const requestedLeagueId = idOverride?.trim() || leagueId.trim();
    if (!requestedLeagueId) return;
    const requestNumber = ++importRequest.current;
    setImportState("loading");
    setPlayers([]);
    setLeagueTeams([]);
    setSelectedTeamId("");
    setLeagueRankings([]);
    setRankingContext(null);
    setWaiverPlayers([]);
    setLeagueStatus("unknown");
    setSelectedPlayer(null);
    try {
      const response = await fetch(`/api/league?id=${encodeURIComponent(requestedLeagueId)}`);
      if (!response.ok) throw new Error("League not found");
      const data = await response.json() as { league: { name: string; status?: string }; teams?: LeagueTeam[]; rankings?: LeagueRanking[]; waiverPlayers?: WaiverPlayer[]; rankingContext?: RankingContext };
      if (requestNumber !== importRequest.current) return;
      setLeagueName(data.league.name);
      const importedTeams = data.teams ?? [];
      setLeagueTeams(importedTeams);
      const ownedTeam = ownerIdOverride ? importedTeams.find((team) => team.ownerId === ownerIdOverride) : undefined;
      if (ownedTeam || importedTeams.length === 1) {
        const activeTeam = ownedTeam ?? importedTeams[0];
        setSelectedTeamId(activeTeam.id);
        setPlayers(activeTeam.roster);
      } else {
        setSelectedTeamId("");
      }
      setLeagueRankings(data.rankings ?? []);
      setWaiverPlayers(data.waiverPlayers ?? []);
      setLeagueStatus(data.league.status ?? "unknown");
      setRankingContext(data.rankingContext ?? null);
      setImportState("success");
    } catch {
      if (requestNumber !== importRequest.current) return;
      setImportState("error");
    }
  }

  async function loadLeagues() {
    const response = await fetch("/api/account/leagues");
    if (!response.ok) throw new Error("Leagues unavailable");
    const data = await response.json() as { connection: SleeperConnection; leagues: ConnectedLeague[] };
    setConnection(data.connection);
    setAvailableLeagues(data.leagues);
  }

  async function loadManagedLeagues() {
    const response = await fetch("/api/account/managed-leagues");
    if (!response.ok) throw new Error("Saved leagues unavailable");
    const data = await response.json() as { leagues: ManagedLeague[] };
    setManagedLeagues(data.leagues);
  }

  async function connectSleeper(usernameOverride?: string) {
    const username = usernameOverride?.trim() ?? "";
    if (!username) return false;
    setAccountError("");
    try {
      const response = await fetch("/api/account", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username }) });
      const data = await response.json() as { connection?: SleeperConnection; error?: string };
      if (!response.ok || !data.connection) throw new Error(data.error ?? "Unable to connect account");
      setConnection(data.connection);
      await loadLeagues();
      return true;
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : "Unable to connect account");
      return false;
    }
  }

  async function addManagedLeague(provider: LeagueProvider, identifierType: "username" | "league_id", identifier: string) {
    setAccountError("");
    if (provider === "sleeper" && identifierType === "username") {
      const connected = await connectSleeper(identifier);
      if (!connected) throw new Error("Unable to connect that Sleeper username");
    }
    const response = await fetch("/api/account/managed-leagues", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider, identifierType, identifier }) });
    const data = await response.json() as { league?: ManagedLeague; error?: string };
    if (!response.ok || !data.league) throw new Error(data.error ?? "Unable to save league");
    await loadManagedLeagues();
    if (provider === "sleeper" && identifierType === "league_id") {
      setLeagueId(identifier);
      await importLeague(identifier, connection?.sleeperUserId);
    }
  }

  async function removeManagedLeague(id: string) {
    const response = await fetch(`/api/account/managed-leagues?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) throw new Error("Unable to remove league connection");
    setManagedLeagues((current) => current.filter((league) => league.id !== id));
  }

  async function openConnectedLeague(league: ConnectedLeague) {
    setLeagueId(league.id);
    setLeagueName(league.name);
    if (league.format !== "Dynasty" && view === "Dynasty Analytics") setView("Command Center");
    await importLeague(league.id, connection?.sleeperUserId);
  }

  function selectLeagueTeam(teamId: string) {
    setSelectedTeamId(teamId);
    const team = leagueTeams.find((candidate) => candidate.id === teamId);
    setPlayers(team?.roster ?? []);
    setSelectedPlayer(null);
  }

  const selectedLeagueTeam = leagueTeams.find((team) => team.id === selectedTeamId);
  const selectedConnectedLeague = availableLeagues.find((league) => league.id === leagueId);
  const isDynastyLeague = selectedConnectedLeague?.format === "Dynasty" || rankingContext?.format === "Dynasty";
  const visibleNav = nav.filter((item) => item.label !== "Dynasty Analytics" || isDynastyLeague);
  const rosterReady = players.length > 0;
  const rosterEmptyState = <EmptyRoster leagueSelected={Boolean(leagueId)} loading={importState === "loading"} leagueName={leagueName} />;

  if (!accountUser) return <SignInScreen />;
  if (accountLoading) return <AccountLoading />;
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">FH</span><div><strong>Fantasy Hub</strong><small>Make every week count.</small></div></div>
        <div className="league-card"><span>ACTIVE LEAGUE</span><strong>{leagueName}</strong><small>{selectedLeagueTeam ? `${selectedLeagueTeam.teamName} · ` : ""}PPR · Week 8</small></div>
        <nav aria-label="Fantasy Hub sections">{visibleNav.map((item) => <button key={item.label} className={view === item.label ? "active" : ""} onClick={() => setView(item.label)}><i>{item.mark}</i>{item.label}</button>)}</nav>
        <div className="sidebar-bottom"><button className="theme-toggle" type="button" role="switch" aria-checked={theme === "dark"} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} onClick={() => setTheme((current) => current === "light" ? "dark" : "light")}><span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span><b>{theme === "dark" ? "Light mode" : "Dark mode"}</b><i aria-hidden="true"><em /></i></button><div><span className="live-dot" /> DATA CURRENT</div><small>Lineups lock Sunday · 12:00 PM</small></div>
      </aside>

      <section className="workspace">
        <header className="topbar"><div><p>WEEK 8 · 2026 SEASON</p><h1>{view}</h1></div><div className="top-actions"><button className="ghost" onClick={() => setView("Simulator")}>Roll the season 🎲</button><a className="account-chip" href="/signout-with-chatgpt?return_to=/"><span>{accountUser.displayName.slice(0, 1).toUpperCase()}</span><small>{connection?.displayName ?? accountUser.displayName}<b>Sign out</b></small></a></div></header>

        {view !== "Manage Leagues" && availableLeagues.length > 0 && <section className="league-switcher"><div><span>MY LEAGUES</span><strong>{availableLeagues.length} leagues connected</strong><small>Choose a league and Fantasy Hub will open your roster automatically.</small></div><div className="league-pills">{availableLeagues.map((league) => <button key={league.id} className={leagueId === league.id ? "active" : ""} onClick={() => openConnectedLeague(league)} disabled={importState === "loading"}><b>{league.name}</b><small>{league.season} · {league.teams} teams · {league.format} · {league.scoring}</small></button>)}</div></section>}

        {view !== "Manage Leagues" && leagueTeams.length > 1 && <section className={`team-picker-strip ${selectedTeamId ? "selected" : ""}`}><div><span>{selectedTeamId ? "YOUR TEAM IS ACTIVE" : "ONE MORE STEP"}</span><strong>{selectedLeagueTeam ? selectedLeagueTeam.teamName : "Which team is yours?"}</strong><small>{selectedLeagueTeam ? `Managed by ${selectedLeagueTeam.managerName}. Your roster now powers every dashboard view.` : "Choose your fantasy team so another manager’s roster never replaces yours."}</small></div><label>Fantasy team<select value={selectedTeamId} onChange={(event) => selectLeagueTeam(event.target.value)}><option value="">Choose your team</option>{leagueTeams.map((team) => <option key={team.id} value={team.id}>{team.teamName} · {team.managerName}</option>)}</select></label></section>}

        {view === "Command Center" && (rosterReady ? <CommandCenter players={players} waiverPlayers={waiverPlayers} totals={totals} setView={setView} setSelectedPlayer={setSelectedPlayer} starterChoice={starterChoice} setStarterChoice={setStarterChoice} /> : rosterEmptyState)}
        {view === "Scoreboard" && <Scoreboard leagueId={leagueId} />}
        {view === "NFL Games" && <NflGames leagueId={leagueId} />}
        {view === "Dynasty Analytics" && isDynastyLeague && (rosterReady ? <DynastyAnalytics players={players} rankings={leagueRankings} context={rankingContext} setSelectedPlayer={setSelectedPlayer} /> : rosterEmptyState)}
        {view === "My Team" && (rosterReady ? <MyTeam players={players} setSelectedPlayer={setSelectedPlayer} /> : rosterEmptyState)}
        {view === "Team Rankings" && <TeamRankings teams={leagueTeams} selectedTeamId={selectedTeamId} rankings={leagueRankings} context={rankingContext} setSelectedPlayer={setSelectedPlayer} />}
        {view === "Player Ranks" && <PlayerRanks roster={players} leagueRankings={leagueRankings} context={rankingContext} setSelectedPlayer={setSelectedPlayer} />}
        {view === "Start / Sit" && (rosterReady ? <StartSit players={players} choice={starterChoice} setChoice={setStarterChoice} teamProjection={totals.projection} context={rankingContext} /> : rosterEmptyState)}
        {view === "Waiver Wire" && <WaiverWire key={leagueId || "no-league"} players={waiverPlayers} leagueSelected={Boolean(leagueId)} leagueStatus={leagueStatus} context={rankingContext} setSelectedPlayer={setSelectedPlayer} />}
        {view === "Trade Lab" && <TradeLab key={`${leagueId}-${selectedTeamId}`} teams={leagueTeams} selectedTeamId={selectedTeamId} rankings={leagueRankings} context={rankingContext} />}
        {view === "Matchups" && (rosterReady ? <Matchups players={players} season={selectedConnectedLeague?.season ?? "2026"} /> : rosterEmptyState)}
        {view === "Simulator" && (rosterReady ? <Simulator key={`${leagueId}-${selectedTeamId}`} simulations={simulations} setSimulations={setSimulations} leagueId={leagueId} teams={leagueTeams} selectedTeamId={selectedTeamId} context={rankingContext} /> : rosterEmptyState)}
        {view === "Manage Leagues" && <ManageLeagues connectedLeagues={availableLeagues} managedLeagues={managedLeagues} accountError={accountError} onOpen={async (league) => { setView("Command Center"); await openConnectedLeague(league); }} onAdd={addManagedLeague} onRemove={removeManagedLeague} />}
      </section>

      {selectedPlayer && <PlayerPanel key={selectedPlayer.id} player={selectedPlayer} close={() => setSelectedPlayer(null)} />}
    </main>
  );
}

function SignInScreen() {
  return <main className="auth-shell"><section className="auth-brand"><span className="brand-mark">FH</span><strong>Fantasy Hub</strong><small>Make every week count.</small></section><section className="auth-card"><span>YOUR LEAGUES. ONE HOME.</span><h1>Set smarter lineups.<br /><em>Own every matchup.</em></h1><p>Sign in to save your Fantasy Hub profile, connect your Sleeper username, and open every league from one personalized dashboard.</p><a className="auth-primary" href="/signin-with-chatgpt?return_to=/">Sign in to Fantasy Hub</a><small className="auth-safety">Fantasy Hub never asks for or stores your Sleeper password.</small><div className="auth-features"><b>Command Center</b><b>Player Ranks</b><b>Waiver Wire</b><b>Trade Lab</b></div></section></main>;
}

function AccountLoading() {
  return <main className="auth-shell"><section className="auth-card auth-loading"><span>FANTASY HUB</span><h1>Loading your leagues…</h1><p>Pulling together your saved account and league workspace.</p><i /><i /><i /></section></main>;
}

function EmptyRoster({ leagueSelected, loading, leagueName }: { leagueSelected: boolean; loading: boolean; leagueName: string }) {
  const title = loading ? `Opening ${leagueName}` : leagueSelected ? `${leagueName} has not drafted yet` : "Choose a league to begin";
  const text = loading ? "Fantasy Hub is loading this league’s settings and roster." : leagueSelected ? "This league is connected, but your roster is currently empty. Fantasy Hub will populate these tools after the draft appears in the league data." : "Select one of your leagues above to load its roster, scoring, and lineup settings.";
  return <div className="page-content"><SectionIntro kicker={loading ? "LOADING LEAGUE" : "ROSTER NOT AVAILABLE"} title={title} text={text} /><section className="panel scoreboard-empty">{loading ? "Loading league data…" : leagueSelected ? "No players have been assigned to your roster." : "No league selected."}</section></div>;
}

function ManageLeagues({ connectedLeagues, managedLeagues, accountError, onOpen, onAdd, onRemove }: { connectedLeagues: ConnectedLeague[]; managedLeagues: ManagedLeague[]; accountError: string; onOpen: (league: ConnectedLeague) => Promise<void>; onAdd: (provider: LeagueProvider, identifierType: "username" | "league_id", identifier: string) => Promise<void>; onRemove: (id: string) => Promise<void> }) {
  const [provider, setProvider] = useState<LeagueProvider>("sleeper");
  const [identifierType, setIdentifierType] = useState<"username" | "league_id">("username");
  const [identifier, setIdentifier] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const providers: { id: LeagueProvider; name: string; short: string; description: string }[] = [
    { id: "sleeper", name: "Sleeper", short: "S", description: "Live rosters, scoring, matchups, waivers, and league settings." },
    { id: "espn", name: "ESPN", short: "E", description: "Save a public league ID while the live ESPN connector is prepared." },
    { id: "yahoo", name: "Yahoo", short: "Y!", description: "Save your league reference, then authorize Yahoo when OAuth is available." },
  ];
  const selectedProvider = providers.find((item) => item.id === provider)!;

  async function addLeague() {
    if (!identifier.trim()) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await onAdd(provider, identifierType, identifier.trim());
      setSuccess(provider === "sleeper" ? "Sleeper connected. Your live leagues are ready." : provider === "yahoo" ? "Yahoo reference saved. Live sync will require Yahoo authorization." : "ESPN league reference saved to your account.");
      setIdentifier("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to add league");
    } finally {
      setBusy(false);
    }
  }

  return <div className="page-content manage-leagues">
    <section className="manage-hero"><div><span>YOUR FANTASY UNIVERSE</span><h2>Every league.<br /><em>One command center.</em></h2><p>Connect with a username or add a specific league ID. Each connection is saved only to your Fantasy Hub account.</p></div><div className="manage-count"><strong>{connectedLeagues.length + managedLeagues.filter((item) => item.provider !== "sleeper").length}</strong><span>LEAGUES & ACCOUNTS</span></div></section>
    <section className="provider-grid" aria-label="Fantasy providers">{providers.map((item) => <button key={item.id} className={provider === item.id ? `active provider-${item.id}` : `provider-${item.id}`} onClick={() => { setProvider(item.id); setError(""); setSuccess(""); }}><i>{item.short}</i><span><strong>{item.name}</strong><small>{item.description}</small></span>{provider === item.id && <b>SELECTED</b>}</button>)}</section>
    <section className="manage-connect panel"><div className="panel-header"><div><span>ADD FROM {selectedProvider.name.toUpperCase()}</span><h3>Connect another league</h3></div></div><div className="manage-form"><div className="method-toggle"><button className={identifierType === "username" ? "active" : ""} onClick={() => setIdentifierType("username")}>Username</button><button className={identifierType === "league_id" ? "active" : ""} onClick={() => setIdentifierType("league_id")}>League ID</button></div><label>{identifierType === "username" ? `${selectedProvider.name} username` : `${selectedProvider.name} league ID`}<input value={identifier} onChange={(event) => setIdentifier(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void addLeague(); }} placeholder={identifierType === "username" ? `Enter ${selectedProvider.name} username` : provider === "yahoo" ? "League ID or 461.l.12345" : "Enter numeric league ID"} autoComplete="off" /></label><button className="manage-add" onClick={() => void addLeague()} disabled={busy || !identifier.trim()}>{busy ? "Connecting…" : provider === "sleeper" ? "Connect league" : "Save league"}</button></div>{(error || accountError) && <p className="manage-message error">{error || accountError}</p>}{success && <p className="manage-message success">{success}</p>}<div className={`provider-note ${provider}`}><b>{provider === "sleeper" ? "LIVE CONNECTION" : provider === "yahoo" ? "AUTHORIZATION NEEDED" : "SAVED REFERENCE"}</b><p>{provider === "sleeper" ? "Username finds every team you own. League ID adds one public league directly." : provider === "yahoo" ? "Yahoo requires account authorization before Fantasy Hub can read private rosters or scoring." : "ESPN league IDs are saved now. Live roster sync is not shown until a reliable provider connection is available."}</p></div></section>
    <section className="managed-list panel"><div className="panel-header"><div><span>CONNECTED SOURCES</span><h3>Your leagues and accounts</h3></div><b>{connectedLeagues.length + managedLeagues.length} records</b></div>{connectedLeagues.map((league) => <article key={`live-${league.id}`}><i className="provider-badge sleeper">S</i><p><strong>{league.name}</strong><small>Sleeper · {league.season} · {league.teams} teams · {league.format} · {league.scoring}</small></p><span className="connection-status live">● LIVE</span><button className="open-league" onClick={() => void onOpen(league)}>Open</button></article>)}{managedLeagues.map((league) => <article key={league.id}><i className={`provider-badge ${league.provider}`}>{league.provider === "yahoo" ? "Y!" : league.provider.slice(0, 1).toUpperCase()}</i><p><strong>{league.identifier}</strong><small>{league.provider[0].toUpperCase() + league.provider.slice(1)} · {league.identifierType === "league_id" ? "League ID" : "Username"}</small></p><span className={`connection-status ${league.status}`}>{league.status === "live" ? "CONNECTED" : league.status === "oauth_required" ? "AUTH NEEDED" : "SAVED"}</span><button className="remove-league" onClick={() => void onRemove(league.id)} aria-label={`Remove ${league.identifier}`}>Remove</button></article>)}{!connectedLeagues.length && !managedLeagues.length && <div className="managed-empty"><strong>No leagues added yet</strong><p>Choose a provider above and enter a username or league ID to get started.</p></div>}</section>
  </div>;
}

function Scoreboard({ leagueId }: { leagueId: string }) {
  const [week, setWeek] = useState<number | null>(null);
  const [data, setData] = useState<ScoreboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!leagueId) return;
    let active = true;
    const refresh = async () => {
      setLoading(true);
      try {
        const query = week ? `&week=${week}` : "";
        const response = await fetch(`/api/scoreboard?leagueId=${encodeURIComponent(leagueId)}${query}`);
        const payload = await response.json() as ScoreboardData & { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Scores unavailable");
        if (!active) return;
        setData(payload);
        setWeek((current) => current ?? payload.week);
        setError("");
      } catch (requestError) {
        if (active) setError(requestError instanceof Error ? requestError.message : "Scores unavailable");
      } finally {
        if (active) setLoading(false);
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 30000);
    return () => { active = false; window.clearInterval(timer); };
  }, [leagueId, week]);

  if (!leagueId) return <div className="page-content"><SectionIntro kicker="WEEKLY SCOREBOARD" title="Choose a league to see every matchup" text="Select one of your connected leagues above and the live scoreboard will identify your matchup automatically." /><section className="panel scoreboard-empty">No league selected.</section></div>;
  return <div className="page-content"><section className="scoreboard-head"><div><span>WEEKLY SCOREBOARD</span><h2>{data?.league.name ?? "Loading league scores…"}</h2><p>Scores and player stat lines refresh automatically every 30 seconds.</p></div><label>Week<select value={week ?? ""} onChange={(event) => setWeek(Number(event.target.value))}>{Array.from({ length: 18 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>Week {value}</option>)}</select></label><div className="live-refresh"><i />{loading ? "Refreshing" : `Updated ${data ? new Date(data.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—"}`}</div></section>{error && <section className="scoreboard-error">{error}</section>}<div className="scoreboard-grid">{data?.matchups.map((matchup) => { const away = matchup.teams[0]; const home = matchup.teams[1]; const leader = home && away ? (away.points > home.points ? away.rosterId : home.rosterId) : ""; return <article className={`score-game ${matchup.teams.some((team) => team.isMine) ? "my-game" : ""}`} key={matchup.matchupId}><header><span className={matchup.status === "Live" ? "game-live" : ""}>{matchup.status === "Live" ? "● LIVE" : matchup.status}</span><b>{matchup.teams.some((team) => team.isMine) ? "YOUR MATCHUP" : `MATCHUP ${matchup.matchupId}`}</b></header><div className="score-bug">{[away, home].filter(Boolean).map((team) => <div className={team.isMine ? "mine" : ""} key={team.rosterId}><span>{team.teamName.slice(0, 3).toUpperCase()}</span><p><strong>{team.teamName}</strong><small>{team.managerName}{team.isMine ? " · YOU" : ""}</small></p><b>{team.points.toFixed(2)}</b>{leader === team.rosterId && <i>▲</i>}</div>)}</div><div className="game-stats">{[away, home].filter(Boolean).map((team) => <section key={team.rosterId}><h4>{team.teamName} leaders</h4>{team.topPlayers.slice(0, 3).map((player) => <div key={player.id}><span className={`pos pos-${player.position.toLowerCase()}`}>{player.position}</span><p><strong>{player.name}</strong><small>{player.nflTeam} · {player.isStarter ? "Starter" : "Bench"}</small></p><b>{player.points.toFixed(1)}<small>PTS</small></b><em>{player.yards} YDS{player.touchdowns ? ` · ${player.touchdowns} TD` : ""}{player.targets ? ` · ${player.receptions}/${player.targets} REC` : ""}</em></div>)}</section>)}</div></article>; })}</div>{data && !data.matchups.length && <section className="panel scoreboard-empty">No matchups have been posted for Week {data.week}.</section>}</div>;
}

function NflGames({ leagueId }: { leagueId: string }) {
  const [week, setWeek] = useState<number | null>(null);
  const [data, setData] = useState<NflGameData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!leagueId) return;
    let active = true;
    const refresh = async () => {
      setLoading(true);
      try {
        const query = week ? `&week=${week}` : "";
        const response = await fetch(`/api/nfl-games?leagueId=${encodeURIComponent(leagueId)}${query}`);
        const payload = await response.json() as NflGameData & { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "NFL games unavailable");
        if (!active) return;
        setData(payload);
        setWeek((current) => current ?? payload.week);
        setError("");
      } catch (requestError) {
        if (active) setError(requestError instanceof Error ? requestError.message : "NFL games unavailable");
      } finally {
        if (active) setLoading(false);
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 30000);
    return () => { active = false; window.clearInterval(timer); };
  }, [leagueId, week]);

  if (!leagueId) return <div className="page-content"><SectionIntro kicker="NFL GAME HUB" title="Choose a league to connect Sunday to your matchup" text="Select a league above and Fantasy Hub will highlight every NFL game containing one of your players or your opponent’s players." /><section className="panel scoreboard-empty">No league selected.</section></div>;
  return <div className="page-content nfl-games-page"><section className="nfl-games-head"><div><span>NFL GAME HUB</span><h2>Every game. Your matchup in focus.</h2><p>Live NFL scores refresh every 30 seconds. Matchup players are attached to their real-world games.</p></div><label>Week<select value={week ?? ""} onChange={(event) => setWeek(Number(event.target.value))}>{Array.from({ length: 18 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>Week {value}</option>)}</select></label><div className="live-refresh"><i />{loading ? "Refreshing" : `Updated ${data ? new Date(data.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—"}`}</div></section>{data && <section className="fantasy-score-ribbon"><span>YOUR FANTASY MATCHUP</span><strong>You {data.fantasyMatchup.yourPoints.toFixed(2)}</strong><i>vs</i><strong>{data.fantasyMatchup.opponentName} {data.fantasyMatchup.opponentPoints.toFixed(2)}</strong><small>{data.fantasyMatchup.playerCount} players mapped to NFL games</small></section>}{error && <section className="scoreboard-error">{error}</section>}<div className="nfl-game-grid">{data?.games.map((game) => <article className={`nfl-game-card ${game.impactPlayers.length ? "has-impact" : ""}`} key={game.id}><header><div><span className={game.state === "in" ? "game-live" : ""}>{game.state === "in" ? "● LIVE" : game.status}</span>{game.clock && <b>{game.clock}</b>}</div><small>{game.state === "pre" ? new Date(game.date).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" }) : game.broadcast || game.venue}</small>{game.impactPlayers.length > 0 && <em>{game.impactPlayers.length} MATCHUP PLAYERS</em>}</header><div className="nfl-score-bug">{game.teams.map((team) => <div key={team.abbreviation}><span style={{ backgroundColor: `#${team.color}` }}>{team.abbreviation}</span><p><strong>{team.displayName}</strong><small>{team.record}{team.homeAway === "home" ? " · HOME" : ""}</small></p><b>{team.score}</b>{team.winner && <i>▲</i>}</div>)}</div>{game.impactPlayers.length > 0 ? <section className="impact-roster"><h4>Players in your fantasy matchup</h4>{game.impactPlayers.map((player) => <div className={player.side === "You" ? "your-player" : "opponent-player"} key={`${player.side}-${player.id}`}><span className={`pos pos-${player.position.toLowerCase()}`}>{player.position}</span><p><strong>{player.name}</strong><small>{player.nflTeam} · {player.starter ? "Starter" : "Bench"}</small></p><em>{player.side}</em><b>{player.fantasyPoints.toFixed(1)}<small>PTS</small></b></div>)}</section> : <p className="no-impact">No players from your current fantasy matchup are involved in this game.</p>}</article>)}</div>{data && !data.games.length && <section className="panel scoreboard-empty">No NFL games are scheduled for Week {data.week}.</section>}</div>;
}

const dynastyCurves: Record<string, { peakEnd: number; annualDecline: number }> = {
  QB: { peakEnd: 34, annualDecline: 1.5 }, RB: { peakEnd: 27, annualDecline: 4.2 }, WR: { peakEnd: 30, annualDecline: 2.6 }, TE: { peakEnd: 31, annualDecline: 2.1 }, K: { peakEnd: 34, annualDecline: 1.4 }, DEF: { peakEnd: 99, annualDecline: 0 },
};

function DynastyAnalytics({ players, rankings, context, setSelectedPlayer }: { players: Player[]; rankings: LeagueRanking[]; context: RankingContext | null; setSelectedPlayer: (player: Player) => void }) {
  const rosterIds = new Set(players.map((player) => player.id));
  const positionRanks = new Map<string, number>();
  const playerPositionRanks = new Map<string, number>();
  [...rankings].sort((a, b) => a.overallRank - b.overallRank).forEach((player) => {
    const positionRank = (positionRanks.get(player.position) ?? 0) + 1;
    positionRanks.set(player.position, positionRank);
    playerPositionRanks.set(player.id, positionRank);
  });
  const assets = rankings.filter((player) => rosterIds.has(player.id) && player.age).map((player) => {
    const curve = dynastyCurves[player.position] ?? { peakEnd: 29, annualDecline: 2.5 };
    const yearsToCliff = curve.peakEnd - (player.age ?? curve.peakEnd);
    const phase = yearsToCliff >= 3 ? "Development" : yearsToCliff >= 0 ? "Prime" : "Cliff watch";
    return { ...player, curve, yearsToCliff, phase, positionRank: playerPositionRanks.get(player.id) ?? null };
  });
  const starters = assets.filter((player) => players.find((rosterPlayer) => rosterPlayer.id === player.id)?.role !== "Bench");
  const averageAge = assets.length ? assets.reduce((sum, player) => sum + (player.age ?? 0), 0) / assets.length : 0;
  const cliffWatch = assets.filter((player) => player.yearsToCliff <= 1 && player.position !== "K" && player.position !== "DEF").sort((a, b) => a.yearsToCliff - b.yearsToCliff || a.overallRank - b.overallRank);
  const youngCore = assets.filter((player) => player.yearsToCliff >= 3 && player.overallRank <= (context?.teams ?? 12) * 8).sort((a, b) => a.overallRank - b.overallRank);
  const positionCounts = assets.reduce<Record<string, number>>((counts, player) => ({ ...counts, [player.position]: (counts[player.position] ?? 0) + 1 }), {});
  const baseStrength = starters.length ? starters.reduce((sum, player) => sum + Math.max(20, 105 - player.overallRank * .7), 0) / starters.length : 50;
  const outlook = [0, 1, 2, 3].map((year) => {
    const score = starters.length ? starters.reduce((sum, player) => {
      const futureAge = (player.age ?? player.curve.peakEnd) + year;
      const decline = Math.max(0, futureAge - player.curve.peakEnd) * player.curve.annualDecline;
      const development = futureAge <= player.curve.peakEnd - 3 ? Math.min(5, year * 1.3) : 0;
      return sum + Math.max(15, 105 - player.overallRank * .7 - decline + development);
    }, 0) / starters.length : 50;
    return { year: new Date().getUTCFullYear() + year, score: Math.round(Math.min(99, Math.max(20, score))) };
  });
  const trajectory = outlook[3].score - outlook[0].score;
  const strategy = baseStrength >= 72 && trajectory >= -7 ? "Compete while protecting the next window" : baseStrength >= 62 ? "Re-tool without stripping the core" : "Accumulate ascending assets and future flexibility";

  if (!assets.length) return <div className="page-content"><SectionIntro kicker="DYNASTY ANALYTICS" title="Your long-term roster model is loading" text="Reopen this dynasty league to refresh player ages, values, and roster ownership." /><section className="panel scoreboard-empty">No dynasty player-age sample is available yet.</section></div>;
  return <div className="page-content dynasty-page"><section className="dynasty-hero"><div><span>DYNASTY COMMAND CENTER</span><h2>{strategy}</h2><p>Age curves, league-adjusted player value, positional scarcity, lineup role, and multi-year trajectory shape this roster plan.</p></div><div className="window-score"><small>WINDOW SCORE</small><strong>{Math.round(baseStrength)}</strong><span>{trajectory >= 0 ? "+" : ""}{trajectory} over three years</span></div></section><div className="dynasty-metrics"><Metric label="Roster age" value={averageAge.toFixed(1)} detail={`${assets.length} age-qualified assets`} /><Metric label="Young core" value={String(youngCore.length)} detail="High-value assets 3+ years from cliff" tone="good" /><Metric label="Cliff watch" value={String(cliffWatch.length)} detail="At or within one year of peak end" tone={cliffWatch.length ? "warn" : "good"} /><Metric label="Three-year trend" value={`${trajectory >= 0 ? "+" : ""}${trajectory}`} detail="Modeled starter-window movement" tone={trajectory >= 0 ? "good" : "warn"} /></div><div className="dynasty-main"><section className="panel dynasty-trajectory"><Header eyebrow="COMPETITIVE WINDOW" title="Four-year roster trajectory" /><div className="window-bars">{outlook.map((season, index) => <div key={season.year}><span>{season.score}</span><i style={{ height: `${season.score}%` }} className={season.score >= 72 ? "open" : season.score >= 60 ? "fringe" : "build"} /><b>{season.year}</b><small>{index === 0 ? "Now" : index === 3 ? "3-year" : `Year ${index}`}</small></div>)}</div><p>The window score blends starter quality with position-specific development and decline. It is a planning range, not a guarantee of standings.</p></section><section className="panel dynasty-allocation"><Header eyebrow="ASSET ALLOCATION" title="Roster timeline by position" /><div className="allocation-grid">{["QB","RB","WR","TE"].map((position) => { const room = assets.filter((player) => player.position === position); const prime = room.filter((player) => player.phase === "Prime").length; const development = room.filter((player) => player.phase === "Development").length; const cliff = room.filter((player) => player.phase === "Cliff watch").length; return <article key={position}><strong>{position}</strong><span>{positionCounts[position] ?? 0} assets</span><div><i className="develop" style={{ width: `${room.length ? development / room.length * 100 : 0}%` }} /><i className="prime" style={{ width: `${room.length ? prime / room.length * 100 : 0}%` }} /><i className="cliff" style={{ width: `${room.length ? cliff / room.length * 100 : 0}%` }} /></div><small>{development} developing · {prime} prime · {cliff} cliff</small></article>; })}</div></section></div><div className="dynasty-lists"><section className="panel"><Header eyebrow="AGE CLIFF" title="Succession-plan watchlist" /><p className="model-caveat">A cliff flag does not mean “sell.” It signals rising downside and a need to preserve options before urgency reduces leverage.</p><div className="dynasty-player-list">{cliffWatch.slice(0, 6).map((player) => <button key={player.id} onClick={() => setSelectedPlayer(player)}><span className={`pos pos-${player.position.toLowerCase()}`}>{player.position}</span><p><strong>{player.name}</strong><small>Age {player.age} · {player.yearsToCliff < 0 ? `${Math.abs(player.yearsToCliff)} past peak end` : player.yearsToCliff === 0 ? "At modeled peak end" : `${player.yearsToCliff} year to peak end`}</small></p><b>#{player.overallRank}<small>League rank</small></b><em className={player.yearsToCliff < 0 ? "danger" : "watch"}>{player.yearsToCliff < 0 ? "Succession now" : "Prepare"}</em></button>)}{!cliffWatch.length && <p className="dynasty-empty">No core skill-position assets are inside the immediate cliff window.</p>}</div></section><section className="panel"><Header eyebrow="CORE ASSETS" title="Build-around timeline" /><p className="model-caveat">Young age alone is not value. Positional rank shows how each asset compares with players at the same position under this league’s settings.</p><div className="dynasty-player-list">{youngCore.slice(0, 6).map((player) => <button key={player.id} onClick={() => setSelectedPlayer(player)}><span className={`pos pos-${player.position.toLowerCase()}`}>{player.position}</span><p><strong>{player.name}</strong><small>Age {player.age} · {player.yearsToCliff} years to peak end</small></p><b>#{player.positionRank ?? "—"}<small>{player.position} rank · Overall #{player.overallRank}</small></b><em className="core">Build around</em></button>)}{!youngCore.length && <p className="dynasty-empty">No high-confidence young core has emerged from the current roster sample.</p>}</div></section></div><section className="panel dynasty-plan"><Header eyebrow="GM HUB PLAYBOOK" title="Three dynasty management priorities" /><div>{buildDynastyPriorities({ cliffWatch, youngCore, trajectory, positionCounts }).map((priority, index) => <article key={priority.title}><b>0{index + 1}</b><span><strong>{priority.title}</strong><p>{priority.detail}</p></span><em>{priority.horizon}</em></article>)}</div></section></div>;
}

function buildDynastyPriorities({ cliffWatch, youngCore, trajectory, positionCounts }: { cliffWatch: (LeagueRanking & { yearsToCliff: number })[]; youngCore: LeagueRanking[]; trajectory: number; positionCounts: Record<string, number> }) {
  const firstCliff = cliffWatch[0];
  const firstCore = youngCore[0];
  return [
    firstCliff ? { title: `Create optionality behind ${firstCliff.name}`, detail: `${firstCliff.position} decline risk typically accelerates after this modeled window. Add a developmental alternative or test the market without forcing a sale below value.`, horizon: firstCliff.yearsToCliff < 0 ? "Now" : "This season" } : { title: "Preserve the clean age curve", detail: "No immediate cliff concentration is present. Avoid replacing useful prime production simply to become younger.", horizon: "Ongoing" },
    firstCore ? { title: `Build the next window around ${firstCore.name}`, detail: `The roster’s strongest combination of league-adjusted value and runway should anchor multi-year trade decisions. Avoid exchanging that runway for marginal weekly gains.`, horizon: "2–3 years" } : { title: "Acquire one foundational young asset", detail: "The roster lacks a clear high-value player with three or more seasons of modeled runway. Prioritize quality over collecting low-upside youth.", horizon: "Next market" },
    trajectory < -5 ? { title: "Reduce synchronized decline risk", detail: `The starter window falls ${Math.abs(trajectory)} points over three years. Stagger veteran exits so several positions do not lose value in the same offseason.`, horizon: "Before decline" } : { title: "Use depth to extend the competitive window", detail: `The three-year window is stable. Convert excess concentration${(positionCounts.WR ?? 0) >= 6 ? " at wide receiver" : " in deep rooms"} into scarcer starting value or future flexibility.`, horizon: "Trade window" },
  ];
}

function startSitDecision(players: Player[]) {
  const starters = players.filter((player) => player.role !== "Bench" && player.role !== "IR" && player.role !== "TAXI" && !["K", "DEF"].includes(player.position));
  const bench = players.filter((player) => player.role === "Bench" && player.projection >= 2 && !["Out", "IR", "Suspended"].includes(player.status));
  const eligible = (player: Player, slot: string) => {
    if (slot === "QB") return player.position === "QB";
    if (slot === "RB") return player.position === "RB";
    if (slot === "WR") return player.position === "WR";
    if (slot === "TE") return player.position === "TE";
    if (slot.includes("SUPER") || slot.includes("QB_FLEX")) return ["QB", "RB", "WR", "TE"].includes(player.position);
    if (slot.includes("FLEX")) return ["RB", "WR", "TE"].includes(player.position);
    return player.position === slot;
  };
  return starters.flatMap((starter) => bench.filter((candidate) => eligible(candidate, starter.role) && candidate.projection >= Math.max(2, starter.projection * .55)).map((candidate) => ({ starter, candidate, gap: Math.abs(starter.projection - candidate.projection) }))).sort((a, b) => a.gap - b.gap || b.candidate.projection - a.candidate.projection)[0] ?? null;
}

function CommandCenter({ players, waiverPlayers, totals, setView, setSelectedPlayer, starterChoice, setStarterChoice }: { players: Player[]; waiverPlayers: WaiverPlayer[]; totals: { projection: number; ceiling: number }; setView: (v: View) => void; setSelectedPlayer: (p: Player) => void; starterChoice: string; setStarterChoice: (v: string) => void }) {
  const concern = players.find((p) => p.status !== "Healthy");
  const decision = startSitDecision(players);
  const primaryDecision = decision?.starter;
  const secondaryDecision = decision?.candidate;
  const activeStarter = primaryDecision && secondaryDecision && [primaryDecision.name, secondaryDecision.name].includes(starterChoice) ? starterChoice : primaryDecision?.name ?? "";
  return <div className="page-content">
    <section className="hero"><div><p>LINEUP LOCK · GAME DAY HQ</p><h2>Let’s go win<br /><em>Week 8.</em></h2><span>Your roster is in the mix. One smart FLEX call and an early waiver swing can turn a good week into a statement win.</span><div className="game-day-pills"><b>🔥 3-week heater</b><b>⚡ 2 lineup edges</b><b>🎯 64% win odds</b></div></div><div className="hero-score"><small>YOU’RE PROJECTED FOR</small><strong>{totals.projection.toFixed(1)}</strong><span>Ceiling {totals.ceiling.toFixed(1)} · Let it fly</span></div></section>
    <div className="metric-grid"><Metric label="Win probability" value="64%" detail="+7% after lineup optimization" tone="good" /><Metric label="Projected rank" value="3rd" detail="of 12 teams this week" /><Metric label="Playoff odds" value="72%" detail="+4.2% over last week" tone="good" /><Metric label="Roster health" value="86" detail={concern ? `Monitor ${concern.name}` : "No active concerns"} tone="warn" /></div>
    <div className="main-grid"><section className="panel decision-panel"><Header eyebrow="TOP DECISION" title={decision ? `Review your ${primaryDecision!.role} slot` : "Your current starters are clear"} action="Open Start / Sit" onClick={() => setView("Start / Sit")} />{primaryDecision && secondaryDecision ? <><div className="player-versus"><PlayerChoice player={primaryDecision} active={activeStarter === primaryDecision.name} onClick={() => setStarterChoice(primaryDecision.name)} /><div className="versus">VS</div><PlayerChoice player={secondaryDecision} active={activeStarter === secondaryDecision.name} onClick={() => setStarterChoice(secondaryDecision.name)} /></div><div className="recommendation"><b>START {activeStarter.toUpperCase()}</b><p>Your current starter is compared only with a position-eligible bench player close enough to be a realistic lineup alternative.</p></div></> : <div className="decision-empty"><strong>No legitimate starter challenge right now</strong><p>No eligible bench player is within the consideration threshold of a current starter.</p></div>}</section>
      <section className="panel"><Header eyebrow="LINEUP PULSE" title="Your core starters" action="View team" onClick={() => setView("My Team")} /><div className="player-list">{players.slice(0, 4).map((p) => <button key={p.id} onClick={() => setSelectedPlayer(p)}><span className={`pos pos-${p.position.toLowerCase()}`}>{p.position}</span><div><strong>{p.name}</strong><small>{p.team} · {p.opponent}</small></div><div className="points"><strong>{p.projection}</strong><small>PTS</small></div></button>)}</div></section>
    </div>
    <div className="lower-grid"><section className="panel"><Header eyebrow="WAIVER PRIORITY" title="Move before your league does" action="See all" onClick={() => setView("Waiver Wire")} /><div className="waiver-preview">{waiverPlayers.slice(0, 2).map((player, i) => <div key={player.id}><b>0{i + 1}</b><span className={`pos pos-${player.position.toLowerCase()}`}>{player.position}</span><p><strong>{player.name}</strong><small>{player.team} · Available in this league</small></p><em>{waiverBid(player, i)}</em></div>)}{!waiverPlayers.length && <p className="waiver-empty">No available-player recommendations yet.</p>}</div></section>
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

function TeamRankings({ teams, selectedTeamId, rankings, context, setSelectedPlayer }: { teams: LeagueTeam[]; selectedTeamId: string; rankings: LeagueRanking[]; context: RankingContext | null; setSelectedPlayer: (player: Player) => void }) {
  const rankingById = new Map(rankings.map((player) => [player.id, player]));
  const isDynasty = context?.format === "Dynasty";
  const positions = ["QB", "RB", "WR", "TE"];
  const slotCounts = (context?.rosterSlots ?? []).reduce<Record<string, number>>((counts, slot) => ({ ...counts, [slot]: (counts[slot] ?? 0) + 1 }), {});
  const playerValue = (player: Player) => {
    const rank = rankingById.get(player.id)?.overallRank;
    return rank ? Math.max(24, 106 - Math.log2(rank + 1) * 10.5) : Math.min(88, player.projection * 3.3);
  };
  const roomNeed = (position: string) => Math.max(1, slotCounts[position] ?? (position === "RB" || position === "WR" ? 2 : 1));
  const rawTeams = teams.map((team) => {
    const roomScores = Object.fromEntries(positions.map((position) => {
      const values = team.roster.filter((player) => player.position === position).map(playerValue).sort((a, b) => b - a);
      const count = roomNeed(position);
      const core = values.slice(0, count).reduce((sum, value) => sum + value, 0) / count;
      const depth = values.slice(count, count + 2).reduce((sum, value) => sum + value, 0) / Math.max(1, Math.min(2, values.length - count));
      return [position, Number((core * .82 + depth * .18).toFixed(1))];
    }));
    const starterValues = team.roster.filter((player) => player.role !== "Bench").map(playerValue);
    const starterScore = starterValues.reduce((sum, value) => sum + value, 0) / Math.max(1, starterValues.length);
    const depthValues = team.roster.filter((player) => player.role === "Bench").map(playerValue).sort((a, b) => b - a).slice(0, 5);
    const depthScore = depthValues.reduce((sum, value) => sum + value, 0) / Math.max(1, depthValues.length);
    return { ...team, roomScores, starterScore, depthScore, draftScore: team.draftCapital?.score ?? 0 };
  });
  const maxDraftScore = Math.max(1, ...rawTeams.map((team) => team.draftScore));
  const scoredTeams = rawTeams.map((team) => ({ ...team, overallScore: Number((team.starterScore * (isDynasty ? .62 : .76) + team.depthScore * (isDynasty ? .18 : .24) + (isDynasty ? team.draftScore / maxDraftScore * 100 * .2 : 0)).toFixed(1)) })).sort((a, b) => b.overallScore - a.overallScore);
  const overallRanks = new Map(scoredTeams.map((team, index) => [team.id, index + 1]));
  const roomRanks = Object.fromEntries(positions.map((position) => [position, new Map([...scoredTeams].sort((a, b) => b.roomScores[position] - a.roomScores[position]).map((team, index) => [team.id, index + 1]))])) as Record<string, Map<string, number>>;
  const draftRanks = new Map([...scoredTeams].sort((a, b) => b.draftScore - a.draftScore).map((team, index) => [team.id, index + 1]));
  const myTeam = scoredTeams.find((team) => team.id === selectedTeamId);
  const strongestPosition = myTeam ? [...positions].sort((a, b) => (roomRanks[a].get(myTeam.id) ?? 99) - (roomRanks[b].get(myTeam.id) ?? 99))[0] : "—";
  const weakestPosition = myTeam ? [...positions].sort((a, b) => (roomRanks[b].get(myTeam.id) ?? 0) - (roomRanks[a].get(myTeam.id) ?? 0))[0] : "—";

  if (!teams.length) return <div className="page-content"><SectionIntro kicker="LEAGUE POWER RANKINGS" title="Choose a league to rank every roster" text="Team and position-room rankings appear after Fantasy Hub imports all league rosters." /><section className="panel scoreboard-empty">No league selected.</section></div>;
  return <div className="page-content team-rankings-page"><SectionIntro kicker="LEAGUE POWER RANKINGS" title="See where every roster has an edge" text={`Overall rank blends league-adjusted starter value and depth${isDynasty ? ", with 20% allocated to discounted three-year rookie draft capital" : " using this league’s lineup and scoring settings"}. Position ranks compare the usable core and immediate depth in each room.`} /><div className="team-rank-summary"><Metric label="Your overall rank" value={`#${overallRanks.get(selectedTeamId) ?? "—"}`} detail={`of ${teams.length} league teams`} tone={(overallRanks.get(selectedTeamId) ?? 99) <= 3 ? "good" : "warn"} /><Metric label="Strongest room" value={strongestPosition} detail={myTeam ? `#${roomRanks[strongestPosition]?.get(myTeam.id) ?? "—"} in your league` : "Select your roster"} tone="good" /><Metric label="Weakest room" value={weakestPosition} detail={myTeam ? `#${roomRanks[weakestPosition]?.get(myTeam.id) ?? "—"} in your league` : "Select your roster"} tone="warn" />{isDynasty && <Metric label="Draft capital" value={`#${draftRanks.get(selectedTeamId) ?? "—"}`} detail={`${myTeam?.draftCapital?.picks.length ?? 0} picks across three classes`} />}</div><section className="panel team-rank-table"><div className={`team-rank-row team-rank-head ${isDynasty ? "dynasty" : ""}`}><span>Rank</span><span>Team</span><span>Overall</span>{positions.map((position) => <span key={position}>{position}</span>)}{isDynasty && <span>Draft capital</span>}<span>Core assets</span></div>{scoredTeams.map((team) => { const coreAssets = team.roster.map((player) => rankingById.get(player.id)).filter((player): player is LeagueRanking => Boolean(player)).sort((a, b) => a.overallRank - b.overallRank).slice(0, 3); const firstRounders = team.draftCapital?.picks.filter((pick) => pick.round === 1).length ?? 0; const secondRounders = team.draftCapital?.picks.filter((pick) => pick.round === 2).length ?? 0; return <article className={`team-rank-row ${isDynasty ? "dynasty" : ""} ${team.id === selectedTeamId ? "your-team" : ""}`} key={team.id}><b className="overall-place">#{overallRanks.get(team.id)}</b><div className="rank-team-name"><strong>{team.teamName}</strong><small>{team.managerName}{team.id === selectedTeamId ? " · YOUR TEAM" : ""}</small></div><strong className="team-score">{team.overallScore}</strong>{positions.map((position) => <div className="room-rank" key={position}><b>#{roomRanks[position].get(team.id)}</b><small>{team.roomScores[position].toFixed(0)}</small></div>)}{isDynasty && <div className="draft-rank"><b>#{draftRanks.get(team.id)}</b><small>{firstRounders} 1sts · {secondRounders} 2nds</small></div>}<div className="core-assets">{coreAssets.map((player) => <button key={player.id} onClick={() => setSelectedPlayer(player)}><span className={`pos pos-${player.position.toLowerCase()}`}>{player.position}</span>{player.name}</button>)}</div></article>; })}</section>{isDynasty && <section className="panel draft-capital-explainer"><div><span>DYNASTY DRAFT CAPITAL</span><h3>Future picks are valued by round and time</h3><p>Each roster begins with its original picks. Traded-pick ownership then moves those assets to the current owner. Earlier rounds carry more value, and picks farther into the future receive a modest discount.</p></div><div><b>1st</b><span>100</span><b>2nd</b><span>65</span><b>3rd</b><span>40</span><b>Future year</b><span>86% carry</span></div></section>}</div>;
}

function PlayerRanks({ roster, leagueRankings, context, setSelectedPlayer }: { roster: Player[]; leagueRankings: LeagueRanking[]; context: RankingContext | null; setSelectedPlayer: (player: Player) => void }) {
  const [position, setPosition] = useState("ALL");
  const [query, setQuery] = useState("");
  const rosterNames = new Set(roster.map((player) => player.name.toLowerCase()));
  const teamCount = context?.teams ?? 12;
  const positionRanks = new Map<string, number>();
  const personalizedPool: RankedPlayer[] = leagueRankings.map((player) => {
    const positionRank = (positionRanks.get(player.position) ?? 0) + 1;
    positionRanks.set(player.position, positionRank);
    const tier: 1 | 2 | 3 | 4 = player.overallRank <= teamCount ? 1 : player.overallRank <= teamCount * 3 ? 2 : player.overallRank <= teamCount * 8 ? 3 : 4;
    const ageNote = context?.format === "Dynasty" && player.age ? `${player.age}-year-old ${player.ageAdjustment >= 0 ? "timeline boost" : "age adjustment"}` : `${context?.format ?? "Redraft"} horizon`;
    const lineupNote = player.lineupAdjustment >= 3 ? "high lineup demand" : player.lineupAdjustment <= -1 ? "lower positional demand" : "balanced positional demand";
    return { ...player, positionRank, tier, outlook: `${ageNote}; ${lineupNote} in this league.` };
  });
  const pool = personalizedPool.length ? personalizedPool : rankedPlayers;
  const filtered = pool.filter((player) => (position === "ALL" || player.position === position) && player.name.toLowerCase().includes(query.trim().toLowerCase()));
  const tiers = [1, 2, 3, 4] as const;
  const tierLabels = { 1: "Elite difference-makers", 2: "Weekly advantages", 3: "Strong starters", 4: "Depth and emerging value" };
  return <div className="page-content"><SectionIntro kicker="PLAYER RANKINGS" title="Rank the player pool for your league" text={context ? `Calibrated for ${context.teams}-team ${context.format.toLowerCase()}, ${context.scoring}, ${context.passTouchdown}-point passing touchdowns, and your exact starting lineup.` : "Import a league to personalize every rank for scoring, format, lineup demand, and positional scarcity."} />{context && <section className="ranking-context"><span><b>{context.format}</b> roster horizon</span><span><b>{context.scoring}</b> reception scoring</span><span><b>{context.rosterSlots.filter((slot) => slot !== "BN").length}</b> starter slots</span><span><b>{context.positionDemand.QB > 1.4 ? "Superflex / 2QB" : "1QB"}</b> quarterback value</span>{context.tePremium > 0 && <span><b>+{context.tePremium} TE PPR</b> premium active</span>}</section>}<section className="rank-controls panel"><div className="position-filters" role="group" aria-label="Filter rankings by position">{["ALL","QB","RB","WR","TE","K","DEF"].map((value) => <button key={value} className={position === value ? "active" : ""} onClick={() => setPosition(value)}>{value}</button>)}</div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search all ranked players" aria-label="Search player rankings" /><span>{filtered.length} players</span></section><div className="tier-list">{tiers.map((tier) => { const tierPlayers = filtered.filter((player) => player.tier === tier); if (!tierPlayers.length) return null; return <section className={`tier-section tier-${tier}`} key={tier}><header><div><span>TIER {tier}</span><h3>{tierLabels[tier]}</h3></div><small>{tierPlayers.length} players</small></header><div className="rank-table"><div className="rank-row rank-head"><span>Rank</span><span>Player</span><span>Pos.</span><span>League projection</span><span>Range</span><span>Why here</span></div>{tierPlayers.map((player) => { const onRoster = rosterNames.has(player.name.toLowerCase()); return <button className={`rank-row ${onRoster ? "on-roster" : ""}`} key={`${player.name}-${player.team}`} onClick={() => setSelectedPlayer(player)}><b>#{player.overallRank}</b><span className="rank-player"><strong>{player.name}</strong><small>{player.team}{onRoster ? " · YOUR TEAM" : ""}</small></span><span><i className={`pos pos-${player.position.toLowerCase()}`}>{player.position}{player.positionRank}</i></span><strong className="rank-projection">{player.projection.toFixed(1)}</strong><span className="rank-range">{player.floor.toFixed(1)}–{player.ceiling.toFixed(1)}</span><p>{player.outlook}</p></button>; })}</div></section>; })}{!filtered.length && <section className="panel rank-empty">No players match this filter.</section>}</div></div>;
}

function StartSit({ players, choice, setChoice, teamProjection, context }: { players: Player[]; choice: string; setChoice: (v: string) => void; teamProjection: number; context: RankingContext | null }) {
  const decision = startSitDecision(players);
  const options = decision ? [decision.starter, decision.candidate] : [];
  const [opponentProjection, setOpponentProjection] = useState(Math.round(teamProjection + 8));
  const recommendedAggression = Math.max(10, Math.min(90, Math.round(50 + (opponentProjection - teamProjection) * 2.5)));
  const [aggressiveness, setAggressiveness] = useState(recommendedAggression);
  const posture = aggressiveness < 35 ? "Play it safe" : aggressiveness > 65 ? "Shoot for upside" : "Balanced";
  const activeChoice = options.some((player) => player.name === choice) ? choice : options[0]?.name ?? choice;
  const scorePlayer = (player: Player) => player.projection * .5 + player.floor * .5 * (1 - aggressiveness / 100) + player.ceiling * .5 * (aggressiveness / 100);
  const recommendedPlayer = [...options].sort((a, b) => scorePlayer(b) - scorePlayer(a))[0];
  const matchupGap = opponentProjection - teamProjection;
  if (!decision) return <div className="page-content"><SectionIntro kicker="WEEKLY DECISIONS" title="Your current lineup has no close calls" text="Fantasy Hub checked every starter against position-eligible bench alternatives with credible playing-time projections. No bench player is currently close enough to warrant a start/sit recommendation." /><section className="panel decision-empty"><strong>No realistic lineup swap identified</strong><p>Players projected below 2.0 points, unavailable players, and bench players who are not eligible for a starter’s lineup slot are excluded.</p></section></div>;
  return <div className="page-content"><SectionIntro kicker="WEEKLY DECISIONS" title="Choose the outcome your matchup requires" text={context ? `Every projection uses this league’s ${context.scoring} scoring and ${context.scoringRuleCount} active scoring rules before floor and ceiling are weighted for matchup posture.` : "A favorite should protect its floor. An underdog may need more volatility and ceiling to create a realistic path to win."} />{context && <section className="ranking-context start-sit-scoring"><span><b>{context.scoring}</b> receptions</span><span><b>{context.passTouchdown} pts</b> passing TD</span><span><b>{context.interception} pts</b> interceptions</span>{context.tePremium > 0 && <span><b>+{context.tePremium} per TE catch</b> TE premium</span>}{context.bonusRuleCount > 0 && <span><b>{context.bonusRuleCount}</b> bonus rules</span>}</section>}
    <section className="risk-console panel"><div className="matchup-inputs"><label>Your team projection<input type="number" step="0.1" value={teamProjection.toFixed(1)} readOnly /></label><span>VS</span><label>Opponent projection<input type="number" step="0.1" value={opponentProjection} onChange={(event) => setOpponentProjection(Number(event.target.value))} /></label></div><div className="risk-recommendation"><span>RECOMMENDED APPROACH</span><strong>{recommendedAggression}% · {recommendedAggression < 35 ? "Play it safe" : recommendedAggression > 65 ? "Shoot for upside" : "Balanced"}</strong><p>{matchupGap > 3 ? `You project ${matchupGap.toFixed(1)} points behind. Accept more variance to improve your upset path.` : matchupGap < -3 ? `You project ${Math.abs(matchupGap).toFixed(1)} points ahead. Protect the favorite outcome with dependable volume.` : "The matchup is close enough to favor balanced median outcomes."}</p><button onClick={() => setAggressiveness(recommendedAggression)}>Use recommended</button></div></section>
    <section className="aggression-panel panel"><div><span>START / SIT AGGRESSIVENESS</span><strong>{aggressiveness}%</strong><small>{posture}</small></div><input aria-label="Start sit aggressiveness" type="range" min="0" max="100" step="1" value={aggressiveness} onChange={(event) => setAggressiveness(Number(event.target.value))} style={{ background: `linear-gradient(90deg, var(--green) 0%, var(--gold) ${aggressiveness}%, #dfe7df ${aggressiveness}%, #dfe7df 100%)` }} /><div className="aggression-labels"><span>Protect floor</span><span>Balanced</span><span>Chase ceiling</span></div></section>
    <div className="compare-grid">{options.map((player) => { const modelChoice = recommendedPlayer?.id === player.id; const currentlyStarting = player.id === decision.starter.id; return <button key={player.id} className={`compare-card ${activeChoice === player.name ? "selected" : ""}`} onClick={() => setChoice(player.name)}><div className="choice-top"><span className={`pos pos-${player.position.toLowerCase()}`}>{player.position}</span>{modelChoice && <b>MODEL PICK</b>}</div><small>{player.team} · {player.opponent}</small><h3>{player.name}</h3><div className="range-bar"><i style={{ left: `${player.floor * 2.3}%`, width: `${(player.ceiling - player.floor) * 2.3}%` }} /><b style={{ left: `${player.projection * 2.3}%` }} /></div><div className="range-labels"><span>Floor <b>{player.floor}</b></span><span>Projection <b>{player.projection}</b></span><span>Ceiling <b>{player.ceiling}</b></span></div><p>{aggressiveness > 65 ? `Ceiling carries more weight at this setting. Risk-adjusted score: ${scorePlayer(player).toFixed(1)}.` : aggressiveness < 35 ? `Floor and role certainty carry more weight. Risk-adjusted score: ${scorePlayer(player).toFixed(1)}.` : `Median projection leads the decision. Risk-adjusted score: ${scorePlayer(player).toFixed(1)}.`}</p><strong className="select-label">{currentlyStarting ? `CURRENT ${player.role}` : `BENCH ALTERNATIVE · ELIGIBLE FOR ${decision.starter.role}`}</strong></button>; })}</div>
    <section className="insight-box"><span>FANTASY HUB VERDICT</span><h3>Start {recommendedPlayer?.name ?? activeChoice}</h3><p>At {aggressiveness}% aggressiveness, the model weights {aggressiveness > 65 ? "ceiling and game-breaking outcomes" : aggressiveness < 35 ? "floor, role certainty, and downside protection" : "floor, median, and ceiling more evenly"}. The recommendation can change as your matchup posture changes.</p></section>
  </div>;
}

function waiverBid(player: WaiverPlayer, index: number) {
  const positionPremium = player.position === "RB" ? 3 : player.position === "WR" ? 2 : player.position === "TE" ? 1 : 0;
  const midpoint = Math.max(1, Math.min(24, Math.round(player.projection * .55 + player.lineupAdjustment * .35 + positionPremium - index * .35)));
  return `${Math.max(1, midpoint - 3)}–${Math.min(30, midpoint + 3)}% FAAB`;
}

function waiverReason(player: WaiverPlayer, context: RankingContext | null) {
  if (player.status !== "Healthy") return `${player.status} status lowers certainty, but the league-adjusted value keeps this player on the watchlist.`;
  if (context?.format === "Dynasty" && player.age && player.age <= 24) return `Youth, roster runway, and ${context.scoring} scoring create one of the strongest available dynasty profiles.`;
  if (player.lineupAdjustment >= 3) return `Your league’s lineup requirements increase ${player.position} scarcity and make this availability more valuable.`;
  if (player.projection >= 12) return `The current league-scored projection supports immediate lineup utility with usable weekly upside.`;
  return `This is one of the highest-ranked unrostered players under the league’s scoring and positional demand.`;
}

function WaiverWire({ players, leagueSelected, leagueStatus, context, setSelectedPlayer }: { players: WaiverPlayer[]; leagueSelected: boolean; leagueStatus: string; context: RankingContext | null; setSelectedPlayer: (player: Player) => void }) {
  const [planned, setPlanned] = useState<string[]>([]);
  const [position, setPosition] = useState("ALL");
  const filtered = players.filter((player) => position === "ALL" || player.position === position).slice(0, 18);
  if (!leagueSelected) return <div className="page-content"><SectionIntro kicker="ROSTER MARKET" title="Choose a league to open its waiver wire" text="Available players are determined separately for every league." /><section className="panel scoreboard-empty">No league selected.</section></div>;
  if (leagueStatus === "pre_draft") return <div className="page-content"><SectionIntro kicker="ROSTER MARKET" title="The waiver wire opens after your draft" text="This league has not drafted, so players are not yet classified as rostered or available waiver options." /><section className="panel scoreboard-empty">No post-draft free-agent pool is available yet.</section></div>;
  return <div className="page-content"><SectionIntro kicker="LIVE LEAGUE AVAILABILITY" title="Turn available players into weekly leverage" text="Every player shown is currently unrostered across this league. Rankings adjust for league scoring, format, lineup demand, positional scarcity, projection, age, and availability." /><section className="waiver-controls panel"><div className="position-filters" role="group" aria-label="Filter waiver wire by position">{["ALL","QB","RB","WR","TE","K","DEF"].map((value) => <button key={value} className={position === value ? "active" : ""} onClick={() => setPosition(value)}>{value}</button>)}</div><span>{filtered.length} available recommendations</span></section><div className="waiver-grid">{filtered.map((player, index) => { const fit = Math.max(55, Math.min(98, Math.round(96 - index * 1.7 + Math.max(-3, player.lineupAdjustment)))); return <article className="waiver-card" key={player.id}><button className="waiver-player-open" onClick={() => setSelectedPlayer(player)} aria-label={`Open ${player.name}`}><div><b>{String(index + 1).padStart(2, "0")}</b><span className="score">{fit} FIT</span></div><span className={`pos pos-${player.position.toLowerCase()}`}>{player.position}</span><h3>{player.name}</h3><small>{player.team} · Available in this league · Overall #{player.overallRank}</small><p>{waiverReason(player, context)}</p></button><dl><div><dt>Recommended bid</dt><dd>{waiverBid(player, index)}</dd></div><div><dt>Priority</dt><dd>{index < 3 ? "Aggressive" : index < 9 ? "Measured" : "Watchlist"}</dd></div></dl><button onClick={() => setPlanned((current) => current.includes(player.id) ? current.filter((id) => id !== player.id) : [...current, player.id])}>{planned.includes(player.id) ? "Added to plan" : "Add to waiver plan"}</button></article>; })}</div>{!filtered.length && <section className="panel scoreboard-empty">No unrostered {position === "ALL" ? "players" : position} options were returned for this league.</section>}</div>;
}

function tradeAsset(player: Player, rankingById: Map<string, LeagueRanking>): TradeAssetValue {
  const ranking = rankingById.get(player.id);
  const value = ranking ? Math.max(40, Math.min(99, Math.round(104 - ranking.overallRank * .32))) : Math.max(35, Math.min(85, Math.round(player.projection * 3.4)));
  return { id: player.id, name: player.name, position: player.position, meta: `${player.position} · ${player.team}`, value };
}

function teamNeeds(team: LeagueTeam, rankingById: Map<string, LeagueRanking>, context: RankingContext | null) {
  return ["QB", "RB", "WR", "TE"].map((position) => {
    const room = team.roster.filter((player) => player.position === position);
    const desired = Math.max(1, Math.ceil(context?.positionDemand[position] ?? 1));
    const bestRank = Math.min(...room.map((player) => rankingById.get(player.id)?.overallRank ?? 500), 500);
    return { position, score: Math.max(0, desired - room.length) * 80 + bestRank / Math.max(1, room.length) };
  }).sort((a, b) => b.score - a.score);
}

function buildTradeSuggestions(yourTeam: LeagueTeam, partner: LeagueTeam, rankings: LeagueRanking[], context: RankingContext | null, style: TradeStyle): TradeSuggestion[] {
  const rankingById = new Map(rankings.map((player) => [player.id, player]));
  const yourNeeds = teamNeeds(yourTeam, rankingById, context);
  const partnerNeeds = teamNeeds(partner, rankingById, context);
  const yourNeedOrder = new Map(yourNeeds.map((need, index) => [need.position, index]));
  const partnerNeedOrder = new Map(partnerNeeds.map((need, index) => [need.position, index]));
  const eligible = (player: Player) => !["K", "DEF"].includes(player.position) && rankingById.has(player.id);
  const partnerAssets = partner.roster.filter(eligible).map((player) => tradeAsset(player, rankingById)).sort((a, b) => (yourNeedOrder.get(a.position) ?? 9) - (yourNeedOrder.get(b.position) ?? 9) || b.value - a.value);
  const yourAssets = yourTeam.roster.filter(eligible).map((player) => tradeAsset(player, rankingById));
  const premium = style === "Strict" ? 1.08 : style === "Aggressive" ? .92 : 1;
  const suggestions: TradeSuggestion[] = [];
  const usedTargets = new Set<string>();
  for (const target of partnerAssets) {
    if (usedTargets.has(target.id)) continue;
    const sendPool = [...yourAssets].sort((a, b) => {
      const aNeed = partnerNeedOrder.get(a.position) ?? 9;
      const bNeed = partnerNeedOrder.get(b.position) ?? 9;
      return aNeed - bNeed || Math.abs(a.value - target.value * premium) - Math.abs(b.value - target.value * premium);
    });
    let send = [sendPool[0]].filter(Boolean);
    let sendValue = send.reduce((sum, asset) => sum + asset.value, 0);
    if (sendValue < target.value * premium && sendPool[1]) {
      const second = sendPool.slice(1).sort((a, b) => Math.abs((sendValue + a.value * .72) - target.value * premium) - Math.abs((sendValue + b.value * .72) - target.value * premium))[0];
      if (second) { send = [...send, second]; sendValue += second.value * .72; }
    }
    if (!send.length) continue;
    const valueGap = Math.abs(sendValue - target.value) / Math.max(target.value, 1);
    const yourNeed = yourNeedOrder.get(target.position) ?? 3;
    const partnerNeed = Math.min(...send.map((asset) => partnerNeedOrder.get(asset.position) ?? 3));
    const yourBenefit = Math.round(Math.max(55, Math.min(96, 91 - yourNeed * 7 - valueGap * 18)));
    const partnerBenefit = Math.round(Math.max(55, Math.min(96, 89 - partnerNeed * 7 + (sendValue / target.value - 1) * 18)));
    const styleBase = style === "Aggressive" ? 73 : style === "Strict" ? 52 : 64;
    const acceptance = Math.round(Math.max(35, Math.min(88, styleBase + (partnerBenefit - 70) * .55 - valueGap * 16)));
    const sendPositions = [...new Set(send.map((asset) => asset.position))].join("/");
    suggestions.push({ id: `${partner.id}-${target.id}-${send.map((asset) => asset.id).join("-")}`, title: `Address ${yourTeam.teamName}’s ${target.position} need`, receive: [target], send, yourBenefit, partnerBenefit, acceptance, confidence: Math.round(Math.max(58, Math.min(91, 88 - valueGap * 28))), whyYou: `${target.name} improves a priority ${target.position} room using this league’s scoring and lineup value.`, whyThem: `${send.map((asset) => asset.name).join(" and ")} ${send.length > 1 ? "add" : "adds"} ${sendPositions} value where ${partner.teamName} grades as comparatively thin.` });
    usedTargets.add(target.id);
    if (suggestions.length === 3) break;
  }
  return suggestions;
}

function TradeLab({ teams, selectedTeamId, rankings, context }: { teams: LeagueTeam[]; selectedTeamId: string; rankings: LeagueRanking[]; context: RankingContext | null }) {
  const yourTeam = teams.find((team) => team.id === selectedTeamId);
  const opponents = teams.filter((team) => team.id !== selectedTeamId && team.roster.length);
  const [selectedId, setSelectedId] = useState(opponents[0]?.id ?? "");
  const [styles, setStyles] = useState<Record<string, TradeStyle>>({});
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const partner = opponents.find((team) => team.id === selectedId) ?? opponents[0];
  const partnerStyle = partner ? (styles[partner.id] ?? "Neutral") : "Neutral";
  const suggestions = yourTeam && partner ? buildTradeSuggestions(yourTeam, partner, rankings, context, partnerStyle) : [];
  const suggestion = suggestions.length ? suggestions[activeSuggestion % suggestions.length] : null;
  function selectPartner(id: string) { setSelectedId(id); setActiveSuggestion(0); }
  function updateStyle(style: TradeStyle) { if (!partner) return; setStyles((current) => ({ ...current, [partner.id]: style })); setActiveSuggestion(0); }
  if (!yourTeam) return <div className="page-content"><SectionIntro kicker="TRADE INTELLIGENCE" title="Choose your team to build real trade ideas" text="Fantasy Hub needs your active roster before it can compare needs with league opponents." /><section className="panel scoreboard-empty">No fantasy team selected.</section></div>;
  if (!partner || !suggestion) return <div className="page-content"><SectionIntro kicker="TRADE INTELLIGENCE" title="No roster-based trade frameworks are available yet" text="Suggestions appear after at least two teams have drafted eligible players with league-adjusted values." /><section className="panel scoreboard-empty">Not enough roster data to construct a two-sided proposal.</section></div>;
  return <div className="page-content">
    <SectionIntro kicker="LIVE LEAGUE TRADE INTELLIGENCE" title="Find trades both actual rosters have a reason to accept" text="Every package uses players currently owned by the two selected teams. League-adjusted value, lineup demand, positional weakness, package balance, and manager behavior shape each suggestion." />
    <section className="trade-controls panel"><div><label htmlFor="trade-partner">Trade partner</label><select id="trade-partner" value={partner.id} onChange={(event) => selectPartner(event.target.value)}>{opponents.map((team) => <option key={team.id} value={team.id}>{team.teamName} · {team.managerName}</option>)}</select></div><div><span>Negotiation profile</span><div className="style-toggle" role="group" aria-label="Trade partner negotiation profile">{(["Aggressive", "Neutral", "Strict"] as TradeStyle[]).map((style) => <button key={style} className={partnerStyle === style ? "active" : ""} onClick={() => updateStyle(style)}>{style}</button>)}</div></div><p><strong>{partnerStyle}</strong>{partnerStyle === "Aggressive" ? "More willing to consolidate value and accept higher-variance packages." : partnerStyle === "Strict" ? "Requires a visible value cushion and a direct roster-need solution." : "Prefers balanced value with a clear benefit for both starting lineups."}</p></section>
    <div className="suggestion-tabs" role="tablist" aria-label="Recommended trade frameworks">{suggestions.map((item, index) => <button key={item.id} role="tab" aria-selected={index === activeSuggestion} className={index === activeSuggestion ? "active" : ""} onClick={() => setActiveSuggestion(index)}><span>OPTION {index + 1}</span><strong>{item.title}</strong><small>{item.acceptance}% estimated acceptance</small></button>)}</div>
    <div className="trade-board"><section><span>YOU RECEIVE</span>{suggestion.receive.map((asset) => <TradeAsset key={asset.id} asset={asset} />)}</section><div className="trade-balance"><strong>{Math.min(suggestion.yourBenefit, suggestion.partnerBenefit)}</strong><span>Mutual benefit</span><i>↔</i><b>{suggestion.acceptance}% likely</b></div><section><span>{partner.teamName.toUpperCase()} RECEIVES</span>{suggestion.send.map((asset) => <TradeAsset key={asset.id} asset={asset} />)}</section></div>
    <div className="mutual-grid"><article><span>YOUR TEAM</span><strong>{suggestion.yourBenefit}</strong><h3>Why this helps you</h3><p>{suggestion.whyYou}</p></article><article><span>{partner?.teamName ?? "Trade partner"}</span><strong>{suggestion.partnerBenefit}</strong><h3>Why they may accept</h3><p>{suggestion.whyThem}</p></article><article><span>DEAL CONFIDENCE</span><strong>{suggestion.confidence}%</strong><h3>Framework quality</h3><p>Confidence reflects role certainty, valuation range, roster-need evidence, and the selected manager profile.</p></article></div>
    <section className="trade-note"><strong>Actual rosters, modeled acceptance</strong><p>Player ownership and team needs are live for this league. Aggressive, Neutral, and Strict alter package thresholds, but acceptance remains an estimate—not a claim about another manager’s decision.</p></section>
  </div>;
}

function Matchups({ players, season }: { players: Player[]; season: string }) {
  const [schedule, setSchedule] = useState<NflScheduleData | null>(null);
  const [week, setWeek] = useState<number | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/nfl-schedule?season=${encodeURIComponent(season)}`, { signal: controller.signal }).then(async (response) => {
      const data = await response.json() as NflScheduleData & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "NFL schedule unavailable");
      return data;
    }).then((data) => { setSchedule(data); setWeek((current) => current ?? data.currentWeek); setError(""); }).catch((requestError) => { if (requestError?.name !== "AbortError") setError(requestError instanceof Error ? requestError.message : "NFL schedule unavailable"); });
    return () => controller.abort();
  }, [season]);
  const loading = !schedule || String(schedule.season) !== season;
  const activeWeek = week ?? schedule?.currentWeek ?? 1;
  const games = schedule?.weeks.find((item) => item.week === activeWeek)?.games ?? [];
  const normalizeTeam = (team: string) => ({ JAC: "JAX", WSH: "WAS" } as Record<string, string>)[team] ?? team;
  const playerMatchup = (team: string) => {
    const code = normalizeTeam(team);
    const game = games.find((item) => item.away.abbreviation === code || item.home.abbreviation === code);
    if (!game) return null;
    const away = game.away.abbreviation === code;
    return { game, label: `${away ? "@" : "vs"} ${away ? game.home.abbreviation : game.away.abbreviation}`, venue: away ? "Road" : "Home" };
  };
  return <div className="page-content matchup-season-page"><section className="matchup-season-head"><div><span>FULL {season} NFL SEASON</span><h2>Every weekly matchup, mapped to your roster.</h2><p>Move through Weeks 1–18 to see each player’s opponent, location, kickoff, and bye week.</p></div><label>Schedule week<select value={activeWeek} onChange={(event) => setWeek(Number(event.target.value))}>{Array.from({ length: 18 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>Week {value}</option>)}</select></label></section>{error && <section className="scoreboard-error">{error}</section>}{loading && <section className="panel scoreboard-empty">Loading the {season} NFL schedule…</section>}{!loading && !error && <><div className="matchup-grid roster-matchups">{players.map((player) => { const matchup = playerMatchup(player.team); return <article className={!matchup ? "bye-week" : ""} key={player.id}><div><span className={`pos pos-${player.position.toLowerCase()}`}>{player.position}</span><b className={matchup ? "edge-neutral" : "bye-label"}>{matchup?.venue.toUpperCase() ?? "BYE"}</b></div><h3>{player.name}</h3><small>{player.team} · {matchup?.label ?? `Bye Week ${activeWeek}`}</small><p>{matchup ? `${matchup.game.away.name} at ${matchup.game.home.name} · ${new Date(matchup.game.date).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}${matchup.game.broadcast ? ` · ${matchup.game.broadcast}` : ""}` : `${player.team} is not scheduled to play in Week ${activeWeek}. Plan a replacement before lineups lock.`}</p><div className="match-meter"><i style={{ width: matchup ? "72%" : "12%" }} /></div><span>{matchup ? "Scheduled matchup" : "Bye week"}</span></article>; })}</div><section className="week-slate panel"><div className="panel-header"><div><span>NFL WEEK {activeWeek}</span><h3>Complete game slate</h3></div><b>{games.length} games</b></div><div>{games.map((game) => <article key={game.id}><time>{new Date(game.date).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time><p><span>{game.away.abbreviation}</span><strong>{game.away.name}</strong><i>at</i><span>{game.home.abbreviation}</span><strong>{game.home.name}</strong></p><small>{game.broadcast || game.status}</small></article>)}</div>{!games.length && <p className="schedule-empty">No regular-season games were returned for Week {activeWeek}.</p>}</section></>}</div>;
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => { state += 0x6D2B79F5; let value = state; value = Math.imul(value ^ value >>> 15, value | 1); value ^= value + Math.imul(value ^ value >>> 7, value | 61); return ((value ^ value >>> 14) >>> 0) / 4294967296; };
}

function runLeagueSimulation(volume: number, simulation: SimulationContext, teams: LeagueTeam[], selectedTeamId: string, seed: number): SimulationResult {
  const random = seededRandom(seed);
  const normal = () => Math.sqrt(-2 * Math.log(Math.max(.000001, random()))) * Math.cos(2 * Math.PI * random());
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const strengths = new Map(teams.map((team) => {
    const starters = team.roster.filter((player) => player.role !== "Bench" && player.role !== "IR" && player.role !== "TAXI");
    return [team.id, Math.max(1, starters.reduce((sum, player) => sum + player.projection, 0))];
  }));
  const sampleScore = (teamId: string) => {
    const base = strengths.get(teamId) ?? 1;
    const weeklyVariance = Math.max(7, base * .17);
    const injuryShock = random() < .035 ? base * (.08 + random() * .14) : 0;
    return Math.max(0, base + normal() * weeklyVariance - injuryShock);
  };
  const simulateBracket = (seededTeams: string[]) => {
    let field = [...seededTeams];
    const bracketSize = 2 ** Math.ceil(Math.log2(Math.max(2, field.length)));
    const byes = bracketSize - field.length;
    if (byes > 0) {
      const advancing = field.slice(0, byes);
      const playing = field.slice(byes);
      while (playing.length > 1) {
        const high = playing.shift()!;
        const low = playing.pop()!;
        advancing.push(sampleScore(high) >= sampleScore(low) ? high : low);
      }
      if (playing.length) advancing.push(playing[0]);
      field = advancing;
    }
    while (field.length > 1) {
      const next: string[] = [];
      while (field.length > 1) {
        const first = field.shift()!;
        const second = field.pop()!;
        next.push(sampleScore(first) >= sampleScore(second) ? first : second);
      }
      if (field.length) next.push(field[0]);
      field = next;
    }
    return field[0];
  };
  let playoffs = 0;
  let byes = 0;
  let titles = 0;
  const userWins: number[] = [];
  for (let trial = 0; trial < volume; trial += 1) {
    const standings = new Map(teams.map((team) => [team.id, { wins: 0, points: 0 }]));
    for (const week of simulation.weeks) {
      for (const matchup of week.matchups) {
        const [first, second] = matchup.teams;
        if (!standings.has(first) || !standings.has(second)) continue;
        const completed = week.week < simulation.league.currentWeek && matchup.points.some((points) => points > 0);
        const firstScore = completed ? matchup.points[0] : sampleScore(first);
        const secondScore = completed ? matchup.points[1] : sampleScore(second);
        standings.get(first)!.points += firstScore;
        standings.get(second)!.points += secondScore;
        if (firstScore === secondScore) { standings.get(first)!.wins += .5; standings.get(second)!.wins += .5; }
        else standings.get(firstScore > secondScore ? first : second)!.wins += 1;
      }
    }
    const seeded = [...standings.entries()].sort((a, b) => b[1].wins - a[1].wins || b[1].points - a[1].points).map(([id]) => id);
    const userSeed = seeded.indexOf(selectedTeamId);
    userWins.push(standings.get(selectedTeamId)?.wins ?? 0);
    if (userSeed >= 0 && userSeed < simulation.league.playoffTeams) playoffs += 1;
    const byeCount = Math.max(0, 2 ** Math.ceil(Math.log2(simulation.league.playoffTeams)) - simulation.league.playoffTeams);
    if (userSeed >= 0 && userSeed < byeCount) byes += 1;
    const qualifiers = seeded.slice(0, simulation.league.playoffTeams);
    if (simulateBracket(qualifiers) === selectedTeamId) titles += 1;
  }
  userWins.sort((a, b) => a - b);
  const percentile = (fraction: number) => userWins[Math.min(userWins.length - 1, Math.floor((userWins.length - 1) * fraction))] ?? 0;
  const yourTeam = teamById.get(selectedTeamId);
  const starters = yourTeam?.roster.filter((player) => player.role !== "Bench" && player.role !== "IR" && player.role !== "TAXI").sort((a, b) => b.projection - a.projection) ?? [];
  const strengthRank = [...strengths.entries()].sort((a, b) => b[1] - a[1]).findIndex(([id]) => id === selectedTeamId) + 1;
  const lowOpportunity = starters.filter((player) => player.projection < 2);
  return {
    playoffOdds: playoffs / volume * 100,
    byeOdds: byes / volume * 100,
    titleOdds: titles / volume * 100,
    medianWins: percentile(.5),
    winPercentiles: [["10th", .1], ["25th", .25], ["50th", .5], ["75th", .75], ["90th", .9]].map(([label, value]) => ({ label: String(label), value: percentile(Number(value)) })),
    seed,
    topDrivers: starters.slice(0, 3).map((player) => `${player.name} anchors the lineup at ${player.projection.toFixed(1)} projected points.`),
    riskDrivers: [`Projected starter strength ranks ${strengthRank}th of ${teams.length} teams.`, lowOpportunity.length ? `${lowOpportunity.length} starting slot${lowOpportunity.length === 1 ? " has" : "s have"} under 2.0 expected points.` : "No current starter is below the 2.0-point opportunity threshold.", "Weekly variance includes a player-availability shock in 3.5% of team-weeks."],
  };
}

function Simulator({ simulations, setSimulations, leagueId, teams, selectedTeamId, context }: { simulations: number; setSimulations: (n: number) => void; leagueId: string; teams: LeagueTeam[]; selectedTeamId: string; context: RankingContext | null }) {
  const [simulation, setSimulation] = useState<SimulationContext | null>(null);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/simulation-context?leagueId=${encodeURIComponent(leagueId)}`, { signal: controller.signal }).then(async (response) => { const data = await response.json() as SimulationContext & { error?: string }; if (!response.ok) throw new Error(data.error ?? "Simulation details unavailable"); return data; }).then((data) => { setSimulation(data); setError(""); }).catch((requestError) => { if (requestError?.name !== "AbortError") setError(requestError instanceof Error ? requestError.message : "Simulation details unavailable"); });
    return () => controller.abort();
  }, [leagueId]);
  function run() {
    if (!simulation || !selectedTeamId) return;
    setRunning(true);
    window.setTimeout(() => { const seed = Math.floor(Math.random() * 2_147_483_647); setResult(runLeagueSimulation(simulations, simulation, teams, selectedTeamId, seed)); setRunning(false); }, 20);
  }
  if (error) return <div className="page-content"><SectionIntro kicker="MONTE CARLO LAB" title="League simulation is unavailable" text={error} /></div>;
  if (!simulation) return <div className="page-content"><SectionIntro kicker="MONTE CARLO LAB" title="Loading actual league details…" text="Pulling the fantasy schedule, playoff rules, rosters, lineup structure, and scoring configuration." /><section className="panel scoreboard-empty">Preparing league model…</section></div>;
  const maxWins = Math.max(1, ...(result?.winPercentiles.map((item) => item.value) ?? [simulation.league.regularSeasonWeeks]));
  return <div className="page-content simulator-live"><SectionIntro kicker="LEAGUE-SPECIFIC MONTE CARLO" title={`Simulate ${simulation.league.name}, not a generic league`} text="Each run uses actual rosters, corrected opportunity-aware projections, weekly fantasy matchups, completed results, lineup rules, scoring configuration, playoff field, and playoff timing." /><section className="simulation-context panel"><span><b>{simulation.league.totalTeams}</b> teams</span><span><b>{simulation.league.playoffTeams}</b> playoff spots</span><span><b>Week {simulation.league.playoffWeekStart}</b> playoffs begin</span><span><b>{simulation.league.starterSlots.length}</b> starter slots</span><span><b>{context?.scoring ?? "Custom"}</b> scoring</span><span><b>{simulation.league.scoringRuleCount}</b> scoring rules</span></section><section className="sim-hero"><div><label>Simulation volume<select value={simulations} onChange={(event) => setSimulations(Number(event.target.value))}><option value="5000">5,000 seasons</option><option value="10000">10,000 seasons</option><option value="25000">25,000 seasons</option></select></label><button onClick={run} disabled={running}>{running ? "Running seasons…" : "Run simulation"}</button>{result && <small>Seed {result.seed.toLocaleString()}</small>}</div>{result ? <div className="sim-results"><Metric label="Playoff odds" value={`${result.playoffOdds.toFixed(1)}%`} detail={`${result.medianWins} median wins`} tone="good" /><Metric label="First-round bye" value={`${result.byeOdds.toFixed(1)}%`} detail="Based on actual playoff field" /><Metric label="Title odds" value={`${result.titleOdds.toFixed(1)}%`} detail={`${simulations.toLocaleString()} modeled seasons`} tone="good" /></div> : <div className="simulation-ready"><strong>Ready to simulate</strong><p>Results remain hidden until you run the model.</p></div>}</section>{result && <><section className="win-distribution panel"><div className="panel-header"><div><span>REGULAR-SEASON OUTCOMES</span><h3>Win distribution</h3></div></div><div>{result.winPercentiles.map((item) => <article key={item.label}><strong>{item.value}</strong><i><em style={{ height: `${item.value / maxWins * 100}%` }} /></i><span>{item.label}</span></article>)}</div></section><div className="simulation-drivers"><section className="panel"><div className="panel-header"><div><span>UPSIDE DRIVERS</span><h3>What raises the ceiling</h3></div></div>{result.topDrivers.map((driver) => <p key={driver}>{driver}</p>)}</section><section className="panel"><div className="panel-header"><div><span>RISK DRIVERS</span><h3>What holds the team back</h3></div></div>{result.riskDrivers.map((driver) => <p key={driver}>{driver}</p>)}</section></div></>}</div>;
}

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
function TradeAsset({ asset }: { asset: TradeAssetValue }) { return <article className="trade-asset"><span className={`pos pos-${asset.position.toLowerCase()}`}>{asset.position}</span><p><strong>{asset.name}</strong><small>{asset.meta}</small></p><b>{asset.value}</b></article>; }
