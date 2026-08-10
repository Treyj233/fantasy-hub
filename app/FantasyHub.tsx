"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { estimatedWinProbability, playerLeverage, rootingInterests, whatDoINeed } from "./game-day-model.mjs";

type View =
  | "Command Center"
  | "League Stories"
  | "Manager Report"
  | "All Leagues"
  | "Scoreboard"
  | "NFL Games"
  | "Dynasty Analytics"
  | "My Team"
  | "Team Rankings"
  | "Player Rankings"
  | "ADP"
  | "Start / Sit"
  | "Waiver Wire"
  | "Trade Lab"
  | "Matchups"
  | "Simulator"
  | "Manage Leagues";
type Player = {
  id: string;
  name: string;
  position: string;
  team: string;
  opponent: string;
  projection: number;
  leagueProjection?: number | null;
  floor: number;
  ceiling: number;
  trend: number;
  status: string;
  role: string;
  weatherAdjustment?: number;
  weatherSummary?: string;
  matchupStrength?: MatchupStrength | null;
  matchupSourceSeason?: number;
  snapPct?: number | null;
  snapAverage?: number | null;
  snapWeek?: number | null;
  snapSeason?: number | null;
  fantasyPpg2025?: number | null;
  gamesPlayed2025?: number | null;
  team2025?: string | null;
  teamOffenseRank2025?: number | null;
  teamPointsPerGame2025?: number | null;
};
type MatchupStrength = {
  team: string;
  position: string;
  rank: number;
  pointsAllowed: number;
  games: number;
  score: number;
  label: "Great" | "Favorable" | "Neutral" | "Tough" | "Avoid";
};
type MatchupStrengthData = {
  sourceSeason: number;
  updatedAt: string;
  positions: Record<string, Record<string, MatchupStrength>>;
};
const PlayerOpenContext = createContext<(player: Player) => void>(() => undefined);
const ProjectionPlatformContext = createContext("League platform");
const PORTFOLIO_CACHE_TTL = 30 * 60 * 1000;
const PORTFOLIO_CACHE_VERSION = 2;
const weatherRequestCache = new Map<
  string,
  { expiresAt: number; request: Promise<WeatherData | null> }
>();

function loadWeatherData(season: string | number, week: number) {
  const key = `${season}-${week}`;
  const cached = weatherRequestCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.request;
  const request = fetch(
    `/api/weather?season=${encodeURIComponent(String(season))}&week=${week}`,
  )
    .then(async (response) =>
      response.ok ? ((await response.json()) as WeatherData) : null,
    )
    .catch(() => null);
  weatherRequestCache.set(key, {
    expiresAt: Date.now() + 5 * 60 * 1000,
    request,
  });
  return request;
}
const nflLogoCode = (team: string) =>
  ({ JAX: "jax", WAS: "wsh", LAR: "lar", LAC: "lac" })[team] ??
  team.toLowerCase();
const nflTeamLogoUrl = (team: string) =>
  `https://a.espncdn.com/i/teamlogos/nfl/500/${nflLogoCode(team)}.png`;
const nflPlayerHeadshotUrl = (playerId: string) =>
  `https://sleepercdn.com/content/nfl/players/${encodeURIComponent(playerId)}.jpg`;

function NflTeamLogo({ team }: { team: string }) {
  return (
    <span className="nfl-team-logo" aria-hidden="true">
      <span>{team}</span>
      {/* External league assets use their native CDN URL and a local fallback. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={nflTeamLogoUrl(team)}
        alt=""
        loading="lazy"
        decoding="async"
        onError={(event) => {
          event.currentTarget.style.display = "none";
        }}
      />
    </span>
  );
}

function PlayerHeadshot({
  id,
  position,
  large = false,
}: {
  id: string;
  position: string;
  large?: boolean;
}) {
  return (
    <span className={`player-headshot ${large ? "large" : ""}`} aria-hidden="true">
      <span>{position}</span>
      {/* External league assets use their native CDN URL and a local fallback. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={nflPlayerHeadshotUrl(id)}
        alt=""
        loading="lazy"
        decoding="async"
        onError={(event) => {
          event.currentTarget.style.display = "none";
        }}
      />
    </span>
  );
}
const playerShell = (
  player: { id: string; name: string; position: string; team?: string; nflTeam?: string },
): Player => ({
  id: player.id,
  name: player.name,
  position: player.position,
  team: player.team ?? player.nflTeam ?? "FA",
  opponent: "Matchup details in league view",
  projection: 0,
  leagueProjection: null,
  floor: 0,
  ceiling: 0,
  trend: 0,
  status: "Healthy",
  role: "Player",
});
type RankedPlayer = Player & {
  overallRank: number;
  positionRank: number;
  tier: 1 | 2 | 3 | 4;
  outlook: string;
  adpBySite?: Record<string, number | null>;
};
type PlayerWeek = {
  season: string;
  week: number;
  points: number;
  projection: number | null;
  totalYards: number;
  touchdowns: number;
  passYards: number;
  passTouchdowns: number;
  interceptions: number;
  rushAttempts: number;
  rushYards: number;
  rushTouchdowns: number;
  targets: number;
  receptions: number;
  receivingYards: number;
  receivingTouchdowns: number;
};
type PlayerHistory = {
  sourceStatus: "available" | "unavailable";
  player: {
    id: string;
    age?: number;
    yearsExp?: number;
    college?: string;
    height?: string;
    weight?: string;
  };
  snapProfile?: {
    season: number;
    games: number;
    latestWeek: number;
    latestPct: number | null;
    averagePct: number | null;
    offensePct: number | null;
    defensePct: number | null;
    specialTeamsPct: number | null;
  } | null;
  seasons: {
    season: string;
    games: number;
    points: number;
    pointsPerGame: number;
    positionRank: number | null;
    yards: number;
    touchdowns: number;
    receptions: number;
  }[];
  recentWeeks: {
    week: number;
    points: number;
    yards: number;
    touchdowns: number;
    targets: number;
  }[];
  weeks: PlayerWeek[];
};
type TradeStyle = "Aggressive" | "Neutral" | "Strict";
type Theme = "light" | "dark";
type DraftPick = {
  season: number;
  round: number;
  originalRosterId: number;
  ownerRosterId: number;
  value: number;
};
type LeagueTeam = {
  id: string;
  ownerId?: string;
  managerName: string;
  teamName: string;
  matchupId?: number | null;
  roster: Player[];
  draftCapital?: { score: number; picks: DraftPick[] };
};
type LeagueRanking = Player & {
  overallRank: number;
  rankingValue: number;
  adpBySite?: Record<string, number | null>;
  age?: number | null;
  ageAdjustment: number;
  lineupAdjustment: number;
};
type WaiverPlayer = LeagueRanking;
type RankingContext = {
  format: "Dynasty" | "Keeper" | "Redraft";
  scoring: string;
  teams: number;
  rosterSlots: string[];
  positionDemand: Record<string, number>;
  tePremium: number;
  passTouchdown: number;
  interception: number;
  bonusRuleCount: number;
  scoringRuleCount: number;
};
type AccountUser = { displayName: string; email: string };
type SleeperConnection = {
  sleeperUserId: string;
  sleeperUsername: string;
  displayName: string;
  avatar?: string | null;
};
type ConnectedLeague = {
  id: string;
  sourceId?: string;
  provider?: LeagueProvider;
  name: string;
  season?: string;
  teams: number;
  format: string;
  scoring: string;
  rosterId: string;
  starterCount: number;
};
const sleeperLeagueUrl = (leagueId: string) =>
  `https://sleeper.com/leagues/${encodeURIComponent(leagueId)}`;
const platformLeagueUrl = (league: ConnectedLeague) =>
  league.provider === "espn"
    ? `https://fantasy.espn.com/football/league?leagueId=${encodeURIComponent(league.sourceId ?? league.id.split(":").at(-1) ?? league.id)}`
    : sleeperLeagueUrl(league.sourceId ?? league.id);
function PlatformLogo({ provider = "Sleeper" }: { provider?: string }) {
  return provider.toLowerCase() === "sleeper" ? <span className="platform-logo" role="img" aria-label="Sleeper" /> : <span className="platform-logo-fallback">{provider}</span>;
}
const rememberDecision = (decision: { id: string; leagueId: string; week: number; category: string; recommendation: string; alternatives: unknown[]; information: Record<string, unknown>; confidence: number; userSelection?: string | null }) => {
  if (!decision.leagueId) return;
  void fetch("/api/decisions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(decision) }).catch(() => undefined);
};

const platformActionLabel = (view: View, provider = "Sleeper") =>
  view === "Start / Sit" || view === "My Team"
    ? `Open lineup in ${provider}`
    : view === "Trade Lab"
      ? `Prepare trade in ${provider}`
      : view === "Waiver Wire"
        ? `Open waivers in ${provider}`
        : `Open league in ${provider}`;
type LeagueProvider = "sleeper" | "espn";
type ManagedLeague = {
  id: string;
  provider: LeagueProvider;
  identifierType: "username" | "league_id";
  identifier: string;
  rosterId?: string | null;
  leagueName?: string | null;
  season?: string | null;
  status: "live" | "saved" | "oauth_required";
  updatedAt: string;
};
type ScoreboardPlayer = {
  id: string;
  name: string;
  position: string;
  nflTeam: string;
  points: number;
  isStarter: boolean;
  lineupSlot: string;
  lineupOrder: number;
  yards: number;
  touchdowns: number;
  receptions: number;
  targets: number;
};
type ScoreboardTeam = {
  rosterId: string;
  managerName: string;
  teamName: string;
  points: number;
  isMine: boolean;
  topPlayers: ScoreboardPlayer[];
};
type ScoreboardData = {
  league: { name: string; season: string; currentWeek: number; provider?: string; projectionSource?: string; scoring?: Record<string, number> };
  week: number;
  updatedAt: string;
  matchups: { matchupId: number; status: string; teams: ScoreboardTeam[] }[];
};
type NflImpactPlayer = {
  id: string;
  name: string;
  position: string;
  nflTeam: string;
  side: "You" | "Opponent";
  starter: boolean;
  fantasyPoints: number;
  projection: number | null;
  remainingProjection: number;
};
type NflGameData = {
  league: { name: string; season: string; provider?: string; projectionSource?: string };
  week: number;
  updatedAt: string;
  scoresAvailable?: boolean;
  fallbackSchedule?: boolean;
  fantasyMatchup: {
    available: boolean;
    yourPoints: number;
    opponentPoints: number;
    opponentName: string;
    playerCount: number;
  };
  games: {
    id: string;
    date: string;
    name: string;
    status: string;
    state: string;
    clock: string;
    venue: string;
    broadcast: string;
    teams: {
      abbreviation: string;
      name: string;
      displayName: string;
      homeAway: string;
      score: number;
      winner: boolean;
      color: string;
      logo: string | null;
      record: string;
    }[];
    impactPlayers: NflImpactPlayer[];
  }[];
};
type ScheduleGame = {
  id: string;
  week: number;
  date: string;
  status: string;
  broadcast: string;
  away: { abbreviation: string; name: string };
  home: { abbreviation: string; name: string };
};
type NflScheduleData = {
  season: number;
  currentWeek: number;
  updatedAt: string;
  weeks: { week: number; games: ScheduleGame[] }[];
};
type WeatherGame = {
  gameId: string;
  date: string;
  venue: string;
  indoor: boolean;
  forecastAvailable: boolean;
  summary: string;
  teams: string[];
  temperatureF?: number | null;
  precipitationProbability?: number | null;
  precipitationInches?: number | null;
  windMph?: number | null;
  windGustMph?: number | null;
};
type WeatherData = {
  season: number;
  week: number;
  updatedAt: string;
  games: WeatherGame[];
};
type SimulationContext = {
  league: {
    name: string;
    season: string;
    currentWeek: number;
    totalTeams: number;
    playoffTeams: number;
    playoffWeekStart: number;
    regularSeasonWeeks: number;
    format: string;
    starterSlots: string[];
    scoringRuleCount: number;
  };
  weeks: { week: number; matchups: { teams: string[]; points: number[] }[] }[];
};
type SimulationResult = {
  playoffOdds: number;
  byeOdds: number;
  titleOdds: number;
  medianWins: number;
  winPercentiles: { label: string; value: number }[];
  seed: number;
  topDrivers: string[];
  riskDrivers: string[];
};
type TradeAssetValue = {
  id: string;
  name: string;
  position: string;
  team: string;
  meta: string;
  value: number;
  trueTalent: number;
  currentOverall: number;
  dynastyOverall: number;
  confidence: "High" | "Medium" | "Low";
};
type TradeSuggestion = {
  id: string;
  title: string;
  receive: TradeAssetValue[];
  send: TradeAssetValue[];
  yourBenefit: number;
  partnerBenefit: number;
  acceptance: number;
  confidence: number;
  whyYou: string;
  whyThem: string;
  yourBefore: number;
  yourAfter: number;
  partnerBefore: number;
  partnerAfter: number;
  format: "Dynasty" | "Keeper" | "Redraft";
};
type LeagueScan = {
  league: ConnectedLeague;
  teamName: string;
  week: number;
  projection: number;
  status: "ready" | "review" | "urgent" | "unavailable";
  health: number;
  roster: Player[];
  waiverPlayers: WaiverPlayer[];
  opponentName: string;
  opponentProjection: number;
  preDraft?: boolean;
  issues: {
    id: string;
    severity: "critical" | "warning" | "watch";
    category: string;
    title: string;
    detail: string;
  }[];
};

const nav: { label: View; mark: string; tone: string; group: "Portfolio" | "League" | "Live" }[] = [
  { label: "All Leagues", mark: "◆", tone: "violet", group: "Portfolio" },
  { label: "Manage Leagues", mark: "⚙", tone: "slate", group: "Portfolio" },
  { label: "Command Center", mark: "★", tone: "amber", group: "League" },
  { label: "League Stories", mark: "✎", tone: "violet", group: "League" },
  { label: "Manager Report", mark: "✓", tone: "teal", group: "League" },
  { label: "My Team", mark: "♟", tone: "blue", group: "League" },
  { label: "Dynasty Analytics", mark: "◈", tone: "purple", group: "League" },
  { label: "Team Rankings", mark: "↥", tone: "teal", group: "League" },
  { label: "Player Rankings", mark: "♛", tone: "gold", group: "League" },
  { label: "ADP", mark: "⌁", tone: "cyan", group: "League" },
  { label: "Start / Sit", mark: "⚡", tone: "orange", group: "League" },
  { label: "Waiver Wire", mark: "+", tone: "emerald", group: "League" },
  { label: "Trade Lab", mark: "↔", tone: "pink", group: "League" },
  { label: "Simulator", mark: "✦", tone: "indigo", group: "League" },
  { label: "Scoreboard", mark: "▣", tone: "red", group: "Live" },
  { label: "NFL Games", mark: "●", tone: "football", group: "Live" },
  { label: "Matchups", mark: "◎", tone: "sky", group: "Live" },
];

const normalizeNflTeam = (team: string) =>
  (({ JAC: "JAX", WSH: "WAS" }) as Record<string, string>)[team] ?? team;
const isStartingPlayer = (player: Player) =>
  !["Bench", "IR", "TAXI"].includes(player.role);
const formatRosterSlot = (slot: string) => slot.replace(/_/g, " ");
const nflThemes = [
  {
    id: "ARI",
    name: "Arizona Cardinals",
    primary: "#97233F",
    secondary: "#000000",
  },
  {
    id: "ATL",
    name: "Atlanta Falcons",
    primary: "#A71930",
    secondary: "#000000",
  },
  {
    id: "BAL",
    name: "Baltimore Ravens",
    primary: "#241773",
    secondary: "#9E7C0C",
  },
  {
    id: "BUF",
    name: "Buffalo Bills",
    primary: "#00338D",
    secondary: "#C60C30",
  },
  {
    id: "CAR",
    name: "Carolina Panthers",
    primary: "#0085CA",
    secondary: "#101820",
  },
  {
    id: "CHI",
    name: "Chicago Bears",
    primary: "#0B162A",
    secondary: "#C83803",
  },
  {
    id: "CIN",
    name: "Cincinnati Bengals",
    primary: "#FB4F14",
    secondary: "#000000",
  },
  {
    id: "CLE",
    name: "Cleveland Browns",
    primary: "#311D00",
    secondary: "#FF3C00",
  },
  {
    id: "DAL",
    name: "Dallas Cowboys",
    primary: "#003594",
    secondary: "#869397",
  },
  {
    id: "DEN",
    name: "Denver Broncos",
    primary: "#FB4F14",
    secondary: "#002244",
  },
  {
    id: "DET",
    name: "Detroit Lions",
    primary: "#0076B6",
    secondary: "#B0B7BC",
  },
  {
    id: "GB",
    name: "Green Bay Packers",
    primary: "#203731",
    secondary: "#FFB612",
  },
  {
    id: "HOU",
    name: "Houston Texans",
    primary: "#03202F",
    secondary: "#A71930",
  },
  {
    id: "IND",
    name: "Indianapolis Colts",
    primary: "#002C5F",
    secondary: "#A2AAAD",
  },
  {
    id: "JAX",
    name: "Jacksonville Jaguars",
    primary: "#006778",
    secondary: "#D7A22A",
  },
  {
    id: "KC",
    name: "Kansas City Chiefs",
    primary: "#E31837",
    secondary: "#FFB81C",
  },
  {
    id: "LV",
    name: "Las Vegas Raiders",
    primary: "#000000",
    secondary: "#A5ACAF",
  },
  {
    id: "LAC",
    name: "Los Angeles Chargers",
    primary: "#0080C6",
    secondary: "#FFC20E",
  },
  {
    id: "LAR",
    name: "Los Angeles Rams",
    primary: "#003594",
    secondary: "#FFA300",
  },
  {
    id: "MIA",
    name: "Miami Dolphins",
    primary: "#008E97",
    secondary: "#FC4C02",
  },
  {
    id: "MIN",
    name: "Minnesota Vikings",
    primary: "#4F2683",
    secondary: "#FFC62F",
  },
  {
    id: "NE",
    name: "New England Patriots",
    primary: "#002244",
    secondary: "#C60C30",
  },
  {
    id: "NO",
    name: "New Orleans Saints",
    primary: "#101820",
    secondary: "#D3BC8D",
  },
  {
    id: "NYG",
    name: "New York Giants",
    primary: "#0B2265",
    secondary: "#A71930",
  },
  {
    id: "NYJ",
    name: "New York Jets",
    primary: "#125740",
    secondary: "#000000",
  },
  {
    id: "PHI",
    name: "Philadelphia Eagles",
    primary: "#004C54",
    secondary: "#A5ACAF",
  },
  {
    id: "PIT",
    name: "Pittsburgh Steelers",
    primary: "#101820",
    secondary: "#FFB612",
  },
  {
    id: "SF",
    name: "San Francisco 49ers",
    primary: "#AA0000",
    secondary: "#B3995D",
  },
  {
    id: "SEA",
    name: "Seattle Seahawks",
    primary: "#002244",
    secondary: "#69BE28",
  },
  {
    id: "TB",
    name: "Tampa Bay Buccaneers",
    primary: "#D50A0A",
    secondary: "#34302B",
  },
  {
    id: "TEN",
    name: "Tennessee Titans",
    primary: "#0C2340",
    secondary: "#4B92DB",
  },
  {
    id: "WAS",
    name: "Washington Commanders",
    primary: "#5A1414",
    secondary: "#FFB612",
  },
] as const;

function colorChannels(hex: string) {
  const value = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : "0b8650";
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function mixColor(hex: string, target: number, strength: number) {
  const mixed = colorChannels(hex).map((channel) =>
    Math.round(channel + (target - channel) * strength),
  );
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function applyWeather(player: Player, weather: WeatherData | null) {
  const game = weather?.games.find((item) =>
    item.teams.includes(normalizeNflTeam(player.team)),
  );
  if (!game) return player;
  return { ...player, weatherAdjustment: 0, weatherSummary: game.summary };
}

function applyOpponent(
  player: Player,
  schedule: NflScheduleData | null,
  week: number,
) {
  if (!schedule) return player;
  const team = normalizeNflTeam(player.team);
  const game = schedule.weeks
    .find((item) => item.week === week)
    ?.games.find(
      (item) =>
        normalizeNflTeam(item.away.abbreviation) === team ||
        normalizeNflTeam(item.home.abbreviation) === team,
    );
  if (!game) return { ...player, opponent: "BYE" };
  const isAway = normalizeNflTeam(game.away.abbreviation) === team;
  const opponent = isAway
    ? normalizeNflTeam(game.home.abbreviation)
    : normalizeNflTeam(game.away.abbreviation);
  return { ...player, opponent: `${isAway ? "@" : "vs"} ${opponent}` };
}

const opponentCode = (opponent: string) => opponent.replace(/^(vs|@)\s+/, "").trim();
const matchupPosition = (position: string) => position === "FB" ? "RB" : position;
function applyMatchupStrength(player: Player, data: MatchupStrengthData | null) {
  const opponent = opponentCode(player.opponent);
  return {
    ...player,
    matchupStrength: data?.positions[matchupPosition(player.position)]?.[opponent] ?? null,
    matchupSourceSeason: data?.sourceSeason,
  };
}

function MatchupBadge({ player }: { player: Pick<Player, "position" | "opponent" | "matchupStrength" | "matchupSourceSeason"> }) {
  if (player.opponent === "BYE") return <span className="matchup-team bye">BYE</span>;
  const strength = player.matchupStrength;
  if (!strength) return <span className="matchup-team neutral">{player.opponent}</span>;
  const hue = Math.round((strength.score / 100) * 120);
  return (
    <span
      className="matchup-team"
      style={{ "--matchup-hue": hue, "--matchup-position": `${strength.score}%` } as CSSProperties}
      title={`${player.matchupSourceSeason ?? 2025} ${matchupPosition(player.position)} matchup: ${strength.label}, ${strength.rank}${strength.rank === 1 ? "st" : strength.rank === 2 ? "nd" : strength.rank === 3 ? "rd" : "th"} most PPR fantasy points allowed (${strength.pointsAllowed.toFixed(1)} per game)`}
    >
      <b>{player.opponent}</b>
      <span><i />{strength.label} · #{strength.rank}</span>
    </span>
  );
}

function matchupAdjustedRange(player: Player) {
  const strength = player.matchupStrength;
  if (!strength) return { floor: player.floor, ceiling: player.ceiling, edge: 0, confidence: 0 };
  const confidence = Math.min(1, strength.games / 8);
  const edge = ((strength.score - 50) / 50) * confidence;
  const floorFactor = 1 + edge * (edge >= 0 ? 0.04 : 0.12);
  const ceilingFactor = 1 + edge * (edge >= 0 ? 0.12 : 0.04);
  return {
    floor: Number(Math.max(0, player.floor * floorFactor).toFixed(1)),
    ceiling: Number(Math.max(player.projection, player.ceiling * ceilingFactor).toFixed(1)),
    edge,
    confidence,
  };
}

const rankedPlayers: RankedPlayer[] = [
  {
    id: "rank-1",
    name: "Ja'Marr Chase",
    position: "WR",
    team: "CIN",
    opponent: "vs PIT",
    projection: 22.8,
    floor: 14.1,
    ceiling: 35.4,
    trend: 1.8,
    status: "Healthy",
    role: "WR1",
    overallRank: 1,
    positionRank: 1,
    tier: 1,
    outlook: "League-winning target volume and touchdown ceiling.",
  },
  {
    id: "1",
    name: "Jahmyr Gibbs",
    position: "RB",
    team: "DET",
    opponent: "@ GB",
    projection: 20.8,
    floor: 13.2,
    ceiling: 31.4,
    trend: 2.1,
    status: "Healthy",
    role: "RB1",
    overallRank: 2,
    positionRank: 1,
    tier: 1,
    outlook: "Elite efficiency, receiving work, and explosive-play access.",
  },
  {
    id: "rank-3",
    name: "Bijan Robinson",
    position: "RB",
    team: "ATL",
    opponent: "vs NO",
    projection: 21.2,
    floor: 13.8,
    ceiling: 32.1,
    trend: 1.2,
    status: "Healthy",
    role: "RB1",
    overallRank: 3,
    positionRank: 2,
    tier: 1,
    outlook: "Three-down usage creates one of fantasy's safest ceilings.",
  },
  {
    id: "rank-4",
    name: "Justin Jefferson",
    position: "WR",
    team: "MIN",
    opponent: "@ CHI",
    projection: 21.5,
    floor: 13.5,
    ceiling: 34.2,
    trend: 0.9,
    status: "Healthy",
    role: "WR1",
    overallRank: 4,
    positionRank: 2,
    tier: 1,
    outlook: "Elite talent and historical production sustain a top-tier range.",
  },
  {
    id: "2",
    name: "CeeDee Lamb",
    position: "WR",
    team: "DAL",
    opponent: "vs NYG",
    projection: 19.4,
    floor: 11.8,
    ceiling: 30.2,
    trend: 1.4,
    status: "Healthy",
    role: "WR1",
    overallRank: 5,
    positionRank: 3,
    tier: 1,
    outlook:
      "Dominant target share keeps both floor and spike-week upside intact.",
  },
  {
    id: "rank-6",
    name: "Josh Allen",
    position: "QB",
    team: "BUF",
    opponent: "vs MIA",
    projection: 24.9,
    floor: 17.2,
    ceiling: 36.5,
    trend: 0.6,
    status: "Healthy",
    role: "QB1",
    overallRank: 6,
    positionRank: 1,
    tier: 1,
    outlook:
      "Rushing equity separates him from most weekly quarterback outcomes.",
  },
  {
    id: "rank-7",
    name: "Amon-Ra St. Brown",
    position: "WR",
    team: "DET",
    opponent: "@ GB",
    projection: 20.1,
    floor: 13.1,
    ceiling: 29.8,
    trend: 1.1,
    status: "Healthy",
    role: "WR1",
    overallRank: 7,
    positionRank: 4,
    tier: 2,
    outlook: "High-confidence volume anchors an elite weekly floor.",
  },
  {
    id: "3",
    name: "Trey McBride",
    position: "TE",
    team: "ARI",
    opponent: "@ LAR",
    projection: 15.7,
    floor: 9.6,
    ceiling: 24.8,
    trend: 1.8,
    status: "Healthy",
    role: "TE1",
    overallRank: 8,
    positionRank: 1,
    tier: 2,
    outlook: "Wide-receiver usage at tight end creates positional leverage.",
  },
  {
    id: "rank-9",
    name: "Brock Bowers",
    position: "TE",
    team: "LV",
    opponent: "@ DEN",
    projection: 15.3,
    floor: 9.1,
    ceiling: 25.2,
    trend: 1.3,
    status: "Healthy",
    role: "TE1",
    overallRank: 9,
    positionRank: 2,
    tier: 2,
    outlook: "Target earning and yards after catch support elite TE upside.",
  },
  {
    id: "rank-10",
    name: "Lamar Jackson",
    position: "QB",
    team: "BAL",
    opponent: "vs CLE",
    projection: 23.7,
    floor: 16.2,
    ceiling: 35.1,
    trend: 0.4,
    status: "Healthy",
    role: "QB1",
    overallRank: 10,
    positionRank: 2,
    tier: 2,
    outlook: "Dual-threat ceiling remains capable of deciding a matchup.",
  },
  {
    id: "rank-11",
    name: "Saquon Barkley",
    position: "RB",
    team: "PHI",
    opponent: "@ WAS",
    projection: 19.2,
    floor: 11.7,
    ceiling: 30.8,
    trend: -0.2,
    status: "Healthy",
    role: "RB1",
    overallRank: 11,
    positionRank: 3,
    tier: 2,
    outlook:
      "High-value touches preserve elite upside with modest workload risk.",
  },
  {
    id: "rank-12",
    name: "Puka Nacua",
    position: "WR",
    team: "LAR",
    opponent: "vs ARI",
    projection: 19.6,
    floor: 11.9,
    ceiling: 31.6,
    trend: 0.8,
    status: "Healthy",
    role: "WR1",
    overallRank: 12,
    positionRank: 5,
    tier: 2,
    outlook: "Volume and after-catch production drive a strong weekly range.",
  },
  {
    id: "rank-13",
    name: "Jalen Hurts",
    position: "QB",
    team: "PHI",
    opponent: "@ WAS",
    projection: 22.9,
    floor: 15.8,
    ceiling: 33.7,
    trend: 0.1,
    status: "Healthy",
    role: "QB1",
    overallRank: 13,
    positionRank: 3,
    tier: 3,
    outlook:
      "Goal-line role protects his ceiling even when passing volume dips.",
  },
  {
    id: "rank-14",
    name: "De'Von Achane",
    position: "RB",
    team: "MIA",
    opponent: "@ BUF",
    projection: 18.6,
    floor: 9.8,
    ceiling: 33.2,
    trend: 1.5,
    status: "Healthy",
    role: "RB1",
    overallRank: 14,
    positionRank: 4,
    tier: 3,
    outlook: "Volatility is offset by rare per-touch upside.",
  },
  {
    id: "rank-15",
    name: "George Kittle",
    position: "TE",
    team: "SF",
    opponent: "vs SEA",
    projection: 13.8,
    floor: 7.4,
    ceiling: 23.9,
    trend: -0.7,
    status: "Questionable",
    role: "TE1",
    overallRank: 15,
    positionRank: 3,
    tier: 3,
    outlook:
      "Efficiency remains elite, with availability and volume adding risk.",
  },
  {
    id: "rank-16",
    name: "Malik Nabers",
    position: "WR",
    team: "NYG",
    opponent: "@ DAL",
    projection: 18.2,
    floor: 10.7,
    ceiling: 29.7,
    trend: 1.6,
    status: "Healthy",
    role: "WR1",
    overallRank: 16,
    positionRank: 6,
    tier: 3,
    outlook: "Target dominance supports WR1 outcomes despite team volatility.",
  },
];

export default function FantasyHub({
  accountUser,
}: {
  accountUser: AccountUser | null;
}) {
  const [view, setView] = useState<View>("All Leagues");
  const [players, setPlayers] = useState<Player[]>([]);
  const [leagueId, setLeagueId] = useState("");
  const [leagueName, setLeagueName] = useState("No league selected");
  const [importState, setImportState] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [starterChoice, setStarterChoice] = useState("Rome Odunze");
  const [simulations, setSimulations] = useState(10000);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [leagueTeams, setLeagueTeams] = useState<LeagueTeam[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [leagueRankings, setLeagueRankings] = useState<LeagueRanking[]>([]);
  const [rankingContext, setRankingContext] = useState<RankingContext | null>(
    null,
  );
  const [waiverPlayers, setWaiverPlayers] = useState<WaiverPlayer[]>([]);
  const [leagueStatus, setLeagueStatus] = useState("unknown");
  const [leagueWeek, setLeagueWeek] = useState(0);
  const [leagueSeason, setLeagueSeason] = useState(
    String(new Date().getFullYear()),
  );
  const [connection, setConnection] = useState<SleeperConnection | null>(null);
  const [leaguePlatform, setLeaguePlatform] = useState("Sleeper");
  const [availableLeagues, setAvailableLeagues] = useState<ConnectedLeague[]>(
    [],
  );
  const [managedLeagues, setManagedLeagues] = useState<ManagedLeague[]>([]);
  const [portfolioScans, setPortfolioScans] = useState<LeagueScan[]>([]);
  const [selectedMatchupId, setSelectedMatchupId] = useState<number | null>(
    null,
  );
  const [scoreboardScope, setScoreboardScope] = useState<"all" | "league">("all");
  const [accountLoading, setAccountLoading] = useState(Boolean(accountUser));
  const [accountError, setAccountError] = useState("");
  const [theme, setTheme] = useState<Theme>("light");
  const [teamTheme, setTeamTheme] = useState("GB");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [draggedLeagueId, setDraggedLeagueId] = useState("");
  const [leagueDropTarget, setLeagueDropTarget] = useState<{
    id: string;
    position: "before" | "after";
  } | null>(null);
  const importRequest = useRef(0);
  const leagueDragOccurred = useRef(false);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("fantasy-hub-theme");
    const savedTeamTheme = window.localStorage.getItem(
      "fantasy-hub-team-theme",
    );
    const savedSidebarState = window.localStorage.getItem(
      "fantasy-hub-sidebar-collapsed",
    );
    const initialTheme: Theme =
      savedTheme === "light" || savedTheme === "dark"
        ? savedTheme
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    const timer = window.setTimeout(() => {
      setTheme(initialTheme);
      setSidebarCollapsed(savedSidebarState === "true");
      if (
        savedTeamTheme &&
        nflThemes.some((team) => team.id === savedTeamTheme)
      )
        setTeamTheme(savedTeamTheme);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem("fantasy-hub-theme", theme);
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    const selectedTheme =
      nflThemes.find((team) => team.id === teamTheme) ??
      nflThemes.find((team) => team.id === "GB")!;
    const primaryColor = selectedTheme.primary;
    const secondaryBrightness =
      colorChannels(selectedTheme.secondary).reduce(
        (sum, channel) => sum + channel,
        0,
      ) / 3;
    const secondaryColor =
      secondaryBrightness < 80
        ? mixColor(selectedTheme.secondary, 255, 0.48)
        : selectedTheme.secondary;
    const primaryRgb = colorChannels(primaryColor).join(" ");
    const secondaryRgb = colorChannels(secondaryColor).join(" ");
    root.style.setProperty("--green", primaryColor);
    root.style.setProperty("--green-2", mixColor(primaryColor, 255, 0.16));
    root.style.setProperty("--deep", mixColor(primaryColor, 0, 0.62));
    root.style.setProperty("--lime", secondaryColor);
    root.style.setProperty("--gold", mixColor(secondaryColor, 0, 0.08));
    root.style.setProperty("--gold-light", mixColor(secondaryColor, 255, 0.22));
    root.style.setProperty("--brand-primary-rgb", primaryRgb);
    root.style.setProperty("--brand-secondary-rgb", secondaryRgb);
    root.dataset.nflTheme = selectedTheme.id;
    window.localStorage.setItem("fantasy-hub-team-theme", selectedTheme.id);
    window.localStorage.removeItem("fantasy-hub-primary");
    window.localStorage.removeItem("fantasy-hub-secondary");
  }, [teamTheme]);

  useEffect(() => {
    if (!accountUser) return;
    void (async () => {
      try {
        const response = await fetch("/api/account");
        if (!response.ok) throw new Error("Account unavailable");
        const data = (await response.json()) as {
          connection?: SleeperConnection | null;
        };
        setConnection(data.connection ?? null);
        setAccountLoading(false);
        const results = await Promise.allSettled([
          loadManagedLeagues(),
          loadLeagues(true),
        ]);
        if (results.some((result) => result.status === "rejected"))
          setAccountError(
            "Some league data is still loading. Fantasy Hub will keep retrying as you navigate.",
          );
      } catch {
        setAccountError(
          "We couldn’t load your Fantasy Hub account. Refresh and try again.",
        );
      } finally {
        setAccountLoading(false);
      }
    })();
    // Account bootstrap intentionally runs only when the authenticated user changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountUser]);

  useEffect(() => {
    if (!accountUser || !portfolioScans.length) return;
    const cacheKey = `fantasy-hub-portfolio-scans:${connection?.sleeperUserId ?? accountUser.email}`;
    if (portfolioScans.some((scan) => scan.status === "unavailable")) {
      window.localStorage.removeItem(cacheKey);
      return;
    }
    window.localStorage.setItem(cacheKey, JSON.stringify({
      version: PORTFOLIO_CACHE_VERSION,
      savedAt: Date.now(),
      scans: portfolioScans,
    }));
  }, [accountUser, connection, portfolioScans]);

  const totals = useMemo(
    () => ({
      projection: players
        .filter(isStartingPlayer)
        .reduce((sum, p) => sum + p.projection, 0),
      ceiling: players
        .filter(isStartingPlayer)
        .reduce((sum, p) => sum + p.ceiling, 0),
    }),
    [players],
  );

  async function importLeague(idOverride?: string, ownerIdOverride?: string, rosterIdOverride?: string) {
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
    setLeagueWeek(0);
    setSelectedPlayer(null);
    try {
      const response = await fetch(
        `/api/league?id=${encodeURIComponent(requestedLeagueId)}`,
      );
      if (!response.ok) throw new Error("League not found");
      const data = (await response.json()) as {
        league: {
          name: string;
          platform?: string;
          status?: string;
          season?: string;
          currentWeek?: number;
        };
        teams?: LeagueTeam[];
        rankings?: LeagueRanking[];
        waiverPlayers?: WaiverPlayer[];
        rankingContext?: RankingContext;
      };
      if (requestNumber !== importRequest.current) return;
      const season = data.league.season ?? String(new Date().getFullYear());
      const currentWeek = Math.max(1, data.league.currentWeek ?? 1);
      let weather: WeatherData | null = null;
      let schedule: NflScheduleData | null = null;
      let matchupStrengths: MatchupStrengthData | null = null;
      try {
        const [weatherPayload, scheduleResponse, matchupResponse] = await Promise.all([
          loadWeatherData(season, currentWeek),
          fetch(`/api/nfl-schedule?season=${encodeURIComponent(season)}`),
          fetch(`/api/matchup-strength?season=${encodeURIComponent(season)}`),
        ]);
        weather = weatherPayload;
        if (scheduleResponse.ok)
          schedule = (await scheduleResponse.json()) as NflScheduleData;
        if (matchupResponse.ok)
          matchupStrengths = (await matchupResponse.json()) as MatchupStrengthData;
      } catch {
        /* Schedule and weather enrichment are optional; core roster loading continues. */
      }
      if (requestNumber !== importRequest.current) return;
      setLeagueName(data.league.name);
      setLeaguePlatform(data.league.platform ?? "Sleeper");
      const importedTeams = (data.teams ?? []).map((team) => ({
        ...team,
        roster: team.roster.map((player) =>
          applyMatchupStrength(applyWeather(applyOpponent(player, schedule, currentWeek), weather), matchupStrengths),
        ),
      }));
      setLeagueTeams(importedTeams);
      const ownedTeam = rosterIdOverride
        ? importedTeams.find((team) => team.id === rosterIdOverride)
        : ownerIdOverride
        ? importedTeams.find((team) => team.ownerId === ownerIdOverride)
        : undefined;
      if (ownedTeam || importedTeams.length === 1) {
        const activeTeam = ownedTeam ?? importedTeams[0];
        setSelectedTeamId(activeTeam.id);
        setPlayers(activeTeam.roster);
      } else {
        setSelectedTeamId("");
      }
      setLeagueRankings(
        (data.rankings ?? []).map((player) =>
          applyMatchupStrength(applyWeather(applyOpponent(player, schedule, currentWeek), weather), matchupStrengths),
        ),
      );
      setWaiverPlayers(
        (data.waiverPlayers ?? []).map((player) =>
          applyMatchupStrength(applyWeather(applyOpponent(player, schedule, currentWeek), weather), matchupStrengths),
        ),
      );
      setLeagueStatus(data.league.status ?? "unknown");
      setLeagueWeek(data.league.currentWeek ?? 0);
      setLeagueSeason(season);
      setRankingContext(data.rankingContext ?? null);
      setImportState("success");
    } catch {
      if (requestNumber !== importRequest.current) return;
      setImportState("error");
    }
  }

  async function loadLeagues(activateFirst = false) {
    const response = await fetch("/api/account/leagues");
    if (!response.ok) throw new Error("Leagues unavailable");
    const data = (await response.json()) as {
      connection: SleeperConnection | null;
      leagues: ConnectedLeague[];
    };
    const savedOrder = (() => {
      try {
        return JSON.parse(
          window.localStorage.getItem("fantasy-hub-league-order") ?? "[]",
        ) as string[];
      } catch {
        return [];
      }
    })();
    const orderIndex = new Map(savedOrder.map((id, index) => [id, index]));
    const orderedLeagues = [...data.leagues].sort((a, b) => {
      const aIndex = orderIndex.get(a.id);
      const bIndex = orderIndex.get(b.id);
      if (aIndex == null && bIndex == null) return 0;
      if (aIndex == null) return 1;
      if (bIndex == null) return -1;
      return aIndex - bIndex;
    });
    try {
      const cached = JSON.parse(
        window.localStorage.getItem(
          `fantasy-hub-portfolio-scans:${data.connection?.sleeperUserId ?? accountUser?.email ?? "account"}`,
        ) ?? "null",
      ) as { version?: number; savedAt?: number; scans?: LeagueScan[] } | null;
      const leagueIds = new Set(orderedLeagues.map((league) => league.id));
      if (
        cached?.version === PORTFOLIO_CACHE_VERSION &&
        cached.savedAt &&
        Date.now() - cached.savedAt <= PORTFOLIO_CACHE_TTL &&
        cached.scans?.length === orderedLeagues.length &&
        cached.scans.every((scan) => leagueIds.has(scan.league.id))
      )
        setPortfolioScans(cached.scans);
    } catch {
      window.localStorage.removeItem(
        `fantasy-hub-portfolio-scans:${data.connection?.sleeperUserId ?? accountUser?.email ?? "account"}`,
      );
    }
    if (data.connection) setConnection(data.connection);
    setAvailableLeagues(orderedLeagues);
    if (activateFirst && orderedLeagues.length) {
      const defaultLeague = orderedLeagues[0];
      setLeagueId(defaultLeague.id);
      setLeagueName(defaultLeague.name);
      await importLeague(defaultLeague.id, data.connection?.sleeperUserId, defaultLeague.rosterId);
    }
  }

  function moveConnectedLeague(leagueIdToMove: string, direction: -1 | 1) {
    setAvailableLeagues((current) => {
      const currentIndex = current.findIndex(
        (league) => league.id === leagueIdToMove,
      );
      const nextIndex = currentIndex + direction;
      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= current.length)
        return current;
      const ordered = [...current];
      [ordered[currentIndex], ordered[nextIndex]] = [
        ordered[nextIndex],
        ordered[currentIndex],
      ];
      window.localStorage.setItem(
        "fantasy-hub-league-order",
        JSON.stringify(ordered.map((league) => league.id)),
      );
      return ordered;
    });
  }

  function dropConnectedLeague(
    targetLeagueId: string,
    position: "before" | "after",
  ) {
    if (!draggedLeagueId) return;
    reorderConnectedLeague(draggedLeagueId, targetLeagueId, position);
  }

  function reorderConnectedLeague(
    sourceLeagueId: string,
    targetLeagueId: string,
    position: "before" | "after",
  ) {
    if (sourceLeagueId === targetLeagueId) return;
    setAvailableLeagues((current) => {
      const fromIndex = current.findIndex(
        (league) => league.id === sourceLeagueId,
      );
      if (fromIndex < 0) return current;
      const ordered = [...current];
      const [moved] = ordered.splice(fromIndex, 1);
      const targetIndex = ordered.findIndex(
        (league) => league.id === targetLeagueId,
      );
      if (targetIndex < 0) return current;
      ordered.splice(targetIndex + (position === "after" ? 1 : 0), 0, moved);
      window.localStorage.setItem(
        "fantasy-hub-league-order",
        JSON.stringify(ordered.map((league) => league.id)),
      );
      return ordered;
    });
  }

  async function loadManagedLeagues() {
    const response = await fetch("/api/account/managed-leagues");
    if (!response.ok) throw new Error("Saved leagues unavailable");
    const data = (await response.json()) as { leagues: ManagedLeague[] };
    setManagedLeagues(data.leagues);
  }

  async function connectSleeper(usernameOverride?: string) {
    const username = usernameOverride?.trim() ?? "";
    if (!username) return false;
    setAccountError("");
    try {
      const response = await fetch("/api/account", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const data = (await response.json()) as {
        connection?: SleeperConnection;
        error?: string;
      };
      if (!response.ok || !data.connection)
        throw new Error(data.error ?? "Unable to connect account");
      setConnection(data.connection);
      await loadLeagues();
      return true;
    } catch (error) {
      setAccountError(
        error instanceof Error ? error.message : "Unable to connect account",
      );
      return false;
    }
  }

  async function addManagedLeague(
    provider: LeagueProvider,
    identifierType: "username" | "league_id",
    identifier: string,
    rosterId?: string,
  ) {
    setAccountError("");
    if (provider === "sleeper" && identifierType === "username") {
      const connected = await connectSleeper(identifier);
      if (!connected)
        throw new Error("Unable to connect that Sleeper username");
    }
    const response = await fetch("/api/account/managed-leagues", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider, identifierType, identifier, rosterId }),
    });
    const data = (await response.json()) as {
      league?: ManagedLeague;
      teamSelection?: { id: string; name: string; season: string; teams: { id: string; name: string; managerName: string }[] };
      error?: string;
    };
    if (!response.ok)
      throw new Error(data.error ?? "Unable to save league");
    if (data.teamSelection) return data.teamSelection;
    if (!data.league) throw new Error(data.error ?? "Unable to save league");
    await loadManagedLeagues();
    if (provider === "sleeper" && identifierType === "league_id") {
      setLeagueId(identifier);
      await importLeague(identifier, connection?.sleeperUserId);
    }
    await loadLeagues();
    return null;
  }

  async function removeManagedLeague(id: string) {
    const response = await fetch(
      `/api/account/managed-leagues?id=${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
    if (!response.ok) throw new Error("Unable to remove league connection");
    setManagedLeagues((current) =>
      current.filter((league) => league.id !== id),
    );
  }

  async function openConnectedLeague(league: ConnectedLeague) {
    setLeagueId(league.id);
    setLeagueName(league.name);
    if (league.format !== "Dynasty" && view === "Dynasty Analytics")
      setView("Command Center");
    await importLeague(league.id, connection?.sleeperUserId, league.rosterId);
  }

  function selectLeagueTeam(teamId: string) {
    setSelectedTeamId(teamId);
    const team = leagueTeams.find((candidate) => candidate.id === teamId);
    setPlayers(team?.roster ?? []);
    setSelectedPlayer(null);
  }

  const selectedLeagueTeam = leagueTeams.find(
    (team) => team.id === selectedTeamId,
  );
  const selectedConnectedLeague = availableLeagues.find(
    (league) => league.id === leagueId,
  );
  const isDynastyLeague =
    selectedConnectedLeague?.format === "Dynasty" ||
    rankingContext?.format === "Dynasty";
  const visibleNav = nav.filter(
    (item) => item.label !== "Dynasty Analytics" || isDynastyLeague,
  );
  const rosterReady = players.length > 0;
  const periodLabel =
    leagueStatus === "pre_draft" || leagueWeek < 1
      ? "PRESEASON"
      : leagueStatus === "complete"
        ? "SEASON COMPLETE"
        : `WEEK ${leagueWeek}`;
  const defaultGameWeek =
    leagueStatus === "pre_draft" || leagueWeek < 1
      ? 1
      : Math.min(18, leagueWeek);
  const rosterEmptyState = (
    <EmptyRoster
      leagueSelected={Boolean(leagueId)}
      loading={importState === "loading"}
      leagueName={leagueName}
    />
  );

  if (!accountUser) return <SignInScreen />;
  if (accountLoading) return <AccountLoading />;
  return (
    <ProjectionPlatformContext.Provider value={leaguePlatform}>
    <PlayerOpenContext.Provider value={setSelectedPlayer}>
    <main
      className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}
      data-release="scoreboard-render-fix-2"
    >
      <aside className="sidebar">
        <button
          className="sidebar-collapse"
          type="button"
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!sidebarCollapsed}
          title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={() => {
            setSidebarCollapsed((current) => {
              window.localStorage.setItem(
                "fantasy-hub-sidebar-collapsed",
                String(!current),
              );
              return !current;
            });
          }}
        >
          <span aria-hidden="true">{sidebarCollapsed ? "›" : "‹"}</span>
        </button>
        <div className="brand">
          <span className="brand-mark">FH</span>
          <div>
            <strong>Fantasy Hub</strong>
            <small>Make every week count.</small>
          </div>
        </div>
        <div className="league-card">
          <span>ACTIVE LEAGUE</span>
          <strong>{leagueName}</strong>
          <small>
            {selectedLeagueTeam ? `${selectedLeagueTeam.teamName} · ` : ""}
            {rankingContext?.scoring ?? "Scoring pending"} · {periodLabel}
          </small>
        </div>
        <nav aria-label="Fantasy Hub sections">
          {(["Portfolio", "Live", "League"] as const).map((group) => (
            <div className="nav-group" key={group}>
              <span>{group}</span>
              {visibleNav.filter((item) => item.group === group).map((item) => (
                <button
                  key={item.label}
                  className={view === item.label ? "active" : ""}
                  onClick={() => {
                    if (item.label === "Matchups") setSelectedMatchupId(null);
                    if (item.label === "Scoreboard") setScoreboardScope("all");
                    setView(item.label);
                  }}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  <i className={`nav-badge ${item.tone}`} aria-hidden="true">
                    {item.mark}
                  </i>
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className="theme-toggle"
            type="button"
            role="switch"
            aria-checked={theme === "dark"}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            onClick={() =>
              setTheme((current) => (current === "light" ? "dark" : "light"))
            }
          >
            <span aria-hidden="true">{theme === "dark" ? "☾" : "☀"}</span>
            <b>{theme === "dark" ? "Dark mode" : "Light mode"}</b>
            <i aria-hidden="true">
              <em />
            </i>
          </button>
          <div>
            <span className="live-dot" /> DATA CURRENT
          </div>
          <small>Lineups lock Sunday · 12:00 PM</small>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p>
              {periodLabel} · {leagueSeason} SEASON
            </p>
            <h1>{view}</h1>
          </div>
          <div className="top-actions">
            {leagueId && (
              <a
                className="platform-open"
                href={selectedConnectedLeague ? platformLeagueUrl(selectedConnectedLeague) : sleeperLeagueUrl(leagueId)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${platformActionLabel(view, leaguePlatform)} (opens in a new tab)`}
              >
                <PlatformLogo provider={leaguePlatform} />
                <span>{platformActionLabel(view, leaguePlatform)}</span>
                <b aria-hidden="true">↗</b>
              </a>
            )}
            <button className="ghost season-roll" onClick={() => setView("Simulator")}>
              Sim the season 🎲
            </button>
            <a
              className="account-chip"
              href="/signout-with-chatgpt?return_to=/"
            >
              <span>{accountUser.displayName.slice(0, 1).toUpperCase()}</span>
              <small>
                {connection?.displayName ?? accountUser.displayName}
                <b>Sign out</b>
              </small>
            </a>
          </div>
        </header>

        {view !== "Manage Leagues" && availableLeagues.length > 0 && (
          <section className="league-switcher">
            <div>
              <span>MY LEAGUES</span>
              <strong>{availableLeagues.length} leagues connected</strong>
              <small>
                Choose a league and Fantasy Hub will open your roster
                automatically.
              </small>
            </div>
            <div
              className={`league-pills ${draggedLeagueId ? "drag-active" : ""}`}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                  setLeagueDropTarget(null);
              }}
            >
              {availableLeagues.map((league) => (
                <button
                  key={league.id}
                  className={`${leagueId === league.id ? "active" : ""} ${draggedLeagueId === league.id ? "dragging" : ""} ${leagueDropTarget?.id === league.id && draggedLeagueId !== league.id ? `drop-${leagueDropTarget.position}` : ""}`}
                  draggable
                  onDragStart={(event) => {
                    leagueDragOccurred.current = true;
                    setDraggedLeagueId(league.id);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", league.id);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    if (draggedLeagueId !== league.id) {
                      const bounds = event.currentTarget.getBoundingClientRect();
                      setLeagueDropTarget({
                        id: league.id,
                        position:
                          event.clientX < bounds.left + bounds.width / 2
                            ? "before"
                            : "after",
                      });
                    }
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (draggedLeagueId !== league.id) {
                      const bounds = event.currentTarget.getBoundingClientRect();
                      dropConnectedLeague(
                        league.id,
                        event.clientX < bounds.left + bounds.width / 2
                          ? "before"
                          : "after",
                      );
                    }
                    setLeagueDropTarget(null);
                  }}
                  onDragEnd={() => {
                    setDraggedLeagueId("");
                    setLeagueDropTarget(null);
                    window.setTimeout(() => {
                      leagueDragOccurred.current = false;
                    }, 0);
                  }}
                  onKeyDown={(event) => {
                    if (!event.altKey) return;
                    if (event.key === "ArrowLeft") {
                      event.preventDefault();
                      moveConnectedLeague(league.id, -1);
                    }
                    if (event.key === "ArrowRight") {
                      event.preventDefault();
                      moveConnectedLeague(league.id, 1);
                    }
                  }}
                  onClick={() => {
                    if (!leagueDragOccurred.current)
                      void openConnectedLeague(league);
                  }}
                  disabled={importState === "loading"}
                  title="Drag to reorder · Alt+Left/Right also moves this league"
                >
                  <i className="league-drag-handle" aria-hidden="true">⋮⋮</i>
                  <b>{league.name}</b>
                  <small>
                    {league.season} · {league.teams} teams · {league.format} ·{" "}
                    {league.scoring}
                  </small>
                </button>
              ))}
            </div>
          </section>
        )}

        {view !== "Manage Leagues" && leagueTeams.length > 1 && (
          <section
            className={`team-picker-strip ${selectedTeamId ? "selected" : ""}`}
          >
            <div>
              <span>
                {selectedTeamId ? "YOUR TEAM IS ACTIVE" : "ONE MORE STEP"}
              </span>
              <strong>
                {selectedLeagueTeam
                  ? selectedLeagueTeam.teamName
                  : "Which team is yours?"}
              </strong>
              <small>
                {selectedLeagueTeam
                  ? `Managed by ${selectedLeagueTeam.managerName}. Your roster now powers every dashboard view.`
                  : "Choose your fantasy team so another manager’s roster never replaces yours."}
              </small>
            </div>
            <label>
              Fantasy team
              <select
                value={selectedTeamId}
                onChange={(event) => selectLeagueTeam(event.target.value)}
              >
                <option value="">Choose your team</option>
                {leagueTeams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.teamName} · {team.managerName}
                  </option>
                ))}
              </select>
            </label>
          </section>
        )}

        {view === "Command Center" &&
          (rosterReady ? (
            <CommandCenter
              players={players}
              waiverPlayers={waiverPlayers}
              totals={totals}
              setView={setView}
              setSelectedPlayer={setSelectedPlayer}
              starterChoice={starterChoice}
              setStarterChoice={setStarterChoice}
              periodLabel={periodLabel}
              context={rankingContext}
            />
          ) : (
            rosterEmptyState
          ))}
        {view === "All Leagues" && (
          <AllLeagues
            leagues={availableLeagues}
            cachedScans={portfolioScans}
            onScansChange={setPortfolioScans}
            onManage={() => setView("Manage Leagues")}
            onOpen={async (league, destination = "Command Center") => {
              await openConnectedLeague(league);
              if (destination === "Scoreboard") setScoreboardScope("league");
              setView(destination);
            }}
          />
        )}
        {view === "League Stories" && (
          <LeagueStories
            key={leagueId || "no-league"}
            leagueId={leagueId}
            setView={setView}
          />
        )}
        {view === "Manager Report" && <ManagerReport key={leagueId || "no-league"} leagueId={leagueId} />}
        {view === "Scoreboard" && (
          scoreboardScope === "all" ? (
            <AllLeagueScoreboard
              leagues={availableLeagues}
              defaultWeek={defaultGameWeek}
              onOpenLeague={async (league) => {
                await openConnectedLeague(league);
                setScoreboardScope("league");
              }}
            />
          ) : (
            <Scoreboard
              key={`${leagueId}-${defaultGameWeek}`}
              leagueId={leagueId}
              defaultWeek={defaultGameWeek}
              onBackAll={() => setScoreboardScope("all")}
              onOpenMatchup={(matchupId) => {
                setSelectedMatchupId(matchupId);
                setView("Matchups");
              }}
            />
          )
        )}
        {view === "NFL Games" && (
          <NflGames
            key={`${leagueId}-${defaultGameWeek}`}
            leagueId={leagueId}
            season={selectedConnectedLeague?.season ?? leagueSeason}
            defaultWeek={defaultGameWeek}
          />
        )}
        {view === "Dynasty Analytics" &&
          isDynastyLeague &&
          (rosterReady ? (
            <DynastyAnalytics
              players={players}
              rankings={leagueRankings}
              context={rankingContext}
              setSelectedPlayer={setSelectedPlayer}
            />
          ) : (
            rosterEmptyState
          ))}
        {view === "My Team" &&
          (rosterReady ? (
            <MyTeam
              players={players}
              context={rankingContext}
              setSelectedPlayer={setSelectedPlayer}
            />
          ) : (
            rosterEmptyState
          ))}
        {view === "Team Rankings" && (
          <TeamRankings
            teams={leagueTeams}
            selectedTeamId={selectedTeamId}
            rankings={leagueRankings}
            context={rankingContext}
            setSelectedPlayer={setSelectedPlayer}
          />
        )}
        {view === "Player Rankings" && (
          <PlayerRanks
            roster={players}
            leagueRankings={leagueRankings}
            context={rankingContext}
            setSelectedPlayer={setSelectedPlayer}
          />
        )}
        {view === "ADP" && (
          <AdpPage
            roster={players}
            leagueRankings={leagueRankings}
            context={rankingContext}
            setSelectedPlayer={setSelectedPlayer}
          />
        )}
        {view === "Start / Sit" &&
          (rosterReady ? (
            <StartSit
              leagueId={leagueId}
              week={defaultGameWeek}
              players={players}
              teams={leagueTeams}
              selectedTeamId={selectedTeamId}
              choice={starterChoice}
              setChoice={setStarterChoice}
              context={rankingContext}
            />
          ) : (
            rosterEmptyState
          ))}
        {view === "Waiver Wire" && (
          <WaiverWire
            leagueId={leagueId}
            week={defaultGameWeek}
            key={leagueId || "no-league"}
            players={waiverPlayers}
            roster={players}
            leagueSelected={Boolean(leagueId)}
            leagueStatus={leagueStatus}
            context={rankingContext}
            setSelectedPlayer={setSelectedPlayer}
          />
        )}
        {view === "Trade Lab" && (
          <TradeLab
            leagueId={leagueId}
            week={defaultGameWeek}
            key={`${leagueId}-${selectedTeamId}`}
            teams={leagueTeams}
            selectedTeamId={selectedTeamId}
            rankings={leagueRankings}
            context={rankingContext}
          />
        )}
        {view === "Matchups" &&
          (rosterReady ? (
            <HeadToHeadMatchup
              key={`${leagueId}-${defaultGameWeek}`}
              leagueId={leagueId}
              defaultWeek={defaultGameWeek}
              initialMatchupId={selectedMatchupId}
            />
          ) : (
            rosterEmptyState
          ))}
        {view === "Simulator" &&
          (rosterReady ? (
            <Simulator
              key={`${leagueId}-${selectedTeamId}`}
              simulations={simulations}
              setSimulations={setSimulations}
              leagueId={leagueId}
              teams={leagueTeams}
              selectedTeamId={selectedTeamId}
              context={rankingContext}
            />
          ) : (
            rosterEmptyState
          ))}
        {view === "Manage Leagues" && (
          <ManageLeagues
            connectedLeagues={availableLeagues}
            managedLeagues={managedLeagues}
            accountError={accountError}
            teamTheme={teamTheme}
            onTeamThemeChange={setTeamTheme}
            onOpen={async (league) => {
              setView("Command Center");
              await openConnectedLeague(league);
            }}
            onAdd={addManagedLeague}
            onRemove={removeManagedLeague}
            onRefresh={async () => {
              await Promise.all([loadManagedLeagues(), loadLeagues()]);
            }}
            onMove={moveConnectedLeague}
            onReorder={reorderConnectedLeague}
          />
        )}
      </section>

      {selectedPlayer && (
        <PlayerPanel
          key={selectedPlayer.id}
          player={selectedPlayer}
          portfolioScans={portfolioScans}
          close={() => setSelectedPlayer(null)}
        />
      )}
    </main>
    </PlayerOpenContext.Provider>
    </ProjectionPlatformContext.Provider>
  );
}

function SignInScreen() {
  return (
    <main className="auth-shell">
      <section className="auth-brand">
        <span className="brand-mark">FH</span>
        <strong>Fantasy Hub</strong>
        <small>Make every week count.</small>
      </section>
      <section className="auth-card">
        <span>YOUR LEAGUES. ONE HOME.</span>
        <h1>
          Set smarter lineups.
          <br />
          <em>Own every matchup.</em>
        </h1>
        <p>
          Sign in to save your Fantasy Hub profile, connect your Sleeper
          username, and open every league from one personalized dashboard.
        </p>
        <a className="auth-primary" href="/signin-with-chatgpt?return_to=/">
          Sign in to Fantasy Hub
        </a>
        <small className="auth-safety">
          Fantasy Hub never asks for or stores your Sleeper password.
        </small>
        <div className="auth-features">
          <b>Command Center</b>
          <b>League Stories</b>
          <b>Manager Report</b>
          <b>Player Rankings</b>
          <b>Waiver Wire</b>
          <b>Trade Lab</b>
        </div>
      </section>
    </main>
  );
}

function AccountLoading() {
  const progress = useEstimatedLoadingProgress(true);
  const roundedProgress = Math.round(progress);
  return (
    <main className="auth-shell account-loading-shell">
      <section className="auth-card auth-loading">
        <span>FANTASY HUB</span>
        <h1>Loading your leagues…</h1>
        <p>Pulling together your saved account and league workspace.</p>
        <div className="load-progress" role="progressbar" aria-label="Loading connected leagues" aria-valuemin={0} aria-valuemax={100} aria-valuenow={roundedProgress}>
          <span style={{ width: `${roundedProgress}%` }} />
        </div>
        <small className="load-progress-label">Connecting to your league portfolio… {roundedProgress}%</small>
        <i />
        <i />
        <i />
      </section>
    </main>
  );
}

function useEstimatedLoadingProgress(active: boolean) {
  const [progress, setProgress] = useState(8);
  useEffect(() => {
    if (!active) return;
    const reset = window.setTimeout(() => setProgress(8), 0);
    const timer = window.setInterval(() => {
      setProgress((current) =>
        Math.min(99, current + Math.max(0.7, (99 - current) * 0.07)),
      );
    }, 350);
    return () => {
      window.clearTimeout(reset);
      window.clearInterval(timer);
    };
  }, [active]);
  return progress;
}

function EmptyRoster({
  leagueSelected,
  loading,
  leagueName,
}: {
  leagueSelected: boolean;
  loading: boolean;
  leagueName: string;
}) {
  const title = loading
    ? `Opening ${leagueName}`
    : leagueSelected
      ? `${leagueName} has not drafted yet`
      : "Choose a league to begin";
  const text = loading
    ? "Fantasy Hub is loading this league’s settings and roster."
    : leagueSelected
      ? "This league is connected, but your roster is currently empty. Fantasy Hub will populate these tools after the draft appears in the league data."
      : "Select one of your leagues above to load its roster, scoring, and lineup settings.";
  return (
    <div className="page-content">
      <SectionIntro
        kicker={loading ? "LOADING LEAGUE" : "ROSTER NOT AVAILABLE"}
        title={title}
        text={text}
      />
      <section className="panel scoreboard-empty">
        {loading
          ? "Loading league data…"
          : leagueSelected
            ? "No players have been assigned to your roster."
            : "No league selected."}
      </section>
    </div>
  );
}

function ManageLeagues({
  connectedLeagues,
  managedLeagues,
  accountError,
  teamTheme,
  onTeamThemeChange,
  onOpen,
  onAdd,
  onRemove,
  onRefresh,
  onMove,
  onReorder,
}: {
  connectedLeagues: ConnectedLeague[];
  managedLeagues: ManagedLeague[];
  accountError: string;
  teamTheme: string;
  onTeamThemeChange: (team: string) => void;
  onOpen: (league: ConnectedLeague) => Promise<void>;
  onAdd: (
    provider: LeagueProvider,
    identifierType: "username" | "league_id",
    identifier: string,
    rosterId?: string,
  ) => Promise<{ id: string; name: string; season: string; teams: { id: string; name: string; managerName: string }[] } | null>;
  onRemove: (id: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  onMove: (id: string, direction: -1 | 1) => void;
  onReorder: (
    sourceId: string,
    targetId: string,
    position: "before" | "after",
  ) => void;
}) {
  const [provider, setProvider] = useState<LeagueProvider>("sleeper");
  const [identifierType, setIdentifierType] = useState<
    "username" | "league_id"
  >("username");
  const [identifier, setIdentifier] = useState("");
  const [busy, setBusy] = useState(false);
  const [draggedLeagueId, setDraggedLeagueId] = useState("");
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    position: "before" | "after";
  } | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pairing, setPairing] = useState<{ code: string; expiresAt: string } | null>(null);
  const [espnSelection, setEspnSelection] = useState<{ id: string; name: string; season: string; teams: { id: string; name: string; managerName: string }[] } | null>(null);
  const providers: {
    id: LeagueProvider;
    name: string;
    short: string;
    description: string;
  }[] = [
    {
      id: "sleeper",
      name: "Sleeper",
      short: "S",
      description:
        "Live rosters, scoring, matchups, waivers, and league settings.",
    },
    {
      id: "espn",
      name: "ESPN",
      short: "E",
      description:
        "Public league rosters, scoring, matchups, waivers, and settings by league ID.",
    },
  ];
  const selectedProvider = providers.find((item) => item.id === provider)!;
  const selectedNflTheme =
    nflThemes.find((team) => team.id === teamTheme) ?? nflThemes[0];

  async function addLeague() {
    if (!identifier.trim()) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const selection = await onAdd(provider, identifierType, identifier.trim());
      if (selection) {
        setEspnSelection(selection);
        setSuccess("ESPN league found. Select the team you manage to finish connecting.");
        return;
      }
      setSuccess(
        provider === "sleeper"
          ? "Sleeper connected. Your live leagues are ready."
          : "ESPN league connected. Your live roster is ready.",
      );
      setIdentifier("");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to add league",
      );
    } finally {
      setBusy(false);
    }
  }

  async function createEspnPairing() {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/espn-extension/pair", { method: "POST" });
      const data = await response.json() as { code?: string; expiresAt?: string; error?: string };
      if (!response.ok || !data.code || !data.expiresAt) throw new Error(data.error ?? "Unable to create pairing code");
      setPairing({ code: data.code, expiresAt: data.expiresAt });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to create pairing code");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-content manage-leagues">
      <section className="manage-hero">
        <div>
          <span>YOUR FANTASY UNIVERSE</span>
          <h2>
            Every league.
            <br />
            <em>One command center.</em>
          </h2>
          <p>
            Connect with a username or add a specific league ID. Each connection
            is saved only to your Fantasy Hub account.
          </p>
        </div>
        <div className="manage-count">
          <strong>
            {connectedLeagues.length}
          </strong>
          <span>LEAGUES & ACCOUNTS</span>
        </div>
      </section>
      <section className="appearance-panel panel">
        <div className="panel-header">
          <div>
            <span>PERSONALIZE YOUR HUB</span>
            <h3>Choose your NFL team theme</h3>
          </div>
          <label>
            Team
            <select
              value={teamTheme}
              onChange={(event) => onTeamThemeChange(event.target.value)}
            >
              {nflThemes.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p>
          The selected team’s official-style primary and secondary palette
          carries across dashboard backgrounds, navigation, feature headers,
          cards, and highlights in both light and dark mode. Your selection is
          saved on this device.
        </p>
        <div className="selected-team-theme">
          <i
            style={{
              background: `linear-gradient(135deg, ${selectedNflTheme.primary} 0 50%, ${selectedNflTheme.secondary} 50%)`,
            }}
          />
          <span>
            <strong>{selectedNflTheme.name}</strong>
            <small>
              {selectedNflTheme.primary} · {selectedNflTheme.secondary}
            </small>
          </span>
        </div>
        <div
          className="team-theme-grid"
          role="group"
          aria-label="NFL team themes"
        >
          {nflThemes.map((team) => (
            <button
              key={team.id}
              className={team.id === teamTheme ? "active" : ""}
              onClick={() => onTeamThemeChange(team.id)}
              aria-pressed={team.id === teamTheme}
            >
              <i
                style={{
                  background: `linear-gradient(135deg, ${team.primary} 0 50%, ${team.secondary} 50%)`,
                }}
              />
              <span>{team.id}</span>
              <small>
                {team.name.replace(
                  /^(Arizona|Atlanta|Baltimore|Buffalo|Carolina|Chicago|Cincinnati|Cleveland|Dallas|Denver|Detroit|Green Bay|Houston|Indianapolis|Jacksonville|Kansas City|Las Vegas|Los Angeles|Miami|Minnesota|New England|New Orleans|New York|Philadelphia|Pittsburgh|San Francisco|Seattle|Tampa Bay|Tennessee|Washington) /,
                  "",
                )}
              </small>
            </button>
          ))}
        </div>
      </section>
      <section className="provider-grid" aria-label="Fantasy providers">
        {providers.map((item) => (
          <button
            key={item.id}
            className={
              provider === item.id
                ? `active provider-${item.id}`
                : `provider-${item.id}`
            }
            onClick={() => {
              setProvider(item.id);
              if (item.id === "espn") setIdentifierType("league_id");
              setEspnSelection(null);
              setError("");
              setSuccess("");
            }}
          >
            <i>{item.short}</i>
            <span>
              <strong>{item.name}</strong>
              <small>{item.description}</small>
            </span>
            {provider === item.id && <b>SELECTED</b>}
          </button>
        ))}
      </section>
      <section className="integration-status panel">
        <div className="panel-header">
          <div>
            <span>CONNECTION COVERAGE</span>
            <h3>One model, honest source status</h3>
          </div>
          <b>NO DEMO LEAGUE DATA</b>
        </div>
        <p>
          Fantasy Hub normalizes rosters, scoring, matchups, transactions, and
          player IDs only after a provider connection is verified. Saved league
          references never appear as live data.
        </p>
        <div className="integration-matrix">
          <article><i>S</i><span><strong>Sleeper</strong><small>Rosters · scoring · matchups · waivers</small></span><b className="live">LIVE</b></article>
          <article><i>E</i><span><strong>ESPN</strong><small>Public leagues · rosters · scoring · matchups · waivers</small></span><b className="live">LIVE</b></article>
        </div>
      </section>
      <section className="manage-connect panel">
        <div className="panel-header">
          <div>
            <span>ADD FROM {selectedProvider.name.toUpperCase()}</span>
            <h3>Connect another league</h3>
          </div>
        </div>
        <div className="manage-form">
          <div className="method-toggle">
            <button
              className={identifierType === "username" ? "active" : ""}
              disabled={provider === "espn"}
              onClick={() => setIdentifierType("username")}
            >
              Username
            </button>
            <button
              className={identifierType === "league_id" ? "active" : ""}
              onClick={() => setIdentifierType("league_id")}
            >
              League ID
            </button>
          </div>
          <label>
            {identifierType === "username"
              ? `${selectedProvider.name} username`
              : `${selectedProvider.name} league ID`}
            <input
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void addLeague();
              }}
              placeholder={
                identifierType === "username"
                  ? `Enter ${selectedProvider.name} username`
                  : "Enter numeric league ID"
              }
              autoComplete="off"
            />
          </label>
          <button
            className="manage-add"
            onClick={() => void addLeague()}
            disabled={busy || !identifier.trim()}
          >
            {busy
              ? "Connecting…"
              : provider === "sleeper"
                ? "Connect league"
                : "Find ESPN league"}
          </button>
        </div>
        {(error || accountError) && (
          <p className="manage-message error">{error || accountError}</p>
        )}
        {success && <p className="manage-message success">{success}</p>}
        <div className={`provider-note ${provider}`}>
          <b>
            {provider === "sleeper"
              ? "LIVE CONNECTION"
              : "PUBLIC LEAGUE CONNECTION"}
          </b>
          <p>
            {provider === "sleeper"
              ? "Username finds every team you own. League ID adds one public league directly."
              : "Enter a public ESPN league ID, then select the team you manage. Private ESPN leagues cannot be read through league-ID access."}
          </p>
        </div>
        {provider === "espn" && (
          <section className="espn-private-sync">
            <div className="espn-private-heading">
              <div><span>PRIVATE ESPN LEAGUES</span><h4>Sync through your signed-in browser</h4></div>
              <b>NO PASSWORD SHARING</b>
            </div>
            <p>The extension reads your league while you are signed into ESPN and sends league data—not your password or ESPN cookies—to Fantasy Hub.</p>
            <div className="espn-sync-actions">
              <a className="manage-add" href="/extensions/fantasy-hub-espn-sync.zip" download>Download extension</a>
              <button className="manage-add secondary" onClick={() => void createEspnPairing()} disabled={busy}>{busy ? "Generating…" : "Generate pairing code"}</button>
              <button className="manage-add secondary" onClick={() => void onRefresh().then(() => setSuccess("Synced ESPN leagues refreshed."))}>Refresh synced leagues</button>
            </div>
            {pairing && (
              <div className="espn-pairing-code">
                <span><small>ONE-TIME CODE</small><strong>{pairing.code}</strong><em>Expires {new Date(pairing.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</em></span>
                <button onClick={() => void navigator.clipboard.writeText(pairing.code)}>Copy code</button>
              </div>
            )}
            <div className="espn-detailed-instructions">
              <header><span>COMPLETE SETUP GUIDE</span><strong>Chrome desktop · Extension v0.1.4</strong></header>
              <ol>
                <li><b>1</b><span><strong>Download and extract the extension</strong><small>Click <em>Download extension</em> above. Open your Downloads folder and double-click the ZIP so you have a normal folder containing manifest.json, popup.html, popup.js, and popup.css.</small></span></li>
                <li><b>2</b><span><strong>Open Chrome’s extension manager</strong><small>Type <code>chrome://extensions</code> into Chrome’s address bar and press Return. Turn on <em>Developer mode</em> in the upper-right corner.</small></span></li>
                <li><b>3</b><span><strong>Install the extracted folder</strong><small>Click <em>Load unpacked</em> near the upper-left and select the extracted folder—not the ZIP and not popup.html. Confirm the card says Fantasy Hub ESPN Sync version 0.1.4.</small></span></li>
                <li><b>4</b><span><strong>Pin the extension</strong><small>Click Chrome’s puzzle-piece icon and pin Fantasy Hub ESPN Sync. Always open it from this toolbar icon; do not open popup.html directly.</small></span></li>
                <li><b>5</b><span><strong>Open both signed-in sites</strong><small>Keep Fantasy Hub open and signed in in one Chrome tab. In another tab, sign into ESPN and open the private fantasy football league you want to connect.</small></span></li>
                <li><b>6</b><span><strong>Create a fresh pairing code</strong><small>Return here and click <em>Generate pairing code</em>. Copy the one-time code. It expires after ten minutes and must be regenerated after a failed or completed attempt.</small></span></li>
                <li><b>7</b><span><strong>Load your ESPN league</strong><small>Return to the ESPN league tab and open the pinned extension. Paste the pairing code. Confirm the League ID and season, then click <em>Load teams from ESPN</em>.</small></span></li>
                <li><b>8</b><span><strong>Select your team and sync</strong><small>Choose the team you manage and click <em>Sync to Fantasy Hub</em>. Wait for the green success message before closing the extension.</small></span></li>
                <li><b>9</b><span><strong>Refresh Fantasy Hub</strong><small>Return here and click <em>Refresh synced leagues</em>. Your ESPN league should then appear with your selected roster across Fantasy Hub.</small></span></li>
              </ol>
              <aside>
                <strong>If syncing does not complete</strong>
                <ul>
                  <li>Verify the installed extension card shows version 0.1.4.</li>
                  <li>Keep both Fantasy Hub and the correct ESPN league open and signed in.</li>
                  <li>Generate a new pairing code for every retry.</li>
                  <li>Remove older extension versions instead of loading multiple copies.</li>
                  <li>Use desktop Chrome, Edge, or Brave; mobile browsers cannot load this preliminary extension.</li>
                </ul>
              </aside>
            </div>
          </section>
        )}
        {espnSelection && (
          <section className="espn-team-picker">
            <header><span>SELECT YOUR TEAM</span><strong>{espnSelection.name} · {espnSelection.season}</strong></header>
            <div>
              {espnSelection.teams.map((team) => (
                <button key={team.id} disabled={busy} onClick={() => {
                  setBusy(true);
                  setError("");
                  void onAdd("espn", "league_id", identifier.trim(), team.id)
                    .then(() => {
                      setSuccess(`${team.name} connected from ESPN.`);
                      setEspnSelection(null);
                      setIdentifier("");
                    })
                    .catch((requestError) => setError(requestError instanceof Error ? requestError.message : "Unable to connect ESPN team"))
                    .finally(() => setBusy(false));
                }}>
                  <strong>{team.name}</strong><small>{team.managerName}</small><b>Choose →</b>
                </button>
              ))}
            </div>
          </section>
        )}
      </section>
      <section className="managed-list panel">
        <div className="panel-header">
          <div>
            <span>CONNECTED SOURCES</span>
            <h3>Your leagues and accounts</h3>
          </div>
          <b>{connectedLeagues.length + managedLeagues.length} records</b>
        </div>
        {connectedLeagues.map((league, index) => (
          <article
            key={`live-${league.id}`}
            className={`connected-league-row ${draggedLeagueId === league.id ? "dragging" : ""} ${dropTarget?.id === league.id && draggedLeagueId !== league.id ? `drop-${dropTarget.position}` : ""}`}
            draggable
            onDragStart={(event) => {
              setDraggedLeagueId(league.id);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", league.id);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              if (draggedLeagueId !== league.id) {
                const bounds = event.currentTarget.getBoundingClientRect();
                setDropTarget({
                  id: league.id,
                  position:
                    event.clientY < bounds.top + bounds.height / 2
                      ? "before"
                      : "after",
                });
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (draggedLeagueId && draggedLeagueId !== league.id) {
                const bounds = event.currentTarget.getBoundingClientRect();
                onReorder(
                  draggedLeagueId,
                  league.id,
                  event.clientY < bounds.top + bounds.height / 2
                    ? "before"
                    : "after",
                );
              }
              setDropTarget(null);
            }}
            onDragEnd={() => {
              setDraggedLeagueId("");
              setDropTarget(null);
            }}
            title="Drag to reorder this league"
          >
            <i className="manage-drag-handle" aria-hidden="true">⋮⋮</i>
            <i className={`provider-badge ${league.provider ?? "sleeper"}`}>{league.provider === "espn" ? "E" : "S"}</i>
            <p>
              <strong>{league.name}</strong>
              <small>
                {league.provider === "espn" ? "ESPN" : "Sleeper"} · {league.season} · {league.teams} teams ·{" "}
                {league.format} · {league.scoring}
              </small>
            </p>
            <span className="connection-status live">● LIVE</span>
            <div className="league-order-actions">
              <button
                onClick={() => onMove(league.id, -1)}
                disabled={index === 0}
                aria-label={`Move ${league.name} earlier`}
                title="Move earlier"
              >↑</button>
              <button
                onClick={() => onMove(league.id, 1)}
                disabled={index === connectedLeagues.length - 1}
                aria-label={`Move ${league.name} later`}
                title="Move later"
              >↓</button>
              <button className="open-league" onClick={() => void onOpen(league)}>
                Open
              </button>
            </div>
          </article>
        ))}
        {managedLeagues.filter((league) => league.status !== "live" && (league.provider === "sleeper" || league.provider === "espn")).map((league) => (
          <article key={league.id}>
            <i className={`provider-badge ${league.provider}`}>
              {league.provider.slice(0, 1).toUpperCase()}
            </i>
            <p>
              <strong>{league.identifier}</strong>
              <small>
                {league.provider[0].toUpperCase() + league.provider.slice(1)} ·{" "}
                {league.identifierType === "league_id"
                  ? "League ID"
                  : "Username"}
              </small>
            </p>
            <span className={`connection-status ${league.status}`}>
              {league.status === "live"
                ? "CONNECTED"
                : league.status === "oauth_required"
                  ? "AUTH NEEDED"
                  : "SAVED"}
            </span>
            <button
              className="remove-league"
              onClick={() => void onRemove(league.id)}
              aria-label={`Remove ${league.identifier}`}
            >
              Remove
            </button>
          </article>
        ))}
        {!connectedLeagues.length && !managedLeagues.length && (
          <div className="managed-empty">
            <strong>No leagues added yet</strong>
            <p>
              Choose a provider above and enter a username or league ID to get
              started.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function leagueIssueIcon(category: string, title = "") {
  if (/\bis IR\b/i.test(title)) return "🛏️";
  const icons: Record<string, string> = {
    Availability: "🩹",
    Injury: "🩹",
    Lineup: "↕",
    Role: "📉",
    "Bye week": "📅",
    Weather: "☔",
    Exposure: "◎",
    Waivers: "+",
    "Draft Prep": "★",
    Connection: "↻",
  };
  return icons[category] ?? "⚑";
}

function AllLeagues({
  leagues,
  cachedScans,
  onOpen,
  onManage,
  onScansChange,
}: {
  leagues: ConnectedLeague[];
  cachedScans: LeagueScan[];
  onOpen: (league: ConnectedLeague, destination?: View) => Promise<void>;
  onManage: () => void;
  onScansChange: (scans: LeagueScan[]) => void;
}) {
  const openPlayer = useContext(PlayerOpenContext);
  const [scans, setScans] = useState<LeagueScan[]>(cachedScans);
  const [loading, setLoading] = useState(
    leagues.length > 0 && cachedScans.length === 0,
  );
  const [refreshKey, setRefreshKey] = useState(0);
  const [scanCompleted, setScanCompleted] = useState(0);
  const lastAutomaticScan = useRef("");
  const scanIsActive = loading || (leagues.length > 0 && !scans.length);
  const estimatedScanProgress = useEstimatedLoadingProgress(scanIsActive);
  const completedScanProgress =
    (scanCompleted / Math.max(1, leagues.length)) * 100;
  const visibleScanProgress = Math.round(
    Math.min(99, Math.max(estimatedScanProgress, completedScanProgress)),
  );
  const visibleScanCount = Math.min(
    Math.max(0, leagues.length - 1),
    Math.max(
      scanCompleted,
      Math.floor(Math.pow(visibleScanProgress / 100, 1.35) * leagues.length),
    ),
  );

  useEffect(() => {
    if (!leagues.length) return;
    const scanSignature = leagues.map((league) => league.id).sort().join(":");
    if (refreshKey === 0 && lastAutomaticScan.current === scanSignature) return;
    lastAutomaticScan.current = scanSignature;
    const leagueIds = new Set(leagues.map((league) => league.id));
    const cacheMatches =
      cachedScans.length === leagues.length &&
      cachedScans.every((scan) => leagueIds.has(scan.league.id));
    const controller = new AbortController();
    const loadingTimer = cacheMatches && refreshKey === 0
      ? undefined
      : window.setTimeout(() => {
          setScanCompleted(0);
          setLoading(true);
        }, 0);
    void Promise.all(
      leagues.map(async (league): Promise<LeagueScan> => {
        try {
          let leagueResponse: Response | null = null;
          for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
              leagueResponse = await fetch(
                `/api/league?id=${encodeURIComponent(league.id)}`,
                { signal: controller.signal },
              );
              if (leagueResponse.ok) break;
            } catch (error) {
              if (controller.signal.aborted) throw error;
            }
            if (attempt < 2)
              await new Promise((resolve) =>
                window.setTimeout(resolve, 400 * (attempt + 1)),
              );
          }
          if (!leagueResponse?.ok) throw new Error("League unavailable");
          const payload = (await leagueResponse.json()) as {
            league: {
              currentWeek?: number;
              projectionWeek?: number;
              status?: string;
            };
            teams: LeagueTeam[];
            waiverPlayers?: WaiverPlayer[];
            rankingContext?: RankingContext;
          };
          const week = Math.min(
            18,
            Math.max(
              1,
              payload.league.projectionWeek ?? payload.league.currentWeek ?? 1,
            ),
          );
          const weather = await loadWeatherData(
            league.season ?? String(new Date().getUTCFullYear()),
            week,
          );
          const team = payload.teams.find(
            (item) => item.id === league.rosterId,
          );
          if (!team) throw new Error("Roster unavailable");
          if (payload.league.status === "pre_draft") {
            return {
              league,
              teamName: team.teamName,
              week: 1,
              projection: 0,
              status: "review",
              health: 100,
              roster: team.roster,
              waiverPlayers: [],
              opponentName: "Schedule begins after the draft",
              opponentProjection: 0,
              preDraft: true,
              issues: [
                {
                  id: `${league.id}-draft-prep`,
                  severity: "watch",
                  category: "Draft Prep",
                  title: "Prepare for your upcoming draft",
                  detail:
                    "Your league has not drafted yet. Review rankings, tiers, ADP, and roster settings before draft day.",
                },
              ],
            };
          }
          const starters = team.roster.filter(isStartingPlayer);
          const bench = team.roster.filter((player) => player.role === "Bench");
          const healthyBench = bench.filter(
            (player) => !["Out", "IR", "Suspended"].includes(player.status),
          );
          const issues: LeagueScan["issues"] = [];
          const addIssue = (
            severity: "critical" | "warning" | "watch",
            category: string,
            title: string,
            detail: string,
          ) =>
            issues.push({
              id: `${league.id}-${issues.length}`,
              severity,
              category,
              title,
              detail,
            });
          const unavailable = starters.filter((player) =>
            ["Out", "IR", "Suspended"].includes(player.status),
          );
          unavailable.forEach((player) =>
            addIssue(
              "critical",
              "Availability",
              `${player.name} is ${player.status}`,
              `${formatRosterSlot(player.role)} is occupied by an unavailable player. Replace before lineups lock.`,
            ),
          );
          starters
            .filter((player) =>
              ["Doubtful", "Questionable"].includes(player.status),
            )
            .forEach((player) =>
              addIssue(
                player.status === "Doubtful" ? "critical" : "warning",
                "Injury",
                `${player.name} is ${player.status}`,
                `Monitor the ${formatRosterSlot(player.role)} starter and identify a contingency from your bench or waivers.`,
              ),
            );
          if (starters.length < league.starterCount)
            addIssue(
              "critical",
              "Lineup",
              `${league.starterCount - starters.length} starter slot${league.starterCount - starters.length === 1 ? " is" : "s are"} unfilled`,
              `Fantasy Hub found ${starters.length} active lineup entries for ${league.starterCount} required slots.`,
            );
          starters
            .filter(
              (player) =>
                player.projection <= 0.5 &&
                !unavailable.some((item) => item.id === player.id),
            )
            .forEach((player) =>
              addIssue(
                "critical",
                "Role",
                `${player.name} projects near zero`,
                `${player.name} is in ${formatRosterSlot(player.role)} but is not expected to have a meaningful role this week.`,
              ),
            );
          const canFill = (benchPlayer: Player, starter: Player) =>
            starter.role === benchPlayer.position ||
            starter.role.includes(benchPlayer.position) ||
            (["FLEX", "WR_RB_FLEX", "REC_FLEX"].includes(starter.role) &&
              ["RB", "WR", "TE"].includes(benchPlayer.position)) ||
            (["SUPER_FLEX", "QB_FLEX"].includes(starter.role) &&
              ["QB", "RB", "WR", "TE"].includes(benchPlayer.position));
          const upgrades = healthyBench
            .flatMap((benchPlayer) => {
              const starter = starters
                .filter((player) => canFill(benchPlayer, player))
                .sort((a, b) => a.projection - b.projection)[0];
              const edge = starter
                ? benchPlayer.projection - starter.projection
                : 0;
              return starter && edge >= 1.5
                ? [{ benchPlayer, starter, edge }]
                : [];
            })
            .sort((a, b) => b.edge - a.edge)
            .slice(0, 2);
          upgrades.forEach(({ benchPlayer, starter, edge }) =>
            addIssue(
              edge >= 4 ? "critical" : "warning",
              "Lineup",
              `Start ${benchPlayer.name} over ${starter.name}`,
              `Fantasy Hub projects a ${edge.toFixed(1)}-point improvement in ${formatRosterSlot(starter.role)}.`,
            ),
          );
          const playingTeams = new Set(
            weather?.games.flatMap((game) => game.teams) ?? [],
          );
          if (playingTeams.size)
            starters
              .filter(
                (player) =>
                  player.team !== "FA" &&
                  !playingTeams.has(normalizeNflTeam(player.team)),
              )
              .forEach((player) =>
                addIssue(
                  "critical",
                  "Bye week",
                  `${player.name} appears to be on bye`,
                  `${player.name} is currently in ${formatRosterSlot(player.role)}, but ${player.team} is not on the Week ${week} NFL slate.`,
                ),
              );
          starters.forEach((player) => {
            const game = weather?.games.find((item) =>
              item.teams.includes(normalizeNflTeam(player.team)),
            );
            if (!game?.forecastAvailable || game.indoor) return;
            const severe =
              (game.windMph ?? 0) >= 20 ||
              (game.precipitationProbability ?? 0) >= 70 ||
              (game.temperatureF ?? 60) <= 20;
            const sensitive = ["QB", "WR", "TE", "K"].includes(player.position);
            if (severe && sensitive)
              addIssue(
                "warning",
                "Weather",
                `${player.name} has weather risk`,
                `${game.summary} Review floor and ceiling before locking ${formatRosterSlot(player.role)}.`,
              );
          });
          const teamClusters = starters.reduce<Record<string, Player[]>>(
            (groups, player) => ({
              ...groups,
              [player.team]: [...(groups[player.team] ?? []), player],
            }),
            {},
          );
          Object.entries(teamClusters)
            .filter(([nflTeam, group]) => nflTeam !== "FA" && group.length >= 3)
            .forEach(([nflTeam, group]) =>
              addIssue(
                "watch",
                "Exposure",
                `${group.length} starters rely on ${nflTeam}`,
                `A single low-scoring NFL game could affect ${group.map((player) => player.name).join(", ")}.`,
              ),
            );
          const topWaiver = payload.waiverPlayers?.[0];
          const waiverPlan = topWaiver
            ? waiverAddDropPlan(topWaiver, team.roster, payload.rankingContext ?? null)
            : null;
          if (topWaiver && waiverPlan?.worthIt && waiverPlan.drop)
            addIssue(
              "watch",
              "Waivers",
              `Add ${topWaiver.name} · drop ${waiverPlan.drop.name}`,
              `${topWaiver.name} improves modeled roster utility by ${waiverPlan.improvement.toFixed(1)} points after accounting for the value and positional scarcity of the drop.`,
            );
          const severityRank = { critical: 0, warning: 1, watch: 2 } as const;
          const ordered = issues.sort(
            (a, b) => severityRank[a.severity] - severityRank[b.severity],
          );
          const opponent = payload.teams.find(
            (candidate) =>
              candidate.id !== team.id &&
              candidate.matchupId != null &&
              candidate.matchupId === team.matchupId,
          );
          const opponentProjection = Number(
            (opponent?.roster ?? [])
              .filter(isStartingPlayer)
              .reduce((sum, player) => sum + player.projection, 0)
              .toFixed(1),
          );
          const health = Math.max(
            0,
            100 -
              ordered.reduce(
                (sum, issue) =>
                  sum +
                  (issue.severity === "critical"
                    ? 18
                    : issue.severity === "warning"
                      ? 9
                      : 3),
                0,
              ),
          );
          return {
            league,
            teamName: team.teamName,
            week,
            projection: Number(
              starters
                .reduce((sum, player) => sum + player.projection, 0)
                .toFixed(1),
            ),
            status: ordered.some((issue) => issue.severity === "critical")
              ? "urgent"
              : ordered.some((issue) => issue.severity === "warning")
                ? "review"
                : "ready",
            health,
            roster: team.roster,
            waiverPlayers: payload.waiverPlayers ?? [],
            opponentName: opponent?.teamName ?? "Opponent pending",
            opponentProjection,
            issues: ordered,
          };
        } catch {
          return {
            league,
            teamName: "Roster unavailable",
            week: 1,
            projection: 0,
            status: "unavailable",
            health: 0,
            roster: [],
            waiverPlayers: [],
            opponentName: "Opponent unavailable",
            opponentProjection: 0,
            issues: [
              {
                id: `${league.id}-unavailable`,
                severity: "warning",
                category: "Connection",
                title: "League data is still syncing",
                detail: "Fantasy Hub retried the initial scan. Refresh all leagues once the platform finishes syncing this roster.",
              },
            ],
          };
        } finally {
          if (!controller.signal.aborted)
            setScanCompleted((completed) => Math.min(leagues.length, completed + 1));
        }
      }),
    )
      .then((results) => {
        const statusRank = {
          urgent: 0,
          review: 1,
          unavailable: 2,
          ready: 3,
        } as const;
        if (!controller.signal.aborted) {
          const orderedResults = results.sort(
            (a, b) => statusRank[a.status] - statusRank[b.status],
          );
          setScans(orderedResults);
          onScansChange(orderedResults);
          setRefreshKey(0);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      if (loadingTimer != null) window.clearTimeout(loadingTimer);
    };
  }, [leagues, cachedScans, refreshKey, onScansChange]);

  const issueCount = scans.reduce((sum, scan) => sum + scan.issues.length, 0);
  const urgentCount = scans.reduce(
    (sum, scan) =>
      sum + scan.issues.filter((issue) => issue.severity === "critical").length,
    0,
  );
  const readyCount = scans.filter(
    (scan) => scan.status === "ready" && !scan.preDraft,
  ).length;
  const inbox = scans.flatMap((scan) =>
    scan.issues.map((issue) => ({ scan, issue })),
  );
  type QueuePriority = "Act now" | "Before kickoff" | "Tonight" | "This week" | "Monitor";
  const queuePriority = (issue: LeagueScan["issues"][number]): QueuePriority =>
    issue.severity === "critical"
      ? "Act now"
      : issue.category === "Waivers"
        ? "Tonight"
        : issue.category === "Trade"
          ? "This week"
          : ["Lineup", "Availability", "Bye week"].includes(issue.category)
            ? "Before kickoff"
            : "Monitor";
  const priorityOrder: Record<QueuePriority, number> = { "Act now": 0, "Before kickoff": 1, Tonight: 2, "This week": 3, Monitor: 4 };
  const tradeFollowUps = scans.flatMap((scan) => scan.issues.length >= 2 && !scan.issues.some((issue) => issue.severity === "critical" || issue.category === "Waivers") ? [{ scan, issue: { id: `${scan.league.id}-trade-review`, severity: "watch" as const, category: "Trade", title: "Review recurring roster weaknesses", detail: `${scan.issues.length} separate concerns lower this roster’s weekly readiness. Trade Lab can test whether an actual league partner has a mutually beneficial fit.` } }] : []);
  const prioritizedInbox = [...inbox, ...tradeFollowUps]
    .map((item) => ({ ...item, priority: queuePriority(item.issue), score: 100 - priorityOrder[queuePriority(item.issue)] * 20 + (item.issue.severity === "critical" ? 15 : item.issue.severity === "warning" ? 7 : 0) + Math.max(0, 10 - item.scan.health / 10) }))
    .sort((a, b) => b.score - a.score)
    .filter((item, index, items) => index === items.findIndex((candidate) => candidate.scan.league.id === item.scan.league.id && candidate.priority === item.priority && candidate.issue.category === item.issue.category));
  const topActions = prioritizedInbox.slice(0, 3);
  const remainingActions = prioritizedInbox.slice(3);
  const healthyLeagues = scans.filter((scan) => !scan.issues.length && !scan.preDraft);
  const playerExposure = Array.from(
    scans.reduce<
      Map<string, { player: Player; leagues: LeagueScan[] }>
    >((map, scan) => {
      scan.roster.forEach((player) => {
        const key = `${player.name}-${player.position}`;
        const current = map.get(key) ?? { player, leagues: [] };
        current.leagues.push(scan);
        map.set(key, current);
      });
      return map;
    }, new Map()),
  )
    .map(([, value]) => value)
    .filter((item) => item.leagues.length > 1)
    .sort((a, b) => b.leagues.length - a.leagues.length);
  const waiverOpportunities = Array.from(
    scans.reduce<Map<string, { player: WaiverPlayer; scans: LeagueScan[] }>>(
      (map, scan) => {
        scan.waiverPlayers.slice(0, 20).forEach((player) => {
          const key = `${player.name}-${player.position}`;
          const current = map.get(key) ?? { player, scans: [] };
          current.scans.push(scan);
          map.set(key, current);
        });
        return map;
      },
      new Map(),
    ),
  )
    .map(([, value]) => value)
    .sort(
      (a, b) =>
        b.scans.length - a.scans.length ||
        b.player.projection - a.player.projection,
    )
    .slice(0, 6);
  const healthiest = [...scans].sort((a, b) => b.health - a.health)[0];
  const biggestProjection = [...scans].sort(
    (a, b) => b.projection - a.projection,
  )[0];
  const actionView = (category: string): View =>
    category === "Waivers"
      ? "Waiver Wire"
      : category === "Trade"
        ? "Trade Lab"
      : ["Lineup", "Availability", "Injury", "Bye week", "Role", "Weather"].includes(category)
        ? "Start / Sit"
        : category === "Exposure"
          ? "Matchups"
          : "Command Center";
  if (!leagues.length)
    return (
      <div className="page-content">
        <SectionIntro
          kicker="MULTI-LEAGUE COMMAND"
          title="Connect your leagues to build a weekly action list"
          text="Once leagues are connected, Fantasy Hub will scan every roster for lineup, injury, bye-week, weather, and waiver decisions."
        />
        <section className="panel portfolio-empty">
          <strong>Your portfolio starts with one connection.</strong>
          <p>Add a username or league ID. Fantasy Hub will keep each league isolated while bringing every decision into this one home.</p>
          <button onClick={onManage}>Connect a league</button>
        </section>
      </div>
    );
  return (
    <div className="page-content all-leagues-page">
      <section className="all-leagues-hero">
        <div>
          <span>MULTI-LEAGUE COMMAND</span>
          <h2>
            One checklist.
            <br />
            <em>Every league covered.</em>
          </h2>
          <p>
            Fantasy Hub scans your real rosters and moves the most urgent
            decisions to the top.
          </p>
        </div>
        <button
          onClick={() => setRefreshKey((value) => value + 1)}
          disabled={loading}
        >
          {loading ? "Scanning…" : "Refresh all leagues"}
        </button>
      </section>
      <section className="all-league-metrics">
        <article>
          <span>CONNECTED</span>
          <strong>{leagues.length}</strong>
          <small>leagues monitored</small>
        </article>
        <article className={urgentCount ? "urgent" : ""}>
          <span>URGENT</span>
          <strong>{urgentCount}</strong>
          <small>decisions need action</small>
        </article>
        <article>
          <span>OPEN ITEMS</span>
          <strong>{issueCount}</strong>
          <small>across all rosters</small>
        </article>
        <article className="ready">
          <span>READY</span>
          <strong>{readyCount}</strong>
          <small>lineups clear</small>
        </article>
      </section>
      {!loading && scans.length > 0 && (
        <>
          <section className="portfolio-section portfolio-inbox priority-inbox panel">
            <div className="portfolio-heading">
              <div><span>PRIORITIZED INBOX</span><h3>The three things that matter most</h3></div>
              <b>{topActions.length ? `${topActions.length} TOP ACTIONS` : "ALL CLEAR"}</b>
            </div>
            <div className="portfolio-top-three portfolio-action-list">
              {topActions.map(({ scan, issue, priority }, index) => (
                <article className={`${issue.severity} priority-${priority.toLowerCase().replaceAll(" ", "-")}`} key={`top-action-${issue.id}`}>
                  <b className="action-rank">{index + 1}</b>
                  <i title={issue.category} aria-hidden="true">
                    {leagueIssueIcon(issue.category, issue.title)}
                  </i>
                  <p><span>{priority} · {scan.league.name} · {issue.category}</span><strong>{issue.title}</strong><small>{issue.detail}</small></p>
                  <div className="portfolio-action-buttons">
                    <button onClick={() => void onOpen(scan.league, actionView(issue.category))}>Review in Hub</button>
                    <a className="platform-link" href={platformLeagueUrl(scan.league)} target="_blank" rel="noopener noreferrer" aria-label={`Open league in ${scan.league.provider === "espn" ? "ESPN" : "Sleeper"} (opens in a new tab)`}><PlatformLogo provider={scan.league.provider === "espn" ? "ESPN" : "Sleeper"} /><span>Open</span><b aria-hidden="true">↗</b></a>
                  </div>
                </article>
              ))}
              {!topActions.length && <div className="portfolio-clear"><i>✓</i><p><strong>No action required right now</strong><small>Every connected lineup passed the current availability, projection, bye, weather, and waiver scan.</small></p></div>}
            </div>
          </section>
          <section className="portfolio-section action-queue panel">
            <div className="portfolio-heading"><div><span>FULL ACTION QUEUE</span><h3>Everything else, organized by deadline</h3></div><b>{remainingActions.length} QUEUED</b></div>
            <div className="action-queue-groups">{(["Act now", "Before kickoff", "Tonight", "This week", "Monitor"] as QueuePriority[]).map((priority) => { const actions = remainingActions.filter((item) => item.priority === priority); if (!actions.length) return null; return <section key={priority}><header><span>{priority}</span><b>{actions.length}</b></header>{actions.map(({ scan, issue }) => <button key={`queue-${issue.id}`} onClick={() => void onOpen(scan.league, actionView(issue.category))}><i aria-hidden="true">{leagueIssueIcon(issue.category, issue.title)}</i><p><strong>{issue.title}</strong><small>{scan.league.name} · {issue.category}</small></p><em>Review →</em></button>)}</section>; })}<section className="no-action-group"><header><span>No action</span><b>{healthyLeagues.length}</b></header>{healthyLeagues.length ? healthyLeagues.map((scan) => <button key={`healthy-${scan.league.id}`} onClick={() => void onOpen(scan.league)}><i>✓</i><p><strong>{scan.league.name} is healthy</strong><small>{scan.teamName} · lineup and availability checks are clear</small></p><em>Open →</em></button>) : <p>Every league with data has at least one item to monitor.</p>}</section></div>
          </section>
          <section className="portfolio-grid">
            <article className="portfolio-section panel">
              <div className="portfolio-heading"><div><span>WEEKLY READINESS</span><h3>Lineup preparation across your portfolio</h3></div></div>
              <div className="health-list">
                {scans.map((scan) => <button key={`health-${scan.league.id}`} onClick={() => void onOpen(scan.league, scan.preDraft ? "Player Ranks" : undefined)}><span><strong>{scan.league.name}</strong><small>{scan.preDraft ? "Draft preparation" : scan.teamName}</small></span>{scan.preDraft ? <em className="draft-prep-label">PRE-DRAFT</em> : <><i><em style={{ width: `${scan.health}%` }} /></i><b>{scan.health}</b></>}</button>)}
              </div>
            </article>
            <article className="portfolio-section panel">
              <div className="portfolio-heading"><div><span>LIVE PORTFOLIO</span><h3>This week’s matchup board</h3></div></div>
              <div className="portfolio-matchups">
                {scans.map((scan) => scan.preDraft ? <button key={`matchup-${scan.league.id}`} className="pre-draft-matchup" onClick={() => void onOpen(scan.league, "Player Ranks")}><span><strong>{scan.teamName}</strong><small>Draft preparation is open</small></span><b>DRAFT</b><em>View rankings →</em></button> : (() => { const edge = scan.projection - scan.opponentProjection; return <button key={`matchup-${scan.league.id}`} onClick={() => void onOpen(scan.league, "Scoreboard")}><span><strong>{scan.teamName}</strong><small>vs {scan.opponentName}</small></span><b className={edge >= 0 ? "positive" : "negative"}>{scan.opponentProjection ? `${edge >= 0 ? "+" : ""}${edge.toFixed(1)}` : "—"}</b><em>{scan.projection.toFixed(1)}–{scan.opponentProjection ? scan.opponentProjection.toFixed(1) : "—"}</em></button>; })())}
              </div>
            </article>
          </section>
          <section className="portfolio-grid">
            <article className="portfolio-section panel">
              <div className="portfolio-heading"><div><span>PORTFOLIO EXPOSURE</span><h3>Concentration and correlated risk</h3></div><b>{playerExposure.length} repeated</b></div>
              <div className="exposure-list">
                {playerExposure.slice(0, 6).map(({ player, leagues: playerLeagues }) => <div key={`exposure-${player.id}-${player.name}`}><i>{player.position}</i><p><button className="inline-player-link" onClick={() => openPlayer(player)}>{player.name}</button><small>{player.team} · {player.status} · {playerLeagues.map((scan) => scan.league.name).join(", ")}</small></p><b>{playerLeagues.length}/{scans.length}</b></div>)}
                {!playerExposure.length && <p className="portfolio-note">No player appears on more than one connected roster.</p>}
              </div>
            </article>
            <article className="portfolio-section panel">
              <div className="portfolio-heading"><div><span>CROSS-LEAGUE WAIVERS</span><h3>Players available around your portfolio</h3></div></div>
              <div className="waiver-opportunity-list">
                {waiverOpportunities.map(({ player, scans: available }) => <button key={`portfolio-waiver-${player.id}-${player.name}`} onClick={() => openPlayer(player)}><i>{player.position}</i><p><strong>{player.name}</strong><small>Available in {available.map((scan) => scan.league.name).join(", ")}</small></p><b>{player.projection.toFixed(1)}</b></button>)}
              </div>
            </article>
          </section>
          <section className="portfolio-recap panel">
            <div className="portfolio-heading"><div><span>WEEKLY CLUBHOUSE</span><h3>Your portfolio superlatives</h3></div></div>
            <div><article><i>🏆</i><span><small>BEST PREPARED</small><strong>{healthiest?.league.name}</strong><em>{healthiest?.health}/100 weekly readiness</em></span></article><article><i>🚀</i><span><small>BIGGEST LINEUP</small><strong>{biggestProjection?.teamName}</strong><em>{biggestProjection?.projection.toFixed(1)} projected points</em></span></article><article><i>🎯</i><span><small>PORTFOLIO ANCHOR</small><strong>{playerExposure[0]?.player.name ?? "No repeat player"}</strong><em>{playerExposure[0] ? `Rostered in ${playerExposure[0].leagues.length} leagues` : "Diversified rosters"}</em></span></article></div>
          </section>
        </>
      )}
      {scanIsActive ? (
        <section className="all-leagues-loading panel">
          <strong>Scanning your league portfolio…</strong>
          <p>Checking settings, starters, injuries, waivers, schedule, and weather.</p>
          <div
            className="load-progress"
            role="progressbar"
            aria-label="Scanning connected leagues"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={visibleScanProgress}
          >
            <span style={{ width: `${visibleScanProgress}%` }} />
          </div>
          <small>About {visibleScanCount} of {leagues.length} leagues scanned · {visibleScanProgress}% complete</small>
        </section>
      ) : (
        <section className="league-scan-list">
          {scans.map((scan) => (
            <article
              className={`league-scan-card ${scan.status}`}
              key={scan.league.id}
            >
              <header>
                <div>
                  <span>
                    {scan.preDraft ? "DRAFT PREP" : `WEEK ${scan.week}`} · {scan.league.format.toUpperCase()}
                  </span>
                  <h3>{scan.league.name}</h3>
                  <small>
                    {scan.teamName} · {scan.league.scoring}
                    {!scan.preDraft && ` · ${scan.projection.toFixed(1)} projected points`}
                  </small>
                </div>
                <b>
                  {scan.preDraft
                    ? "PRE-DRAFT"
                    : scan.status === "urgent"
                    ? "ACTION NEEDED"
                    : scan.status === "review"
                      ? "REVIEW"
                      : scan.status === "ready"
                        ? "READY"
                        : "REFRESH"}
                </b>
              </header>
              <div className="league-issue-list">
                {scan.issues.length ? (
                  scan.issues.map((issue) => (
                    <div className={issue.severity} key={issue.id}>
                      <i title={issue.category} aria-hidden="true">
                        {leagueIssueIcon(issue.category, issue.title)}
                      </i>
                      <p>
                        <span>{issue.category}</span>
                        <strong>{issue.title}</strong>
                        <small>{issue.detail}</small>
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="clear">
                    <i>✓</i>
                    <p>
                      <strong>No immediate action found</strong>
                      <small>
                        Starters, availability, byes, weather, and obvious
                        lineup edges look clear.
                      </small>
                    </p>
                  </div>
                )}
              </div>
              <footer>
                <span>
                  {scan.issues.length} item{scan.issues.length === 1 ? "" : "s"}{" "}
                  · scanned now
                </span>
                <div className="league-scan-actions">
                  <button onClick={() => void onOpen(scan.league)}>Open in Hub</button>
                  <a className="platform-link" href={platformLeagueUrl(scan.league)} target="_blank" rel="noopener noreferrer" aria-label={`Open league in ${scan.league.provider === "espn" ? "ESPN" : "Sleeper"} (opens in a new tab)`}><PlatformLogo provider={scan.league.provider === "espn" ? "ESPN" : "Sleeper"} /><b aria-hidden="true">↗</b></a>
                </div>
              </footer>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

type LeagueStoryData = {
  league: { name: string; season: string; currentWeek: number; completedWeek: number; provider: string };
  updatedAt: string;
  recap: { available: boolean; week: number; highScore: { teamName: string; points: number } | null; closestGame: { teams: { teamName: string; points: number }[] } | null; biggestWin: { teams: { teamName: string; points: number }[] } | null; biggestUpset: { winner: { teamName: string; points: number }; loser: { teamName: string; points: number }; seedGap: number } | null; lineupOutcomes: { teamName: string; benchPoints: number; topBenchPlayer: string | null; topBenchPoints: number }[] };
  preview: { week: number; games: { matchupId: number; teams: { rosterId: number; teamName: string; managerName: string; points: number; isMine: boolean }[] }[] };
  powerRankings: { rosterId: number; teamName: string; managerName: string; wins: number; losses: number; points: number; rank: number; movement: number; isMine: boolean }[];
  rivalry: { opponentName: string; meetings: number; wins: number; losses: number } | null;
  trades: { id: string; week: number; timestamp: number | null; teams: string[]; adds: { player: string; team: string }[]; drops: { player: string; team: string }[] }[];
  playoff: { teams: number; startsWeek: number; weeksRemaining: number; yourRank: number | null; yourWins: number | null; lineWins: number | null; summary: string };
  seasonNarrative: {
    draftDay: { slot: number | null; picks: { round: number | null; pick: number | null; player: string }[]; summary: string } | null;
    acquisitions: { week: number; player: string; type: string; pointsAfter: number }[];
    results: { week: number; opponent: string; yourPoints: number; opponentPoints: number; margin: number; result: string }[];
    closeResults: { week: number; opponent: string; margin: number; result: string }[];
    turningPoint: { week: number; opponent: string; margin: number; result: string } | null;
    snapshots: { week: number; playoffProbability: number | null; rosterValueIndex: number | null; injuryCount: number; record: string; pointsFor: number }[];
    injuryRecoveries: { week: number; recovered: number }[];
    bestDecision: { week: number; player: string; type: string; pointsAfter: number } | null;
    championshipPath: string;
    wrapped: { ready: boolean; headline: string; record: string; points: number; closeWins: number; closeLosses: number; bestWeek: { week: number; yourPoints: number } | null; shareText: string };
  };
  methodology: string;
};

type DecisionReportData = { decisions: { id: string; week: number; category: string; recommendation: string; alternatives: unknown[]; information: Record<string, unknown>; confidence: number; userSelection: string | null; result: Record<string, unknown> | null; processGrade: string | null; createdAt: string }[]; summary: { total: number; selected: number; resolved: number; processReasonable: number; pointsLeftOnBench: number; byCategory: { category: string; total: number; selected: number; resolved: number; averageConfidence: number | null }[]; projectionAccuracy: number | null; strongestPosition: string | null; weakestPosition: string | null; note: string } | null };

function ManagerReport({ leagueId }: { leagueId: string }) {
  const [data, setData] = useState<DecisionReportData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!leagueId) return;
    const controller = new AbortController();
    void fetch(`/api/decisions?leagueId=${encodeURIComponent(leagueId)}`, { signal: controller.signal }).then(async (response) => { const payload = await response.json() as DecisionReportData & { error?: string }; if (!response.ok) throw new Error(payload.error ?? "Decision history unavailable"); setData(payload); }).catch((requestError) => { if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : "Decision history unavailable"); });
    return () => controller.abort();
  }, [leagueId]);
  if (!leagueId) return <div className="page-content"><SectionIntro kicker="DECISION MEMORY" title="Choose a league to open your Manager Report Card" text="Recommendations and selections are evaluated separately from their eventual outcomes." /></div>;
  if (error) return <div className="page-content"><SectionIntro kicker="DECISION MEMORY" title="Manager Report is temporarily unavailable" text={error} /></div>;
  if (!data) return <div className="page-content"><SectionIntro kicker="DECISION MEMORY" title="Building your decision ledger…" text="Fantasy Hub is loading recommendations saved for this league." /></div>;
  const labels: Record<string, string> = { start_sit: "Start / Sit", waiver: "Waiver", trade: "Trade" };
  return <div className="page-content manager-report-page"><section className="manager-report-hero"><div><span>MANAGER REPORT CARD</span><h2>Grade the process, not the hindsight.</h2><p>Every saved recommendation preserves what Fantasy Hub knew, what it considered, and what you chose.</p></div><b>{data.summary?.total ?? 0}<small>DECISIONS SAVED</small></b></section><section className="decision-scorecards">{data.summary?.byCategory.map((category) => <article className="panel" key={category.category}><span>{labels[category.category] ?? category.category}</span><strong>{category.total || "—"}</strong><small>{category.selected} selections · {category.resolved} final results</small><em>{category.averageConfidence == null ? "No sample" : `${category.averageConfidence}% avg. confidence`}</em></article>)}</section><section className="manager-accountability panel"><header><div><span>ACCOUNTABILITY FRAMEWORK</span><h3>What counts as a good decision?</h3></div><b>{data.summary?.resolved ?? 0} RESOLVED</b></header><div><article><strong>Information quality</strong><small>Were projections, availability, matchup and league settings captured?</small></article><article><strong>Alternative quality</strong><small>Was the selected option reasonable among choices available then?</small></article><article><strong>Outcome quality</strong><small>What happened afterward—reported separately from the process grade.</small></article></div><p>{data.summary?.note}</p></section><section className="decision-ledger panel"><header><div><span>DECISION LEDGER</span><h3>Your saved calls</h3></div><small>Newest first</small></header>{data.decisions.length ? data.decisions.map((decision) => <article key={decision.id}><div className="decision-ledger-top"><b>{labels[decision.category] ?? decision.category}</b><span>WEEK {decision.week}</span><em>{decision.confidence}% confidence</em></div><h4>{decision.recommendation}</h4><p><strong>Your selection:</strong> {decision.userSelection ?? "No selection recorded"}</p><div><span>AT THE TIME</span><small>{Object.entries(decision.information).slice(0, 5).map(([key, value]) => `${key.replaceAll(/([A-Z])/g, " $1")}: ${Array.isArray(value) ? value.length + " items" : value ?? "—"}`).join(" · ")}</small></div><footer><span>{decision.result ? "Final result recorded" : "Awaiting a final result"}</span><b>{decision.processGrade ?? "Process grade pending"}</b></footer></article>) : <p className="story-empty">Decision memory starts when Fantasy Hub presents a Start/Sit, waiver, or trade recommendation. Open one of those tools to begin your report card.</p>}</section><section className="report-coming panel"><span>REPORT CARD DEVELOPMENT</span><p>FAAB efficiency, trade performance, points left on the bench, projection accuracy by source, position strengths, and where you outperform the model will activate only after enough saved decisions reach final outcomes.</p></section></div>;
}

function LeagueStories({ leagueId, setView }: { leagueId: string; setView: (view: View) => void }) {
  const [story, setStory] = useState<LeagueStoryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [shared, setShared] = useState("");
  useEffect(() => {
    if (!leagueId) return;
    const controller = new AbortController();
    void fetch(`/api/league-story?leagueId=${encodeURIComponent(leagueId)}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as LeagueStoryData & { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "League stories unavailable");
        setStory(payload); setError("");
      })
      .catch((requestError) => { if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : "League stories unavailable"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [leagueId]);
  const shareStory = async (id: string, text: string) => {
    try {
      if (navigator.share) await navigator.share({ title: story?.league.name ?? "Fantasy Hub League Story", text });
      else await navigator.clipboard.writeText(text);
      setShared(id); window.setTimeout(() => setShared(""), 1800);
    } catch { /* A canceled share sheet should leave the page unchanged. */ }
  };
  if (!leagueId) return <div className="page-content"><SectionIntro kicker="LEAGUE STORIES" title="Choose a league to open its story" text="Weekly recaps, rivalries, awards and playoff context are created from connected league history." /><section className="panel scoreboard-empty">No league selected.</section></div>;
  if (loading && !story) return <div className="page-content"><SectionIntro kicker="LEAGUE STORIES" title="Writing this week’s chapter…" text="Fantasy Hub is reading observed matchup and transaction history." /></div>;
  if (error && !story) return <div className="page-content"><SectionIntro kicker="LEAGUE STORIES" title="The league story is temporarily unavailable" text={error} /></div>;
  if (!story) return null;
  const highScoreText = story.recap.highScore ? `${story.recap.highScore.teamName} led ${story.league.name} in Week ${story.recap.week} with ${story.recap.highScore.points.toFixed(1)} points.` : "";
  const biggestMargin = story.recap.biggestWin ? Math.abs(story.recap.biggestWin.teams[0].points - story.recap.biggestWin.teams[1].points) : 0;
  return <div className="page-content league-stories-page">
    <section className="league-stories-hero"><div><span>THE {story.league.season} LEAGUE STORY</span><h2>{story.league.name}</h2><p>Recaps, rivalries and the moments your group will actually talk about.</p></div><button onClick={() => void shareStory("league", `${story.league.name}: ${story.playoff.summary} ${highScoreText}`)}>{shared === "league" ? "Copied!" : "Share league pulse"}</button></section>
    <section className="story-ticker panel"><span>WEEK {story.league.currentWeek}</span><strong>{story.playoff.summary}</strong><small>Updated {new Date(story.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small></section>
    <div className="story-feature-grid">
      <section className="panel weekly-recap"><header><div><span>WEEK {story.recap.week} RECAP</span><h3>The week that was</h3></div><button disabled={!story.recap.available} onClick={() => void shareStory("recap", highScoreText)}>{shared === "recap" ? "Copied!" : "Share recap"}</button></header>{story.recap.available ? <><article className="story-lead"><b>🏆 HIGH SCORE</b><strong>{story.recap.highScore?.teamName}</strong><em>{story.recap.highScore?.points.toFixed(1)} PTS</em></article><div className="story-awards"><article><span>PHOTO FINISH</span><strong>{story.recap.closestGame?.teams.map((team) => team.teamName).join(" vs ")}</strong><small>{story.recap.closestGame ? Math.abs(story.recap.closestGame.teams[0].points - story.recap.closestGame.teams[1].points).toFixed(1) : "—"}-point margin</small></article><article><span>STATEMENT WIN</span><strong>{story.recap.biggestWin?.teams.sort((a, b) => b.points - a.points)[0]?.teamName}</strong><small>{biggestMargin.toFixed(1)}-point margin</small></article>{story.recap.biggestUpset && <article><span>BIGGEST UPSET</span><strong>{story.recap.biggestUpset.winner.teamName}</strong><small>Beat a team ranked {story.recap.biggestUpset.seedGap} spot{story.recap.biggestUpset.seedGap === 1 ? "" : "s"} higher entering the week</small></article>}</div></> : <p className="story-empty">A recap will appear after the league records completed matchup scoring.</p>}</section>
      <section className="panel matchup-preview"><header><div><span>WEEK {story.preview.week} PREVIEW</span><h3>Next on the schedule</h3></div><button onClick={() => setView("Matchups")}>Open matchup →</button></header>{story.preview.games.map((game) => <article className={game.teams.some((team) => team.isMine) ? "mine" : ""} key={game.matchupId}><span>{game.teams[0]?.teamName}<small>{game.teams[0]?.managerName}</small></span><b>VS</b><span>{game.teams[1]?.teamName}<small>{game.teams[1]?.managerName}</small></span>{game.teams.some((team) => team.isMine) && <em>YOUR MATCHUP</em>}</article>)}</section>
    </div>
    <div className="story-dashboard-grid">
      <section className="panel power-story"><header><span>POWER RANKINGS</span><h3>Who’s moving?</h3></header>{story.powerRankings.map((team) => <article className={team.isMine ? "mine" : ""} key={team.rosterId}><b>{team.rank}</b><p><strong>{team.teamName}</strong><small>{team.wins}–{team.losses} · {team.points.toFixed(1)} PF</small></p><em className={team.movement > 0 ? "up" : team.movement < 0 ? "down" : "flat"}>{team.movement > 0 ? `↑ ${team.movement}` : team.movement < 0 ? `↓ ${Math.abs(team.movement)}` : "—"}</em></article>)}</section>
      <section className="panel league-lore"><header><span>LEAGUE LORE</span><h3>Rivalries & playoff race</h3></header>{story.rivalry ? <article className="rivalry-card"><b>HEAD TO HEAD</b><strong>You vs {story.rivalry.opponentName}</strong><span>{story.rivalry.wins}–{story.rivalry.losses}</span><small>{story.rivalry.meetings ? `${story.rivalry.meetings} observed meeting${story.rivalry.meetings === 1 ? "" : "s"} this season` : "First observed meeting this season"}</small></article> : <p className="story-empty">A rivalry record appears when the current matchup is posted.</p>}<article className="playoff-story"><b>PLAYOFF PICTURE</b><strong>{story.playoff.yourRank ? `You are currently #${story.playoff.yourRank}` : "Standings pending"}</strong><small>{story.playoff.summary} Playoffs begin Week {story.playoff.startsWeek}.</small></article></section>
      <section className="panel manager-moments"><header><span>MANAGER MOMENTS</span><h3>Outcome, not hindsight</h3></header>{story.recap.lineupOutcomes.map((outcome, index) => <article key={outcome.teamName}><b>{index === 0 ? "TOUGHEST BENCH" : "BENCH SPARK"}</b><p><strong>{outcome.teamName}</strong><small>{outcome.topBenchPlayer ? `${outcome.topBenchPlayer} scored ${outcome.topBenchPoints.toFixed(1)} on the bench.` : "No material bench scoring was recorded."}</small></p><em>{outcome.benchPoints.toFixed(1)}</em></article>)}<small className="decision-note">These are observed lineup outcomes. A lower-projected starter being outscored does not make the original decision wrong.</small></section>
      <section className="panel trade-reactions"><header><span>TRADE WIRE</span><h3>Deals people will debate</h3></header>{story.trades.length ? story.trades.map((trade) => { const text = `Week ${trade.week} trade in ${story.league.name}: ${trade.adds.map((item) => `${item.player} to ${item.team}`).join(", ")}.`; return <article key={trade.id}><div><b>WEEK {trade.week} TRADE</b><strong>{trade.teams.join(" ↔ ")}</strong><small>{trade.adds.map((item) => `${item.player} → ${item.team}`).join(" · ")}</small></div><button onClick={() => void shareStory(trade.id, text)}>{shared === trade.id ? "Copied!" : "Share"}</button></article>; }) : <p className="story-empty">No completed trades were observed in the current recap window.</p>}</section>
    </div>
    <section className="season-narrative panel"><header><div><span>YOUR SEASON NARRATIVE</span><h3>How this team’s story is changing</h3></div><b>{story.seasonNarrative.results.length} CHAPTERS</b></header><div className="narrative-origin"><article><span>DRAFT-DAY EXPECTATIONS</span><strong>{story.seasonNarrative.draftDay?.summary ?? "Draft history was not returned for this league."}</strong>{story.seasonNarrative.draftDay && <small>{story.seasonNarrative.draftDay.picks.slice(0, 3).map((pick) => `R${pick.round}: ${pick.player}`).join(" · ")}</small>}</article><article><span>CHAMPIONSHIP PATH</span><strong>{story.seasonNarrative.championshipPath}</strong></article></div><div className="narrative-timeline">{story.seasonNarrative.results.map((result) => <article className={result.result === "W" ? "win" : result.result === "L" ? "loss" : "tie"} key={result.week}><b>W{result.week}</b><i>{result.result}</i><p><strong>{result.opponent}</strong><small>{result.yourPoints.toFixed(1)}–{result.opponentPoints.toFixed(1)} · {Math.abs(result.margin).toFixed(1)}-point {Math.abs(result.margin) <= 5 ? "close " : ""}{result.result === "W" ? "win" : result.result === "L" ? "loss" : "tie"}</small></p></article>)}</div><div className="narrative-moments"><article><span>MAJOR ACQUISITION</span><strong>{story.seasonNarrative.acquisitions[0]?.player ?? "No observed acquisition yet"}</strong><small>{story.seasonNarrative.acquisitions[0] ? `Added Week ${story.seasonNarrative.acquisitions[0].week} · ${story.seasonNarrative.acquisitions[0].pointsAfter.toFixed(1)} subsequent observed points` : "Waiver and trade additions will appear here."}</small></article><article><span>TURNING POINT</span><strong>{story.seasonNarrative.turningPoint ? `Week ${story.seasonNarrative.turningPoint.week} vs ${story.seasonNarrative.turningPoint.opponent}` : "Still being written"}</strong><small>{story.seasonNarrative.turningPoint ? `${story.seasonNarrative.turningPoint.result === "W" ? "Won" : "Lost"} by ${Math.abs(story.seasonNarrative.turningPoint.margin).toFixed(1)}` : "A defining result will emerge from observed games."}</small></article><article><span>INJURIES OVERCOME</span><strong>{story.seasonNarrative.injuryRecoveries.reduce((sum, item) => sum + item.recovered, 0)} recoveries observed</strong><small>{story.seasonNarrative.snapshots.length < 2 ? "Tracking begins with this week’s saved snapshot." : "Counted only when the saved weekly injury burden declines."}</small></article><article><span>BEST ACQUISITION OUTCOME</span><strong>{story.seasonNarrative.bestDecision?.player ?? "No move graded yet"}</strong><small>{story.seasonNarrative.bestDecision ? `${story.seasonNarrative.bestDecision.pointsAfter.toFixed(1)} subsequent points after the move` : "This avoids labeling a decision before results exist."}</small></article></div></section>
    <section className="narrative-trends panel"><header><div><span>STORYLINES OVER TIME</span><h3>Fantasy Hub’s observed history</h3></div><small>Saved weekly · no reconstructed snapshots</small></header>{story.seasonNarrative.snapshots.length ? <div className="trend-grid"><article><strong>PLAYOFF OUTLOOK</strong>{story.seasonNarrative.snapshots.map((snapshot) => <div key={`odds-${snapshot.week}`}><span>W{snapshot.week}</span><i><b style={{ width: `${snapshot.playoffProbability ?? 0}%` }} /></i><em>{snapshot.playoffProbability ?? "—"}%</em></div>)}</article><article><strong>ROSTER VALUE INDEX</strong>{story.seasonNarrative.snapshots.map((snapshot) => <div key={`value-${snapshot.week}`}><span>W{snapshot.week}</span><i><b style={{ width: `${Math.min(100, Math.max(0, snapshot.rosterValueIndex ?? 0) / 1.3)}%` }} /></i><em>{snapshot.rosterValueIndex ?? "—"}</em></div>)}</article></div> : <p className="story-empty">The first weekly history point will appear after Fantasy Hub records this league.</p>}<p className="trend-note">Roster Value Index compares your average points to the league average (100 = league average). Estimated playoff outlook is a transparent standings-based indicator, not a Sleeper probability.</p></section>
    <section className={`fantasy-wrapped ${story.seasonNarrative.wrapped.ready ? "ready" : "preview"}`}><div><span>{story.seasonNarrative.wrapped.ready ? "FANTASY WRAPPED" : "SEASON STORY SO FAR"}</span><h3>{story.seasonNarrative.wrapped.headline}</h3><p>{story.seasonNarrative.wrapped.ready ? "Your year, distilled into the moments worth sharing." : "This card becomes your full Fantasy Wrapped as the playoffs arrive."}</p></div><div className="wrapped-stats"><article><strong>{story.seasonNarrative.wrapped.record}</strong><small>RECORD</small></article><article><strong>{story.seasonNarrative.wrapped.points.toFixed(1)}</strong><small>POINTS</small></article><article><strong>{story.seasonNarrative.wrapped.closeWins}</strong><small>CLOSE WINS</small></article><article><strong>{story.seasonNarrative.wrapped.bestWeek ? `W${story.seasonNarrative.wrapped.bestWeek.week}` : "—"}</strong><small>BEST WEEK</small></article></div><button onClick={() => void shareStory("wrapped", story.seasonNarrative.wrapped.shareText)}>{shared === "wrapped" ? "Copied!" : story.seasonNarrative.wrapped.ready ? "Share my Wrapped" : "Share season story"}</button></section>
    <p className="story-methodology">{story.methodology}</p>
  </div>;
}

function AllLeagueScoreboard({
  leagues,
  defaultWeek,
  onOpenLeague,
}: {
  leagues: ConnectedLeague[];
  defaultWeek: number;
  onOpenLeague: (league: ConnectedLeague) => Promise<void>;
}) {
  const openPlayer = useContext(PlayerOpenContext);
  const [week, setWeek] = useState(defaultWeek >= 1 && defaultWeek <= 18 ? defaultWeek : 1);
  const [scores, setScores] = useState<Record<string, ScoreboardData | null>>({});
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState("");
  const [swingFeed, setSwingFeed] = useState<{ id: string; league: string; text: string; previous: number; current: number; at: string }[]>([]);
  const previousOdds = useRef<Record<string, number>>({});
  useEffect(() => {
    if (!leagues.length) return;
    let active = true;
    const refresh = async () => {
      setLoading(true);
      const results = await Promise.all(
        leagues.map(async (league) => {
          try {
            const response = await fetch(`/api/scoreboard?leagueId=${encodeURIComponent(league.id)}&week=${week}`);
            if (!response.ok) return [league.id, null] as const;
            return [league.id, await response.json() as ScoreboardData] as const;
          } catch {
            return [league.id, null] as const;
          }
        }),
      );
      if (!active) return;
      setScores(Object.fromEntries(results));
      setUpdatedAt(new Date().toISOString());
      setLoading(false);
    };
    void refresh();
    const timer = window.setInterval(refresh, 30000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [leagues, week]);
  const gameDay = useMemo(() => {
    const matchups = leagues.flatMap((league) => {
      const data = scores[league.id];
      const matchup = data?.matchups.find((item) => item.teams.some((team) => team.isMine));
      const mine = matchup?.teams.find((team) => team.isMine);
      const opponent = matchup?.teams.find((team) => !team.isMine);
      if (!data || !matchup || !mine || !opponent) return [];
      const mineStarters = mine.topPlayers.filter((player) => player.isStarter);
      const opponentStarters = opponent.topPlayers.filter((player) => player.isStarter);
      const mineRemaining = mineStarters.reduce((sum, player) => sum + Math.max(0, (player.projection ?? 0) - player.points), 0);
      const opponentRemaining = opponentStarters.reduce((sum, player) => sum + Math.max(0, (player.projection ?? 0) - player.points), 0);
      const projectionsAvailable = [...mineStarters, ...opponentStarters].some((player) => player.projection != null);
      const status = matchup.status === "Final" ? "final" : matchup.status === "Scheduled" ? "pre" : "live";
      const winProbability = estimatedWinProbability({ yourPoints: mine.points, opponentPoints: opponent.points, yourRemaining: mineRemaining, opponentRemaining, status, projectionsAvailable });
      return [{ league, data, matchup, mine, opponent, mineStarters, opponentStarters, mineRemaining, opponentRemaining, winProbability, status }];
    });
    const exposures = matchups.flatMap((item) => [...item.mineStarters.map((player) => ({ playerId: player.id, playerName: player.name, position: player.position, nflTeam: player.nflTeam, side: "you", margin: item.mine.points - item.opponent.points, remainingProjection: Math.max(0, (player.projection ?? 0) - player.points), pointsNeeded: Math.max(0, item.opponent.points + item.opponentRemaining - item.mine.points - item.mineRemaining + Math.max(0, (player.projection ?? 0) - player.points)), state: item.status, leagueId: item.league.id, leagueName: item.league.name })), ...item.opponentStarters.map((player) => ({ playerId: player.id, playerName: player.name, position: player.position, nflTeam: player.nflTeam, side: "opponent", margin: item.mine.points - item.opponent.points, remainingProjection: Math.max(0, (player.projection ?? 0) - player.points), pointsNeeded: 0, state: item.status, leagueId: item.league.id, leagueName: item.league.name }))]);
    const playerGroups = new Map<string, typeof exposures>();
    exposures.forEach((item) => playerGroups.set(item.playerId, [...(playerGroups.get(item.playerId) ?? []), item]));
    const interests = rootingInterests(exposures).slice(0, 5).map((interest) => {
      const playerExposures = playerGroups.get(interest.playerId) ?? [];
      const helps = playerExposures.filter((item) => item.side === "you").length;
      const hurts = playerExposures.length - helps;
      return {
        ...interest,
        position: playerExposures[0]?.position ?? "NFL",
        nflTeam: playerExposures[0]?.nflTeam ?? "NFL",
        sentiment: helps && hurts ? "mixed" : helps ? "cheer" : "fade",
        affectedLeagues: playerExposures.map((item) => ({
          id: item.leagueId,
          name: item.leagueName,
          impact: item.side === "you" ? "helps" : "hurts",
        })),
      };
    });
    const leveragePlayers = [...playerGroups.entries()].map(([id, items]) => ({ id, name: items[0].playerName, ...playerLeverage(items), exposures: items })).sort((a, b) => b.score - a.score);
    const activePlayers = matchups.flatMap((item) => [...item.mineStarters, ...item.opponentStarters]).filter((player) => player.points > 0 && (player.projection == null || player.points < player.projection)).length;
    const completedPlayers = matchups.reduce(
      (count, matchup) =>
        count +
        [...matchup.mineStarters, ...matchup.opponentStarters].filter(
          (player) =>
            matchup.status === "final" ||
            (player.projection != null && player.points >= player.projection),
        ).length,
      0,
    );
    const totalStarters = matchups.reduce((sum, item) => sum + item.mineStarters.length + item.opponentStarters.length, 0);
    return { matchups, interests, leveragePlayers, activePlayers, completedPlayers, remainingPlayers: Math.max(0, totalStarters - activePlayers - completedPlayers) };
  }, [leagues, scores]);
  useEffect(() => {
    const changes = gameDay.matchups.flatMap((item) => {
      if (item.winProbability == null) return [];
      const previous = previousOdds.current[item.league.id];
      previousOdds.current[item.league.id] = item.winProbability;
      if (previous == null || Math.abs(item.winProbability - previous) < 5) return [];
      return [{ id: `${item.league.id}-${updatedAt}`, league: item.league.name, text: item.winProbability > previous ? "Your estimated win probability improved after the latest scoring refresh." : "Your estimated win probability declined after the latest scoring refresh.", previous, current: item.winProbability, at: updatedAt }];
    });
    if (changes.length) setSwingFeed((current) => [...changes, ...current].slice(0, 12));
  }, [gameDay.matchups, updatedAt]);
  const sundaySwingPreview = gameDay.matchups.slice(0, 3).map((item, index) => {
    const baseline = item.winProbability ?? 50;
    const movement = index === 1 ? -10 : index === 2 ? 5 : 15;
    const previous = Math.max(5, Math.min(95, baseline - movement));
    const current = Math.max(5, Math.min(95, baseline));
    return {
      id: `preview-${item.league.id}`,
      league: item.league.name,
      previous,
      current,
      text:
        movement > 0
          ? `${item.mineStarters[0]?.name ?? "Your starter"} made a high-impact play, improving your projected outcome.`
          : `${item.opponentStarters[0]?.name ?? "An opposing starter"} scored, tightening this matchup.`,
    };
  });
  if (!leagues.length)
    return (
      <div className="page-content">
        <SectionIntro kicker="ALL LEAGUES SCOREBOARD" title="Connect a league to track your matchups" text="Your matchup from every connected league will appear together here." />
      </div>
    );
  return (
    <div className="page-content portfolio-scoreboard-page">
      <section className="scoreboard-head portfolio-scoreboard-head">
        <div>
          <span>ALL LEAGUES SCOREBOARD</span>
          <h2>Your matchups, one live view.</h2>
          <p>Only your matchup from each connected league is shown. Scores refresh every 30 seconds.</p>
        </div>
        <label>
          Week
          <select value={week} onChange={(event) => setWeek(Number(event.target.value))}>
            {Array.from({ length: 18 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>Week {value}</option>)}
          </select>
        </label>
        <div className="live-refresh"><i />{loading ? "Refreshing" : `Updated ${updatedAt ? new Date(updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—"}`}</div>
      </section>
      <section className="game-day-command panel">
        <header><div><span>GAME DAY COMMAND CENTER</span><h3>What matters across your portfolio</h3></div><b>{gameDay.matchups.length} ACTIVE MATCHUPS</b></header>
        <div className="game-day-metrics">
          <article><span>PROJECTED RECORD</span><strong>{gameDay.matchups.filter((item) => (item.winProbability ?? 0) >= 50).length}–{gameDay.matchups.filter((item) => (item.winProbability ?? 100) < 50).length}</strong><small>Based on estimated win probability</small></article>
          <article><span>CLOSE MATCHUPS</span><strong>{gameDay.matchups.filter((item) => Math.abs(item.mine.points + item.mineRemaining - item.opponent.points - item.opponentRemaining) <= 12).length}</strong><small>Projected margin within 12</small></article>
          <article><span>PLAYERS ACTIVE</span><strong>{gameDay.activePlayers}</strong><small>{gameDay.remainingPlayers} remaining · {gameDay.completedPlayers} completed</small></article>
          <article><span>HIGHEST LEVERAGE</span><strong>{gameDay.leveragePlayers[0]?.name ?? "Waiting for lineups"}</strong><small>{gameDay.leveragePlayers[0] ? `${gameDay.leveragePlayers[0].level} · ${gameDay.leveragePlayers[0].score}/100 attention score` : "No direct exposure yet"}</small></article>
        </div>
      </section>
      <div className="game-day-insights">
        <section className="panel rooting-interests"><header><div><span>ROOTING INTERESTS</span><h3>Who to cheer—and who to stop</h3></div><b>📣 GAME-DAY PULSE</b></header>{gameDay.interests.length ? gameDay.interests.map((interest) => <article className={`rooting-${interest.sentiment}`} key={interest.playerId}><div className="rooting-visual"><NflTeamLogo team={interest.nflTeam} /><PlayerHeadshot id={interest.playerId} position={interest.position} /><i aria-hidden="true">{interest.sentiment === "cheer" ? "📣" : interest.sentiment === "fade" ? "🛑" : "⚖️"}</i></div><p><span>{interest.sentiment === "cheer" ? "ROOT FOR" : interest.sentiment === "fade" ? "ROOT AGAINST" : "MIXED ROOTING INTEREST"}</span><strong>{interest.playerName}</strong><small>{interest.text}</small><span className="rooting-leagues">{interest.affectedLeagues.map((league) => <b className={league.impact} key={`${interest.playerId}-${league.id}`}>{league.impact === "helps" ? "↑" : "↓"} {league.name}</b>)}</span></p><em><small>{interest.level}</small>{interest.score}</em></article>) : <p className="game-day-empty">Rooting interests appear when weekly lineups and projections are available.</p>}</section>
        <section className={`panel sunday-swing ${!swingFeed.length && sundaySwingPreview.length ? "preview" : ""}`}><header><div><span>SUNDAY SWING</span><h3>{swingFeed.length ? "Observed this session" : "Live scoring preview"}</h3></div>{!swingFeed.length && sundaySwingPreview.length && <b>TEST MODE</b>}</header>{swingFeed.length ? swingFeed.map((item) => <article key={item.id}><b className={item.current >= item.previous ? "positive" : "negative"}>{item.current >= item.previous ? "↑" : "↓"} {Math.abs(item.current - item.previous)} pts</b><p><strong>{item.league}</strong><small>{item.text}</small></p><time>{item.at ? new Date(item.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "Now"}</time></article>) : sundaySwingPreview.length ? <><p className="swing-preview-note">Illustrative preview using your connected matchups. These are not live events and will disappear when real scoring swings are observed.</p>{sundaySwingPreview.map((item, index) => <article className="swing-preview-card" key={item.id}><b className={item.current >= item.previous ? "positive" : "negative"}>{item.current >= item.previous ? "↑" : "↓"} {Math.abs(item.current - item.previous)} pts</b><p><strong>{item.league}</strong><small>{item.text}</small><span><i style={{ width: `${item.current}%` }} /></span></p><time>Q{Math.min(4, index + 1)} · DEMO</time></article>)}</> : <p className="game-day-empty">Changes will appear after Fantasy Hub observes a scoring refresh. No event history is fabricated.</p>}</section>
      </div>
      <div className="portfolio-scoreboard-grid">
        {leagues.map((league) => {
          const data = scores[league.id];
          const matchup = data?.matchups.find((item) => item.teams.some((team) => team.isMine));
          const mine = matchup?.teams.find((team) => team.isMine);
          const opponent = matchup?.teams.find((team) => !team.isMine);
          const leader = mine && opponent ? (mine.points >= opponent.points ? mine.rosterId : opponent.rosterId) : "";
          const consequence = gameDay.matchups.find((item) => item.league.id === league.id);
          const need = consequence ? whatDoINeed({ yourPoints: consequence.mine.points, opponentPoints: consequence.opponent.points, opponentRemaining: consequence.opponentRemaining, players: consequence.mineStarters, scoring: consequence.data.league.scoring ?? {} }) : null;
          const winProbability = consequence?.winProbability ?? null;
          const winOutlook = winProbability == null ? "Waiting for projections" : winProbability >= 65 ? "You’re favored" : winProbability >= 45 ? "Too close to call" : "Upset mode";
          const winTone = winProbability == null ? "unavailable" : winProbability >= 65 ? "favored" : winProbability >= 45 ? "toss-up" : "underdog";
          return (
            <article className={`score-game portfolio-score-game ${matchup ? "my-game" : ""}`} key={league.id}>
              <header>
                <span className={matchup?.status === "Live" ? "game-live" : ""}>{matchup?.status === "Live" ? "● LIVE" : matchup?.status ?? `WEEK ${week}`}</span>
                <b>{league.name}</b>
              </header>
              {mine && opponent ? (
                <div className="score-bug">
                  {[mine, opponent].map((team) => (
                    <div className={team.isMine ? "mine" : ""} key={team.rosterId}>
                      <span>{team.teamName.slice(0, 3).toUpperCase()}</span>
                      <p><strong>{team.teamName}</strong><small>{team.managerName}{team.isMine ? " · YOU" : ""}</small></p>
                      <b>{team.points.toFixed(2)}</b>
                      {leader === team.rosterId && <i>▲</i>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="portfolio-score-pending">{data ? `Your Week ${week} matchup has not been posted.` : loading ? "Loading your matchup…" : "This league’s scoreboard is unavailable."}</p>
              )}
              {consequence && <div className={`matchup-consequence ${winTone}`}>
                <div className="probability-copy"><span><i /> LIVE OUTLOOK</span><strong>Estimated win probability</strong><small>{winProbability == null ? "League projections are unavailable for this matchup." : `${consequence.mineRemaining.toFixed(1)} projected points remaining · refreshed ${updatedAt ? new Date(updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "now"}`}</small></div>
                <div className="probability-orbit" style={{ background: `conic-gradient(var(--probability-color) ${winProbability ?? 0}%, color-mix(in srgb,var(--ink) 10%,transparent) 0)` }}><div><b>{winProbability == null ? "—" : `${winProbability}%`}</b><small>TO WIN</small></div></div>
                <em>{winOutlook}</em>
              </div>}
              {consequence?.status !== "final" && need && <section className="what-needed">
                <header><span><i /> LIVE WIN PATH</span><strong>{need.teamNeed ? `${need.teamNeed.toFixed(1)} PTS NEEDED` : "PROJECTED LEAD"}</strong></header>
                <p>{need.message}</p>
                {need.targets.slice(0, 4).map((target) => <article key={target.id}><PlayerHeadshot id={target.id} position={target.position} /><div><div className="need-player-row"><button className="inline-player-link" onClick={() => openPlayer(playerShell(target))}>{target.name}</button><b>{target.progress}%</b></div><small>Needs about <b>{target.pointsNeeded.toFixed(1)} more points</b> · {target.statLine}</small><span className="need-progress"><i style={{ width: `${target.progress}%` }} /></span><em>{target.points.toFixed(1)} scored toward a {target.targetTotal.toFixed(1)} point target</em></div></article>)}
              </section>}
              {consequence?.status === "final" && <div className="postgame-review"><b>{consequence.mine.points > consequence.opponent.points ? "WIN" : consequence.mine.points < consequence.opponent.points ? "LOSS" : "TIE"}</b><p><strong>Postgame review</strong><small>{Math.abs(consequence.mine.points - consequence.opponent.points) <= 5 ? "A close final margin decided this matchup." : "The final scoring margin was decisive."} Results describe what happened, not whether the original lineup decision was sound.</small></p></div>}
              <footer className="score-game-actions">
                <button onClick={() => void onOpenLeague(league)}>Open league scoreboard →</button>
              </footer>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function Scoreboard({
  leagueId,
  defaultWeek,
  onBackAll,
  onOpenMatchup,
}: {
  leagueId: string;
  defaultWeek: number;
  onBackAll: () => void;
  onOpenMatchup: (matchupId: number) => void;
}) {
  const openPlayer = useContext(PlayerOpenContext);
  const [week, setWeek] = useState(
    defaultWeek >= 1 && defaultWeek <= 18 ? defaultWeek : 1,
  );
  const [data, setData] = useState<ScoreboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      setLoading(true);
      try {
        if (!leagueId) throw new Error("No league selected");
        const query = week ? `&week=${week}` : "";
        const response = await fetch(
          `/api/scoreboard?leagueId=${encodeURIComponent(leagueId)}${query}`,
        );
        const payload = (await response.json()) as ScoreboardData & {
          error?: string;
        };
        if (!response.ok)
          throw new Error(payload.error ?? "Scores unavailable");
        if (!active) return;
        setData(payload);
        setWeek((current) => current ?? payload.week);
        setError("");
      } catch (requestError) {
        if (active)
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Scores unavailable",
          );
      } finally {
        if (active) setLoading(false);
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 30000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [leagueId, week]);

  if (!leagueId)
    return (
      <div className="page-content">
        <SectionIntro
          kicker="WEEKLY SCOREBOARD"
          title="Choose a league to see every matchup"
          text="Select one of your connected leagues above and the live scoreboard will identify your matchup automatically."
        />
        <section className="panel scoreboard-empty">
          No league selected.
        </section>
      </div>
    );
  return (
    <div className="page-content">
      <section className="scoreboard-head">
        <div>
          <span>WEEKLY SCOREBOARD</span>
          <h2>{data?.league.name ?? "Loading league scores…"}</h2>
          <p>
            Scores and player stat lines refresh automatically every 30 seconds.
          </p>
          <button className="scoreboard-back" type="button" onClick={onBackAll}>← All leagues scoreboard</button>
        </div>
        <label>
          Week
          <select
            value={week ?? ""}
            onChange={(event) => setWeek(Number(event.target.value))}
          >
            {Array.from({ length: 18 }, (_, index) => index + 1).map(
              (value) => (
                <option key={value} value={value}>
                  Week {value}
                </option>
              ),
            )}
          </select>
        </label>
        <div className="live-refresh">
          <i />
          {loading
            ? "Refreshing"
            : `Updated ${data ? new Date(data.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—"}`}
        </div>
      </section>
      {error && <section className="scoreboard-error">{error}</section>}
      <div className="scoreboard-grid">
        {data?.matchups.map((matchup) => {
          const away = matchup.teams[0];
          const home = matchup.teams[1];
          const leader =
            home && away
              ? away.points > home.points
                ? away.rosterId
                : home.rosterId
              : "";
          return (
            <article
              className={`score-game ${matchup.teams.some((team) => team.isMine) ? "my-game" : ""}`}
              key={matchup.matchupId}
            >
              <header>
                <span className={matchup.status === "Live" ? "game-live" : ""}>
                  {matchup.status === "Live" ? "● LIVE" : matchup.status}
                </span>
                <b>
                  {matchup.teams.some((team) => team.isMine)
                    ? "YOUR MATCHUP"
                    : `MATCHUP ${matchup.matchupId}`}
                </b>
              </header>
              <div className="score-bug">
                {[away, home].filter(Boolean).map((team) => (
                  <div
                    className={team.isMine ? "mine" : ""}
                    key={team.rosterId}
                  >
                    <span>{team.teamName.slice(0, 3).toUpperCase()}</span>
                    <p>
                      <strong>{team.teamName}</strong>
                      <small>
                        {team.managerName}
                        {team.isMine ? " · YOU" : ""}
                      </small>
                    </p>
                    <b>{team.points.toFixed(2)}</b>
                    {leader === team.rosterId && <i>▲</i>}
                  </div>
                ))}
              </div>
              <div className="game-stats">
                {[away, home].filter(Boolean).map((team) => (
                  <section key={team.rosterId}>
                    <h4>{team.teamName} leaders</h4>
                    {[...team.topPlayers]
                      .sort((a, b) => b.points - a.points)
                      .slice(0, 3)
                      .map((player) => (
                      <div key={player.id}>
                        <PlayerHeadshot id={player.id} position={player.position} />
                        <p>
                          <button className="inline-player-link" onClick={() => openPlayer(playerShell(player))}>{player.name}</button>
                          <small>
                            {player.nflTeam} ·{" "}
                            {player.isStarter ? "Starter" : "Bench"}
                          </small>
                        </p>
                        <b>
                          {player.points.toFixed(1)}
                          <small>PTS</small>
                        </b>
                        <em>
                          {player.yards} YDS
                          {player.touchdowns
                            ? ` · ${player.touchdowns} TD`
                            : ""}
                          {player.targets
                            ? ` · ${player.receptions}/${player.targets} REC`
                            : ""}
                        </em>
                      </div>
                    ))}
                  </section>
                ))}
              </div>
              <footer className="score-game-actions">
                <button onClick={() => onOpenMatchup(matchup.matchupId)}>
                  Open matchup details →
                </button>
              </footer>
            </article>
          );
        })}
      </div>
      {data && !data.matchups.length && (
        <section className="panel scoreboard-empty">
          No matchups have been posted for Week {data.week}.
        </section>
      )}
    </div>
  );
}

function NflGames({
  leagueId,
  season,
  defaultWeek,
}: {
  leagueId: string;
  season: string;
  defaultWeek: number;
}) {
  const openPlayer = useContext(PlayerOpenContext);
  const [week, setWeek] = useState(
    defaultWeek >= 1 && defaultWeek <= 18 ? defaultWeek : 1,
  );
  const [data, setData] = useState<NflGameData | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedGames, setExpandedGames] = useState<Set<string>>(
    () => new Set(),
  );

  const toggleGamePlayers = (gameId: string) => {
    setExpandedGames((current) => {
      const next = new Set(current);
      if (next.has(gameId)) next.delete(gameId);
      else next.add(gameId);
      return next;
    });
  };

  useEffect(() => {
    if (!leagueId) return;
    let active = true;
    const refresh = async () => {
      setLoading(true);
      try {
        const query = week ? `&week=${week}` : "";
        const response = await fetch(
          `/api/nfl-games?leagueId=${encodeURIComponent(leagueId)}${query}`,
        );
        const payload = (await response.json()) as NflGameData & {
          error?: string;
        };
        if (!response.ok || !payload.games?.length)
          throw new Error(payload.error ?? "NFL games unavailable");
        if (!active) return;
        setData(payload);
        setWeek((current) => current ?? payload.week);
        setError("");
      } catch (requestError) {
        try {
          const scheduleResponse = await fetch(
            `/api/nfl-schedule?season=${encodeURIComponent(season)}`,
          );
          const schedule =
            (await scheduleResponse.json()) as NflScheduleData & {
              error?: string;
            };
          if (!scheduleResponse.ok)
            throw new Error(schedule.error ?? "Schedule unavailable");
          const selectedWeek =
            schedule.weeks.find((item) => item.week === week) ??
            schedule.weeks.find((item) => item.games.length > 0) ??
            schedule.weeks[0];
          const games = (selectedWeek?.games ?? []).map((game) => ({
            id: game.id,
            date: game.date,
            name: `${game.away.name} at ${game.home.name}`,
            status: game.status || "Scheduled",
            state: "pre",
            clock: "",
            venue: "",
            broadcast: game.broadcast,
            teams: [
              {
                ...game.away,
                displayName: game.away.name,
                homeAway: "away",
                score: 0,
                winner: false,
                color:
                  nflThemes
                    .find(
                      (team) =>
                        team.id === normalizeNflTeam(game.away.abbreviation),
                    )
                    ?.primary.slice(1) ?? "4b5563",
                logo: null,
                record: "",
              },
              {
                ...game.home,
                displayName: game.home.name,
                homeAway: "home",
                score: 0,
                winner: false,
                color:
                  nflThemes
                    .find(
                      (team) =>
                        team.id === normalizeNflTeam(game.home.abbreviation),
                    )
                    ?.primary.slice(1) ?? "4b5563",
                logo: null,
                record: "",
              },
            ],
            impactPlayers: [],
          }));
          if (!active) return;
          setData({
            league: { name: "NFL Schedule", season: String(schedule.season) },
            week: selectedWeek?.week ?? week,
            updatedAt: schedule.updatedAt,
            scoresAvailable: false,
            fallbackSchedule: true,
            fantasyMatchup: {
              available: false,
              yourPoints: 0,
              opponentPoints: 0,
              opponentName: "Opponent",
              playerCount: 0,
            },
            games,
          });
          setError("");
        } catch {
          if (active)
            setError(
              requestError instanceof Error
                ? requestError.message
                : "NFL games unavailable",
            );
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void refresh();
    return () => {
      active = false;
    };
  }, [leagueId, season, week]);

  useEffect(() => {
    if (!leagueId) return;
    let active = true;
    void loadWeatherData(season, week).then((payload) => {
      if (active) setWeather(payload);
    });
    return () => {
      active = false;
    };
  }, [leagueId, season, week]);

  return (
    <div className="page-content nfl-games-page">
      <section className="nfl-games-head">
        <div>
          <span>NFL GAME HUB</span>
          <h2>Every game. Your matchup in focus.</h2>
          <p>
            The complete season schedule is loaded now. Matchup players are
            attached when your fantasy league posts its weekly matchup.
          </p>
        </div>
        <label>
          Week
          <select
            value={week ?? ""}
            onChange={(event) => {
              setExpandedGames(new Set());
              setWeather(null);
              setWeek(Number(event.target.value));
            }}
          >
            {Array.from({ length: 18 }, (_, index) => index + 1).map(
              (value) => (
                <option key={value} value={value}>
                  Week {value}
                </option>
              ),
            )}
          </select>
        </label>
        <div className="live-refresh">
          <i />
          {loading
            ? "Refreshing"
            : `Updated ${data ? new Date(data.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—"}`}
        </div>
      </section>
      {data?.fallbackSchedule ? (
        <section className="schedule-fallback">
          <b>SCHEDULE MODE</b>
          <span>
            Fantasy Hub is using the published season schedule for preseason
            testing. Live scores can be layered onto these games once the
            regular-season feed is active.
          </span>
        </section>
      ) : data?.fantasyMatchup.available ? (
        <section className="fantasy-score-ribbon">
          <span>YOUR FANTASY MATCHUP</span>
          <strong>You {data.fantasyMatchup.yourPoints.toFixed(2)}</strong>
          <i>vs</i>
          <strong>
            {data.fantasyMatchup.opponentName}{" "}
            {data.fantasyMatchup.opponentPoints.toFixed(2)}
          </strong>
          <small>
            {data.fantasyMatchup.playerCount} players mapped to NFL games
          </small>
        </section>
      ) : (
        data && (
          <section className="fantasy-matchup-pending">
            Fantasy matchup details have not been posted for Week {data.week}.
            The complete NFL slate is still available below.
          </section>
        )
      )}
      {error && <section className="scoreboard-error">{error}</section>}
      <div className="nfl-game-grid">
        {data?.games.map((game) => {
          const isExpanded = expandedGames.has(game.id);
          const gameTeams = game.teams.map((team) =>
            normalizeNflTeam(team.abbreviation),
          );
          const gameWeather = weather?.games.find(
            (forecast) =>
              forecast.gameId === game.id ||
              (gameTeams.length === 2 &&
                gameTeams.every((team) => forecast.teams.includes(team))),
          );
          const weatherIcon = gameWeather?.indoor
            ? "🏟️"
            : (gameWeather?.precipitationProbability ?? 0) >= 40
              ? "🌧️"
              : (gameWeather?.windMph ?? 0) >= 15
                ? "💨"
                : (gameWeather?.temperatureF ?? 60) <= 35
                  ? "❄️"
                  : "☀️";
          const yourPlayerCount = game.impactPlayers.filter(
            (player) => player.side === "You",
          ).length;
          const opponentPlayerCount = game.impactPlayers.length - yourPlayerCount;
          const matchupMargin = data.fantasyMatchup.yourPoints - data.fantasyMatchup.opponentPoints;
          const consequentialPlayers = game.impactPlayers.map((player) => ({
            player,
            leverage: playerLeverage([{ side: player.side === "You" ? "you" : "opponent", margin: matchupMargin, remainingProjection: player.remainingProjection, state: game.state === "in" ? "live" : game.state === "post" ? "final" : "pre" }]),
          })).sort((a, b) => b.leverage.score - a.leverage.score);
          const gameLeverageScore = Math.min(100, Math.round(consequentialPlayers.reduce((sum, item) => sum + item.leverage.score, 0) * .7));
          const gameLeverageLevel = gameLeverageScore >= 60 ? "High" : gameLeverageScore >= 30 ? "Medium" : game.impactPlayers.length ? "Low" : "No Direct";
          const playerPanelId = `game-players-${game.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
          return (
          <article
            className={`nfl-game-card ${game.impactPlayers.length ? "has-impact" : ""} ${isExpanded ? "is-expanded" : ""}`}
            key={game.id}
          >
            <header>
              <div>
                <span className={game.state === "in" ? "game-live" : ""}>
                  {game.state === "in" ? "● LIVE" : game.status}
                </span>
                {game.clock && <b>{game.clock}</b>}
              </div>
              <small>
                {game.state === "pre"
                  ? new Date(game.date).toLocaleString([], {
                      weekday: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })
                  : game.broadcast || game.venue}
              </small>
              <b className={`game-impact-level leverage-${gameLeverageLevel.toLowerCase().replace(" ", "-")}`}>{gameLeverageLevel} Impact{gameLeverageScore ? ` · ${gameLeverageScore}` : ""}</b>
              {gameWeather &&
                (gameWeather.indoor || gameWeather.forecastAvailable) && (
                  <span className="game-weather" title={gameWeather.summary}>
                    <i aria-hidden="true">{weatherIcon}</i>
                    {gameWeather.indoor ? (
                      <b>Indoor</b>
                    ) : (
                      <>
                        {gameWeather.temperatureF != null && (
                          <b>{Math.round(gameWeather.temperatureF)}°</b>
                        )}
                        {gameWeather.windMph != null && (
                          <small>{Math.round(gameWeather.windMph)} mph wind</small>
                        )}
                        {gameWeather.precipitationProbability != null && (
                          <small>
                            {Math.round(gameWeather.precipitationProbability)}% rain
                          </small>
                        )}
                      </>
                    )}
                  </span>
                )}
            </header>
            <div className="nfl-score-bug">
              {game.teams.map((team) => (
                <div key={team.abbreviation}>
                  <span style={{ backgroundColor: `#${team.color}` }}>
                    <NflTeamLogo team={team.abbreviation} />
                  </span>
                  <p style={{ backgroundColor: `#${team.color}` }}>
                    <strong>{team.displayName}</strong>
                    <small>
                      {team.record}
                      {team.homeAway === "home" ? " · HOME" : ""}
                    </small>
                  </p>
                  <b>{data.scoresAvailable === false ? "—" : team.score}</b>
                  {team.winner && <i>▲</i>}
                </div>
              ))}
            </div>
            {game.impactPlayers.length > 0 ? (
              <section className="impact-roster">
                <button
                  className="impact-roster-toggle"
                  type="button"
                  aria-expanded={isExpanded}
                  aria-controls={playerPanelId}
                  onClick={() => toggleGamePlayers(game.id)}
                >
                  <span>
                    <strong>{isExpanded ? "Hide matchup players" : "Show matchup players"}</strong>
                    <small>
                      <b>{yourPlayerCount}</b> your team ·{" "}
                      <b>{opponentPlayerCount}</b> opponent · {game.impactPlayers.length} total
                    </small>
                  </span>
                  <i aria-hidden="true">⌄</i>
                </button>
                {isExpanded && (
                  <div className="impact-roster-expanded" id={playerPanelId}>
                    <section className="why-game-matters"><span>WHY THIS GAME MATTERS</span><strong>{consequentialPlayers[0]?.player.name} is the most consequential player in this game.</strong><small>{yourPlayerCount} player{yourPlayerCount === 1 ? "" : "s"} help you · {opponentPlayerCount} hurt you · {Math.abs(matchupMargin).toFixed(1)}-point current fantasy margin. {game.venue ? `${game.venue} · ` : ""}{game.broadcast || "Kickoff status shown above"}.</small></section>
                  <div className="impact-roster-players">
                    {(["You", "Opponent"] as const).map((side) => {
                      const sidePlayers = game.impactPlayers.filter(
                        (player) => player.side === side,
                      );
                      if (!sidePlayers.length) return null;
                      return (
                        <section
                          className={side === "You" ? "your-team" : "opponent-team"}
                          key={side}
                        >
                          <header>
                            <span>{side === "You" ? "YOUR TEAM" : "OPPONENT"}</span>
                            <b>{sidePlayers.length} PLAYER{sidePlayers.length === 1 ? "" : "S"}</b>
                          </header>
                          <div>
                            {sidePlayers.map((player) => (
                              <article key={`${player.side}-${player.id}`}>
                                <PlayerHeadshot id={player.id} position={player.position} />
                                <p>
                                  <button className="inline-player-link" onClick={() => openPlayer(playerShell(player))}>{player.name}</button>
                                  <small>{player.nflTeam} · {player.position} · {player.starter ? "Starter" : "Bench"}</small>
                                  <span>{player.projection == null ? "Projection unavailable" : `${player.projection.toFixed(1)} ${data.league.projectionSource ?? "league projection"} · ${player.remainingProjection.toFixed(1)} remaining`}</span>
                                </p>
                                <b>{player.fantasyPoints.toFixed(1)}<small>PTS</small></b>
                              </article>
                            ))}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                  </div>
                )}
              </section>
            ) : (
              <p className="no-impact">
                {data.fallbackSchedule
                  ? "Fantasy matchup players will appear here after your league posts its Week 1 matchup."
                  : "Fantasy matchup highlighting will appear here after the league posts this week’s matchup."}
              </p>
            )}
          </article>
          );
        })}
      </div>
      {data && !data.games.length && (
        <section className="panel scoreboard-empty">
          No regular-season NFL games were returned for Week {data.week}.
        </section>
      )}
    </div>
  );
}

const dynastyCurves: Record<
  string,
  { peakEnd: number; annualDecline: number }
> = {
  QB: { peakEnd: 34, annualDecline: 1.5 },
  RB: { peakEnd: 27, annualDecline: 4.2 },
  WR: { peakEnd: 30, annualDecline: 2.6 },
  TE: { peakEnd: 31, annualDecline: 2.1 },
  K: { peakEnd: 34, annualDecline: 1.4 },
  DEF: { peakEnd: 99, annualDecline: 0 },
};

function DynastyAnalytics({
  players,
  rankings,
  context,
  setSelectedPlayer,
}: {
  players: Player[];
  rankings: LeagueRanking[];
  context: RankingContext | null;
  setSelectedPlayer: (player: Player) => void;
}) {
  const rosterIds = new Set(players.map((player) => player.id));
  const positionRanks = new Map<string, number>();
  const playerPositionRanks = new Map<string, number>();
  [...rankings]
    .sort((a, b) => a.overallRank - b.overallRank)
    .forEach((player) => {
      const positionRank = (positionRanks.get(player.position) ?? 0) + 1;
      positionRanks.set(player.position, positionRank);
      playerPositionRanks.set(player.id, positionRank);
    });
  const assets = rankings
    .filter((player) => rosterIds.has(player.id) && player.age)
    .map((player) => {
      const curve = dynastyCurves[player.position] ?? {
        peakEnd: 29,
        annualDecline: 2.5,
      };
      const yearsToCliff = curve.peakEnd - (player.age ?? curve.peakEnd);
      const phase =
        yearsToCliff >= 3
          ? "Development"
          : yearsToCliff >= 0
            ? "Prime"
            : "Cliff watch";
      return {
        ...player,
        curve,
        yearsToCliff,
        phase,
        positionRank: playerPositionRanks.get(player.id) ?? null,
      };
    });
  const starters = assets.filter((player) => {
    const rosterPlayer = players.find(
      (candidate) => candidate.id === player.id,
    );
    return rosterPlayer ? isStartingPlayer(rosterPlayer) : false;
  });
  const averageAge = assets.length
    ? assets.reduce((sum, player) => sum + (player.age ?? 0), 0) / assets.length
    : 0;
  const cliffWatch = assets
    .filter(
      (player) =>
        player.yearsToCliff <= 1 &&
        player.position !== "K" &&
        player.position !== "DEF",
    )
    .sort(
      (a, b) =>
        a.yearsToCliff - b.yearsToCliff || a.overallRank - b.overallRank,
    );
  const youngCore = assets
    .filter(
      (player) =>
        player.yearsToCliff >= 3 &&
        player.overallRank <= (context?.teams ?? 12) * 8,
    )
    .sort((a, b) => a.overallRank - b.overallRank);
  const positionCounts = assets.reduce<Record<string, number>>(
    (counts, player) => ({
      ...counts,
      [player.position]: (counts[player.position] ?? 0) + 1,
    }),
    {},
  );
  const baseStrength = starters.length
    ? starters.reduce(
        (sum, player) => sum + Math.max(20, 105 - player.overallRank * 0.7),
        0,
      ) / starters.length
    : 50;
  const outlook = [0, 1, 2, 3].map((year) => {
    const score = starters.length
      ? starters.reduce((sum, player) => {
          const futureAge = (player.age ?? player.curve.peakEnd) + year;
          const decline =
            Math.max(0, futureAge - player.curve.peakEnd) *
            player.curve.annualDecline;
          const development =
            futureAge <= player.curve.peakEnd - 3 ? Math.min(5, year * 1.3) : 0;
          return (
            sum +
            Math.max(15, 105 - player.overallRank * 0.7 - decline + development)
          );
        }, 0) / starters.length
      : 50;
    return {
      year: new Date().getUTCFullYear() + year,
      score: Math.round(Math.min(99, Math.max(20, score))),
    };
  });
  const trajectory = outlook[3].score - outlook[0].score;
  const strategy =
    baseStrength >= 72 && trajectory >= -7
      ? "Compete while protecting the next window"
      : baseStrength >= 62
        ? "Re-tool without stripping the core"
        : "Accumulate ascending assets and future flexibility";

  if (!assets.length)
    return (
      <div className="page-content">
        <SectionIntro
          kicker="DYNASTY ANALYTICS"
          title="Your long-term roster model is loading"
          text="Reopen this dynasty league to refresh player ages, values, and roster ownership."
        />
        <section className="panel scoreboard-empty">
          No dynasty player-age sample is available yet.
        </section>
      </div>
    );
  return (
    <div className="page-content dynasty-page">
      <section className="dynasty-hero">
        <div>
          <span>DYNASTY COMMAND CENTER</span>
          <h2>{strategy}</h2>
          <p>
            Age curves, league-adjusted player value, positional scarcity,
            lineup role, and multi-year trajectory shape this roster plan.
          </p>
        </div>
        <div className="window-score">
          <small>WINDOW SCORE</small>
          <strong>{Math.round(baseStrength)}</strong>
          <span>
            {trajectory >= 0 ? "+" : ""}
            {trajectory} over three years
          </span>
        </div>
      </section>
      <div className="dynasty-metrics">
        <Metric
          label="Roster age"
          value={averageAge.toFixed(1)}
          detail={`${assets.length} age-qualified assets`}
        />
        <Metric
          label="Young core"
          value={String(youngCore.length)}
          detail="High-value assets 3+ years from cliff"
          tone="good"
        />
        <Metric
          label="Cliff watch"
          value={String(cliffWatch.length)}
          detail="At or within one year of peak end"
          tone={cliffWatch.length ? "warn" : "good"}
        />
        <Metric
          label="Three-year trend"
          value={`${trajectory >= 0 ? "+" : ""}${trajectory}`}
          detail="Modeled starter-window movement"
          tone={trajectory >= 0 ? "good" : "warn"}
        />
      </div>
      <div className="dynasty-main">
        <section className="panel dynasty-trajectory">
          <Header
            eyebrow="COMPETITIVE WINDOW"
            title="Four-year roster trajectory"
          />
          <div className="window-bars">
            {outlook.map((season, index) => (
              <div key={season.year}>
                <span>{season.score}</span>
                <i
                  style={{ height: `${season.score}%` }}
                  className={
                    season.score >= 72
                      ? "open"
                      : season.score >= 60
                        ? "fringe"
                        : "build"
                  }
                />
                <b>{season.year}</b>
                <small>
                  {index === 0
                    ? "Now"
                    : index === 3
                      ? "3-year"
                      : `Year ${index}`}
                </small>
              </div>
            ))}
          </div>
          <p>
            The window score blends starter quality with position-specific
            development and decline. It is a planning range, not a guarantee of
            standings.
          </p>
        </section>
        <section className="panel dynasty-allocation">
          <Header
            eyebrow="ASSET ALLOCATION"
            title="Roster timeline by position"
          />
          <div className="allocation-grid">
            {["QB", "RB", "WR", "TE"].map((position) => {
              const room = assets.filter(
                (player) => player.position === position,
              );
              const prime = room.filter(
                (player) => player.phase === "Prime",
              ).length;
              const development = room.filter(
                (player) => player.phase === "Development",
              ).length;
              const cliff = room.filter(
                (player) => player.phase === "Cliff watch",
              ).length;
              return (
                <article key={position}>
                  <strong>{position}</strong>
                  <span>{positionCounts[position] ?? 0} assets</span>
                  <div>
                    <i
                      className="develop"
                      style={{
                        width: `${room.length ? (development / room.length) * 100 : 0}%`,
                      }}
                    />
                    <i
                      className="prime"
                      style={{
                        width: `${room.length ? (prime / room.length) * 100 : 0}%`,
                      }}
                    />
                    <i
                      className="cliff"
                      style={{
                        width: `${room.length ? (cliff / room.length) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <small>
                    {development} developing · {prime} prime · {cliff} cliff
                  </small>
                </article>
              );
            })}
          </div>
        </section>
      </div>
      <div className="dynasty-lists">
        <section className="panel">
          <Header eyebrow="AGE CLIFF" title="Succession-plan watchlist" />
          <p className="model-caveat">
            A cliff flag does not mean “sell.” It signals rising downside and a
            need to preserve options before urgency reduces leverage.
          </p>
          <div className="dynasty-player-list">
            {cliffWatch.slice(0, 6).map((player) => (
              <button key={player.id} onClick={() => setSelectedPlayer(player)}>
                <span className={`pos pos-${player.position.toLowerCase()}`}>
                  {player.position}
                </span>
                <p>
                  <strong>{player.name}</strong>
                  <small>
                    Age {player.age} ·{" "}
                    {player.yearsToCliff < 0
                      ? `${Math.abs(player.yearsToCliff)} past peak end`
                      : player.yearsToCliff === 0
                        ? "At modeled peak end"
                        : `${player.yearsToCliff} year to peak end`}
                  </small>
                </p>
                <b>
                  #{player.overallRank}
                  <small>League rank</small>
                </b>
                <em className={player.yearsToCliff < 0 ? "danger" : "watch"}>
                  {player.yearsToCliff < 0 ? "Succession now" : "Prepare"}
                </em>
              </button>
            ))}
            {!cliffWatch.length && (
              <p className="dynasty-empty">
                No core skill-position assets are inside the immediate cliff
                window.
              </p>
            )}
          </div>
        </section>
        <section className="panel">
          <Header eyebrow="CORE ASSETS" title="Build-around timeline" />
          <p className="model-caveat">
            Young age alone is not value. Positional rank shows how each asset
            compares with players at the same position under this league’s
            settings.
          </p>
          <div className="dynasty-player-list">
            {youngCore.slice(0, 6).map((player) => (
              <button key={player.id} onClick={() => setSelectedPlayer(player)}>
                <span className={`pos pos-${player.position.toLowerCase()}`}>
                  {player.position}
                </span>
                <p>
                  <strong>{player.name}</strong>
                  <small>
                    Age {player.age} · {player.yearsToCliff} years to peak end
                  </small>
                </p>
                <b>
                  #{player.positionRank ?? "—"}
                  <small>
                    {player.position} rank · Overall #{player.overallRank}
                  </small>
                </b>
                <em className="core">Build around</em>
              </button>
            ))}
            {!youngCore.length && (
              <p className="dynasty-empty">
                No high-confidence young core has emerged from the current
                roster sample.
              </p>
            )}
          </div>
        </section>
      </div>
      <section className="panel dynasty-plan">
        <Header
          eyebrow="GM HUB PLAYBOOK"
          title="Three dynasty management priorities"
        />
        <div>
          {buildDynastyPriorities({
            cliffWatch,
            youngCore,
            trajectory,
            positionCounts,
          }).map((priority, index) => (
            <article key={priority.title}>
              <b>0{index + 1}</b>
              <span>
                <strong>{priority.title}</strong>
                <p>{priority.detail}</p>
              </span>
              <em>{priority.horizon}</em>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function buildDynastyPriorities({
  cliffWatch,
  youngCore,
  trajectory,
  positionCounts,
}: {
  cliffWatch: (LeagueRanking & { yearsToCliff: number })[];
  youngCore: LeagueRanking[];
  trajectory: number;
  positionCounts: Record<string, number>;
}) {
  const firstCliff = cliffWatch[0];
  const firstCore = youngCore[0];
  return [
    firstCliff
      ? {
          title: `Create optionality behind ${firstCliff.name}`,
          detail: `${firstCliff.position} decline risk typically accelerates after this modeled window. Add a developmental alternative or test the market without forcing a sale below value.`,
          horizon: firstCliff.yearsToCliff < 0 ? "Now" : "This season",
        }
      : {
          title: "Preserve the clean age curve",
          detail:
            "No immediate cliff concentration is present. Avoid replacing useful prime production simply to become younger.",
          horizon: "Ongoing",
        },
    firstCore
      ? {
          title: `Build the next window around ${firstCore.name}`,
          detail: `The roster’s strongest combination of league-adjusted value and runway should anchor multi-year trade decisions. Avoid exchanging that runway for marginal weekly gains.`,
          horizon: "2–3 years",
        }
      : {
          title: "Acquire one foundational young asset",
          detail:
            "The roster lacks a clear high-value player with three or more seasons of modeled runway. Prioritize quality over collecting low-upside youth.",
          horizon: "Next market",
        },
    trajectory < -5
      ? {
          title: "Reduce synchronized decline risk",
          detail: `The starter window falls ${Math.abs(trajectory)} points over three years. Stagger veteran exits so several positions do not lose value in the same offseason.`,
          horizon: "Before decline",
        }
      : {
          title: "Use depth to extend the competitive window",
          detail: `The three-year window is stable. Convert excess concentration${(positionCounts.WR ?? 0) >= 6 ? " at wide receiver" : " in deep rooms"} into scarcer starting value or future flexibility.`,
          horizon: "Trade window",
        },
  ];
}

function eligibleForSlot(player: Player, rawSlot: string) {
  const slot = rawSlot.toUpperCase().replace(/\s+/g, "_");
  if (slot === "QB") return player.position === "QB";
  if (slot === "RB") return player.position === "RB";
  if (slot === "WR") return player.position === "WR";
  if (slot === "TE") return player.position === "TE";
  if (["SUPER_FLEX", "SUPERFLEX", "QB_FLEX", "Q/W/R/T"].includes(slot))
    return ["QB", "RB", "WR", "TE"].includes(player.position);
  if (["FLEX", "REC_FLEX", "W/R/T"].includes(slot))
    return ["RB", "WR", "TE"].includes(player.position);
  if (["WR_RB_FLEX", "RB_WR_FLEX", "W/R"].includes(slot))
    return ["RB", "WR"].includes(player.position);
  return player.position === slot;
}

function startSitDecisions(players: Player[]) {
  const starters = players.filter(
    (player) =>
      player.role !== "Bench" &&
      player.role !== "IR" &&
      player.role !== "TAXI" &&
      !["K", "DEF"].includes(player.position),
  );
  const bench = players.filter(
    (player) =>
      player.role === "Bench" &&
      player.projection >= 2 &&
      !["Out", "IR", "Suspended"].includes(player.status),
  );
  const assignedCandidates = bench.flatMap((candidate) => {
    const bestSlot = starters
      .filter(
        (starter) =>
          eligibleForSlot(candidate, starter.role) &&
          candidate.projection >= Math.max(2, starter.projection * 0.55),
      )
      .map((starter) => ({
        starter,
        gap: Math.abs(starter.projection - candidate.projection),
      }))
      .sort((a, b) => a.gap - b.gap || a.starter.projection - b.starter.projection)[0];
    return bestSlot ? [{ ...bestSlot, candidate }] : [];
  });
  return starters
    .flatMap((starter) => {
      const candidates = assignedCandidates
        .filter((option) => option.starter.id === starter.id)
        .sort(
          (a, b) =>
            a.gap - b.gap || b.candidate.projection - a.candidate.projection,
        )
        .slice(0, 3)
        .map((option) => option.candidate);
      return candidates.length
        ? [{ starter, candidates, gap: Math.min(...candidates.map((candidate) => Math.abs(starter.projection - candidate.projection))) }]
        : [];
    })
    .sort((a, b) => a.gap - b.gap)
    .slice(0, 5);
}

function startSitDecision(players: Player[]) {
  const decision = startSitDecisions(players)[0];
  return decision
    ? { starter: decision.starter, candidate: decision.candidates[0] }
    : null;
}

function CommandCenter({
  players,
  waiverPlayers,
  totals,
  setView,
  setSelectedPlayer,
  starterChoice,
  setStarterChoice,
  periodLabel,
  context,
}: {
  players: Player[];
  waiverPlayers: WaiverPlayer[];
  totals: { projection: number; ceiling: number };
  setView: (v: View) => void;
  setSelectedPlayer: (p: Player) => void;
  starterChoice: string;
  setStarterChoice: (v: string) => void;
  periodLabel: string;
  context: RankingContext | null;
}) {
  const projectionPlatform = useContext(ProjectionPlatformContext);
  const concern = players.find((p) => p.status !== "Healthy");
  const decision = startSitDecision(players);
  const primaryDecision = decision?.starter;
  const secondaryDecision = decision?.candidate;
  const activeStarter =
    primaryDecision &&
    secondaryDecision &&
    [primaryDecision.name, secondaryDecision.name].includes(starterChoice)
      ? starterChoice
      : (primaryDecision?.name ?? "");
  const matchupEdges = players
    .filter((player) => isStartingPlayer(player) && player.matchupStrength)
    .map((player) => ({ player, range: matchupAdjustedRange(player) }))
    .sort((a, b) => Math.abs(b.range.edge) - Math.abs(a.range.edge));
  const topMatchupEdge = matchupEdges[0];
  const waiverPlans = waiverPlayers
    .map((add) => ({ add, plan: waiverAddDropPlan(add, players, context) }))
    .filter((item) => item.plan.worthIt && item.plan.drop)
    .slice(0, 2);
  return (
    <div className="page-content">
      <section className="hero">
        <div>
          <p>LINEUP LOCK · GAME DAY HQ</p>
          <h2>
            {periodLabel === "PRESEASON" ? "Build the lineup" : "Let’s go win"}
            <br />
            <em>
              {periodLabel === "PRESEASON"
                ? "before Week 1."
                : `${periodLabel}.`}
            </em>
          </h2>
          <span>
            Your roster is in the mix. One smart lineup call and an early waiver
            swing can turn a good week into a statement win.
          </span>
          <div className="game-day-pills">
            <b>🔥 Roster ready</b>
            <b>⚡ Lineup edges</b>
            <b>🎯 {projectionPlatform} projections</b>
          </div>
        </div>
        <div className="hero-score">
          <small>{projectionPlatform.toUpperCase()} PROJECTION</small>
          <strong>{totals.projection.toFixed(1)}</strong>
          <span>Current starting lineup</span>
        </div>
      </section>
      <div className="metric-grid">
        <Metric
          label="Win probability"
          value="64%"
          detail="+7% after lineup optimization"
          tone="good"
        />
        <Metric
          label="Projected rank"
          value="3rd"
          detail="of 12 teams this week"
        />
        <Metric
          label="Playoff odds"
          value="72%"
          detail="+4.2% over last week"
          tone="good"
        />
        <Metric
          label="Roster health"
          value="86"
          detail={concern ? `Monitor ${concern.name}` : "No active concerns"}
          tone="warn"
        />
      </div>
      <div className="main-grid">
        <section className="panel decision-panel">
          <Header
            eyebrow="TOP DECISION"
            title={
              decision
                ? `Review your ${formatRosterSlot(primaryDecision!.role)} slot`
                : "Your current starters are clear"
            }
            action="Open Start / Sit"
            onClick={() => setView("Start / Sit")}
          />
          {primaryDecision && secondaryDecision ? (
            <>
              <div className="player-versus">
                <PlayerChoice
                  player={primaryDecision}
                  active={activeStarter === primaryDecision.name}
                  onClick={() => setStarterChoice(primaryDecision.name)}
                />
                <div className="versus">VS</div>
                <PlayerChoice
                  player={secondaryDecision}
                  active={activeStarter === secondaryDecision.name}
                  onClick={() => setStarterChoice(secondaryDecision.name)}
                />
              </div>
              <div className="recommendation">
                <b>START {activeStarter.toUpperCase()}</b>
                <p>
                  Your current starter is compared only with a position-eligible
                  bench player close enough to be a realistic lineup
                  alternative.
                </p>
              </div>
            </>
          ) : (
            <div className="decision-empty">
              <strong>No legitimate starter challenge right now</strong>
              <p>
                No eligible bench player is within the consideration threshold
                of a current starter.
              </p>
            </div>
          )}
        </section>
        <section className="panel">
          <Header
            eyebrow="LINEUP PULSE"
            title="Your core starters"
            action="View team"
            onClick={() => setView("My Team")}
          />
          <div className="player-list">
            {players.slice(0, 4).map((p) => (
              <button key={p.id} onClick={() => setSelectedPlayer(p)}>
                <span className={`pos pos-${p.position.toLowerCase()}`}>
                  {p.position}
                </span>
                <div>
                  <strong>{p.name}</strong>
                  <small>
                    {p.team} · {p.opponent}
                  </small>
                </div>
                <div className="points">
                  <strong>{p.projection}</strong>
                  <small>PTS</small>
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>
      <div className="lower-grid">
        <section className="panel">
          <Header
            eyebrow="WAIVER PRIORITY"
            title="Move before your league does"
            action="See all"
            onClick={() => setView("Waiver Wire")}
          />
          <div className="waiver-preview">
            {waiverPlans.map(({ add: player, plan }, i) => (
              <div key={player.id}>
                <b>0{i + 1}</b>
                <span className={`pos pos-${player.position.toLowerCase()}`}>
                  {player.position}
                </span>
                <p>
                  <strong>{player.name}</strong>
                  <small>{player.team} · Add for {plan.drop!.name} · +{plan.improvement.toFixed(1)} roster value</small>
                </p>
                <em>{waiverBid(player, i)}</em>
              </div>
            ))}
            {!waiverPlans.length && (
              <p className="waiver-empty">
                No available player is currently worth the required roster drop.
              </p>
            )}
          </div>
        </section>
        <section className="panel matchup-card">
          <Header
            eyebrow="MATCHUP EDGE"
            title="Opponent rankings shape the tails"
            action="Open Start / Sit"
            onClick={() => setView("Start / Sit")}
          />
          {topMatchupEdge ? (
            <>
              <strong>{topMatchupEdge.player.name} · {topMatchupEdge.player.matchupStrength!.label} {topMatchupEdge.player.position} matchup</strong>
              <p>
                {topMatchupEdge.player.opponent} ranks #{topMatchupEdge.player.matchupStrength!.rank} in PPR fantasy points allowed to {matchupPosition(topMatchupEdge.player.position)}. The {projectionPlatform} projection remains the median; Fantasy Hub adjusts the outcome range used by Start/Sit.
              </p>
              <div>
                <span>Floor <b>{topMatchupEdge.player.floor.toFixed(1)} → {topMatchupEdge.range.floor.toFixed(1)}</b></span>
                <span>Ceiling <b>{topMatchupEdge.player.ceiling.toFixed(1)} → {topMatchupEdge.range.ceiling.toFixed(1)}</b></span>
              </div>
            </>
          ) : (
            <p>Opponent rankings will appear after the NFL schedule maps this roster to a supported position matchup.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function MyTeam({
  players,
  context,
  setSelectedPlayer,
}: {
  players: Player[];
  context: RankingContext | null;
  setSelectedPlayer: (p: Player) => void;
}) {
  const starters = players.filter(isStartingPlayer);
  const reserves = players.filter((player) => !isStartingPlayer(player));
  const requiredSlots = (context?.rosterSlots ?? [])
    .filter((slot) => slot !== "BN");
  const assignedSlotCounts = starters.reduce<Record<string, number>>(
    (counts, player) => ({
      ...counts,
      [player.role]: (counts[player.role] ?? 0) + 1,
    }),
    {},
  );
  const requiredSeen: Record<string, number> = {};
  const unfilledSlots = requiredSlots.reduce<string[]>((empty, slot) => {
    requiredSeen[slot] = (requiredSeen[slot] ?? 0) + 1;
    if ((assignedSlotCounts[slot] ?? 0) < requiredSeen[slot]) empty.push(slot);
    return empty;
  }, []);
  return (
    <div className="page-content">
      <SectionIntro
        kicker="ROSTER CONTROL"
        title="Your complete roster in league order"
        text="Weekly scoring estimates come directly from your connected league platform under its scoring settings. Fantasy Hub uses those values for lineup totals and decisions."
      />
      <RosterSection
        title="Starters"
        detail={
          requiredSlots.length
            ? `${starters.length}/${requiredSlots.length} lineup slots filled${unfilledSlots.length ? ` · ${unfilledSlots.length} empty` : ""}`
            : `${starters.length} active lineup slots`
        }
        players={starters}
        emptySlots={unfilledSlots}
        setSelectedPlayer={setSelectedPlayer}
      />
      <RosterSection
        title="Reserves"
        detail={`${reserves.length} bench, IR, and taxi players`}
        players={reserves}
        setSelectedPlayer={setSelectedPlayer}
      />
    </div>
  );
}

function RosterSection({
  title,
  detail,
  players,
  emptySlots = [],
  setSelectedPlayer,
}: {
  title: string;
  detail: string;
  players: Player[];
  emptySlots?: string[];
  setSelectedPlayer: (player: Player) => void;
}) {
  const projectionPlatform = useContext(ProjectionPlatformContext);
  return (
    <section className="roster-section panel">
      <header>
        <div>
          <span>{title === "Starters" ? "ACTIVE LINEUP" : "RESERVES"}</span>
          <h3>{title}</h3>
        </div>
        <small>{detail}</small>
      </header>
      <div className="table-panel">
        <table>
          <thead>
            <tr>
              <th>Player</th>
              <th>Slot</th>
              <th>Matchup</th>
              <th>{projectionPlatform} projection</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => (
              <tr key={player.id} onClick={() => setSelectedPlayer(player)}>
                <td>
                  <span className={`pos pos-${player.position.toLowerCase()}`}>
                    {player.position}
                  </span>
                  <strong>{player.name}</strong>
                  <small>{player.team}</small>
                </td>
                <td>
                  <span
                    className={
                      isStartingPlayer(player)
                        ? "roster-slot"
                        : "roster-slot bench"
                    }
                  >
                    {formatRosterSlot(player.role)}
                  </span>
                </td>
                <td>
                  <MatchupBadge player={player} />
                  {player.weatherSummary && (
                    <small className="roster-weather">☁ {player.weatherSummary}</small>
                  )}
                </td>
                <td>
                  <b className="league-projection">
                    {typeof player.leagueProjection === "number"
                      ? player.leagueProjection.toFixed(1)
                      : "—"}
                  </b>
                </td>
                <td>
                  <Status value={player.status} />
                </td>
              </tr>
            ))}
            {emptySlots.map((slot, index) => (
              <tr className="empty-starter-row" key={`empty-${slot}-${index}`}>
                <td>
                  <span className="empty-player-mark">+</span>
                  <strong>Empty starter slot</strong>
                  <small>Set your lineup before lock</small>
                </td>
                <td><span className="roster-slot empty">{formatRosterSlot(slot)}</span></td>
                <td>—</td>
                <td><b className="league-projection">—</b></td>
                <td><span className="empty-slot-status">NEEDS PLAYER</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!players.length && (
          <p className="empty-roster">
            No players are assigned to this section.
          </p>
        )}
      </div>
    </section>
  );
}

function TeamRankings({
  teams,
  selectedTeamId,
  rankings,
  context,
  setSelectedPlayer,
}: {
  teams: LeagueTeam[];
  selectedTeamId: string;
  rankings: LeagueRanking[];
  context: RankingContext | null;
  setSelectedPlayer: (player: Player) => void;
}) {
  const rankingById = new Map(rankings.map((player) => [player.id, player]));
  const isDynasty = context?.format === "Dynasty";
  const positions = ["QB", "RB", "WR", "TE"];
  const slotCounts = (context?.rosterSlots ?? []).reduce<
    Record<string, number>
  >((counts, slot) => ({ ...counts, [slot]: (counts[slot] ?? 0) + 1 }), {});
  const playerValue = (player: Player) => {
    const rank = rankingById.get(player.id)?.overallRank;
    return rank
      ? Math.max(24, 106 - Math.log2(rank + 1) * 10.5)
      : Math.min(88, player.projection * 3.3);
  };
  const roomNeed = (position: string) =>
    Math.max(
      1,
      slotCounts[position] ?? (position === "RB" || position === "WR" ? 2 : 1),
    );
  const rawTeams = teams.map((team) => {
    const roomScores = Object.fromEntries(
      positions.map((position) => {
        const values = team.roster
          .filter((player) => player.position === position)
          .map(playerValue)
          .sort((a, b) => b - a);
        const count = roomNeed(position);
        const core =
          values.slice(0, count).reduce((sum, value) => sum + value, 0) / count;
        const depth =
          values
            .slice(count, count + 2)
            .reduce((sum, value) => sum + value, 0) /
          Math.max(1, Math.min(2, values.length - count));
        return [position, Number((core * 0.82 + depth * 0.18).toFixed(1))];
      }),
    );
    const starterValues = team.roster.filter(isStartingPlayer).map(playerValue);
    const starterScore =
      starterValues.reduce((sum, value) => sum + value, 0) /
      Math.max(1, starterValues.length);
    const depthValues = team.roster
      .filter((player) => player.role === "Bench")
      .map(playerValue)
      .sort((a, b) => b - a)
      .slice(0, 5);
    const depthScore =
      depthValues.reduce((sum, value) => sum + value, 0) /
      Math.max(1, depthValues.length);
    return {
      ...team,
      roomScores,
      starterScore,
      depthScore,
      draftScore: team.draftCapital?.score ?? 0,
    };
  });
  const maxDraftScore = Math.max(1, ...rawTeams.map((team) => team.draftScore));
  const scoredTeams = rawTeams
    .map((team) => ({
      ...team,
      overallScore: Number(
        (
          team.starterScore * (isDynasty ? 0.62 : 0.76) +
          team.depthScore * (isDynasty ? 0.18 : 0.24) +
          (isDynasty ? (team.draftScore / maxDraftScore) * 100 * 0.2 : 0)
        ).toFixed(1),
      ),
    }))
    .sort((a, b) => b.overallScore - a.overallScore);
  const overallRanks = new Map(
    scoredTeams.map((team, index) => [team.id, index + 1]),
  );
  const roomRanks = Object.fromEntries(
    positions.map((position) => [
      position,
      new Map(
        [...scoredTeams]
          .sort((a, b) => b.roomScores[position] - a.roomScores[position])
          .map((team, index) => [team.id, index + 1]),
      ),
    ]),
  ) as Record<string, Map<string, number>>;
  const draftRanks = new Map(
    [...scoredTeams]
      .sort((a, b) => b.draftScore - a.draftScore)
      .map((team, index) => [team.id, index + 1]),
  );
  const myTeam = scoredTeams.find((team) => team.id === selectedTeamId);
  const strongestPosition = myTeam
    ? [...positions].sort(
        (a, b) =>
          (roomRanks[a].get(myTeam.id) ?? 99) -
          (roomRanks[b].get(myTeam.id) ?? 99),
      )[0]
    : "—";
  const weakestPosition = myTeam
    ? [...positions].sort(
        (a, b) =>
          (roomRanks[b].get(myTeam.id) ?? 0) -
          (roomRanks[a].get(myTeam.id) ?? 0),
      )[0]
    : "—";

  if (!teams.length)
    return (
      <div className="page-content">
        <SectionIntro
          kicker="LEAGUE POWER RANKINGS"
          title="Choose a league to rank every roster"
          text="Team and position-room rankings appear after Fantasy Hub imports all league rosters."
        />
        <section className="panel scoreboard-empty">
          No league selected.
        </section>
      </div>
    );
  return (
    <div className="page-content team-rankings-page">
      <SectionIntro
        kicker="LEAGUE POWER RANKINGS"
        title="See where every roster has an edge"
        text={`Overall rank blends league-adjusted starter value and depth${isDynasty ? ", with 20% allocated to discounted three-year rookie draft capital" : " using this league’s lineup and scoring settings"}. Position ranks compare the usable core and immediate depth in each room.`}
      />
      <div className="team-rank-summary">
        <Metric
          label="Your overall rank"
          value={`#${overallRanks.get(selectedTeamId) ?? "—"}`}
          detail={`of ${teams.length} league teams`}
          tone={(overallRanks.get(selectedTeamId) ?? 99) <= 3 ? "good" : "warn"}
        />
        <Metric
          label="Strongest room"
          value={strongestPosition}
          detail={
            myTeam
              ? `#${roomRanks[strongestPosition]?.get(myTeam.id) ?? "—"} in your league`
              : "Select your roster"
          }
          tone="good"
        />
        <Metric
          label="Weakest room"
          value={weakestPosition}
          detail={
            myTeam
              ? `#${roomRanks[weakestPosition]?.get(myTeam.id) ?? "—"} in your league`
              : "Select your roster"
          }
          tone="warn"
        />
        {isDynasty && (
          <Metric
            label="Draft capital"
            value={`#${draftRanks.get(selectedTeamId) ?? "—"}`}
            detail={`${myTeam?.draftCapital?.picks.length ?? 0} picks across three classes`}
          />
        )}
      </div>
      <section className="panel team-rank-table">
        <div
          className={`team-rank-row team-rank-head ${isDynasty ? "dynasty" : ""}`}
        >
          <span>Rank</span>
          <span>Team</span>
          <span>Overall</span>
          {positions.map((position) => (
            <span key={position}>{position}</span>
          ))}
          {isDynasty && <span>Draft capital</span>}
          <span>Core assets</span>
        </div>
        {scoredTeams.map((team) => {
          const coreAssets = team.roster
            .map((player) => rankingById.get(player.id))
            .filter((player): player is LeagueRanking => Boolean(player))
            .sort((a, b) => a.overallRank - b.overallRank)
            .slice(0, 3);
          const firstRounders =
            team.draftCapital?.picks.filter((pick) => pick.round === 1)
              .length ?? 0;
          const secondRounders =
            team.draftCapital?.picks.filter((pick) => pick.round === 2)
              .length ?? 0;
          return (
            <article
              className={`team-rank-row ${isDynasty ? "dynasty" : ""} ${team.id === selectedTeamId ? "your-team" : ""}`}
              key={team.id}
            >
              <b className="overall-place">#{overallRanks.get(team.id)}</b>
              <div className="rank-team-name">
                <strong>{team.teamName}</strong>
                <small>
                  {team.managerName}
                  {team.id === selectedTeamId ? " · YOUR TEAM" : ""}
                </small>
              </div>
              <strong className="team-score">{team.overallScore}</strong>
              {positions.map((position) => (
                <div className="room-rank" key={position}>
                  <b>#{roomRanks[position].get(team.id)}</b>
                  <small>{team.roomScores[position].toFixed(0)}</small>
                </div>
              ))}
              {isDynasty && (
                <div className="draft-rank">
                  <b>#{draftRanks.get(team.id)}</b>
                  <small>
                    {firstRounders} 1sts · {secondRounders} 2nds
                  </small>
                </div>
              )}
              <div className="core-assets">
                {coreAssets.map((player) => (
                  <button
                    key={player.id}
                    onClick={() => setSelectedPlayer(player)}
                  >
                    <span
                      className={`pos pos-${player.position.toLowerCase()}`}
                    >
                      {player.position}
                    </span>
                    {player.name}
                  </button>
                ))}
              </div>
            </article>
          );
        })}
      </section>
      {isDynasty && (
        <section className="panel draft-capital-explainer">
          <div>
            <span>DYNASTY DRAFT CAPITAL</span>
            <h3>Future picks are valued by round and time</h3>
            <p>
              Each roster begins with its original picks. Traded-pick ownership
              then moves those assets to the current owner. Earlier rounds carry
              more value, and picks farther into the future receive a modest
              discount.
            </p>
          </div>
          <div>
            <b>1st</b>
            <span>100</span>
            <b>2nd</b>
            <span>65</span>
            <b>3rd</b>
            <span>40</span>
            <b>Future year</b>
            <span>86% carry</span>
          </div>
        </section>
      )}
    </div>
  );
}

function PlayerRanks({
  roster,
  leagueRankings,
  context,
  setSelectedPlayer,
}: {
  roster: Player[];
  leagueRankings: LeagueRanking[];
  context: RankingContext | null;
  setSelectedPlayer: (player: Player) => void;
}) {
  const [position, setPosition] = useState("ALL");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<
    "overall" | "position" | "ppg" | "games" | "offense" | "snaps"
  >("overall");
  const rosterNames = new Set(
    roster.map((player) => player.name.toLowerCase()),
  );
  const teamCount = context?.teams ?? 12;
  const positionRanks = new Map<string, number>();
  const personalizedPool: (RankedPlayer & Partial<LeagueRanking>)[] =
    leagueRankings.map((player) => {
      const positionRank = (positionRanks.get(player.position) ?? 0) + 1;
      positionRanks.set(player.position, positionRank);
      const tier: 1 | 2 | 3 | 4 =
        player.overallRank <= teamCount
          ? 1
          : player.overallRank <= teamCount * 3
            ? 2
            : player.overallRank <= teamCount * 8
              ? 3
              : 4;
      const ageNote =
        context?.format === "Dynasty" && player.age
          ? `${player.age}-year-old ${player.ageAdjustment >= 0 ? "timeline boost" : "age adjustment"}`
          : `${context?.format ?? "Redraft"} horizon`;
      const lineupNote =
        player.lineupAdjustment >= 3
          ? "high lineup demand"
          : player.lineupAdjustment <= -1
            ? "lower positional demand"
            : "balanced positional demand";
      return {
        ...player,
        positionRank,
        tier,
        outlook: `${ageNote}; ${lineupNote} in this league.`,
      };
    });
  const pool: (RankedPlayer & Partial<LeagueRanking>)[] =
    personalizedPool.length ? personalizedPool : rankedPlayers;
  const filtered = pool
    .filter(
      (player) =>
        (position === "ALL" || player.position === position) &&
        player.name.toLowerCase().includes(query.trim().toLowerCase()),
    )
    .sort((a, b) => {
      if (sortBy === "position")
        return (
          a.position.localeCompare(b.position) ||
          a.positionRank - b.positionRank
        );
      if (sortBy === "ppg")
        return (b.fantasyPpg2025 ?? -1) - (a.fantasyPpg2025 ?? -1) || a.overallRank - b.overallRank;
      if (sortBy === "games")
        return (b.gamesPlayed2025 ?? -1) - (a.gamesPlayed2025 ?? -1) || a.overallRank - b.overallRank;
      if (sortBy === "offense")
        return (a.teamOffenseRank2025 ?? 99) - (b.teamOffenseRank2025 ?? 99) || a.overallRank - b.overallRank;
      if (sortBy === "snaps")
        return (b.snapAverage ?? -1) - (a.snapAverage ?? -1) || a.overallRank - b.overallRank;
      return a.overallRank - b.overallRank;
    });
  const tiers = [1, 2, 3, 4] as const;
  const tierLabels = {
    1: "Elite difference-makers",
    2: "Weekly advantages",
    3: "Strong starters",
    4: "Depth and emerging value",
  };
  return (
    <div className="page-content">
      <SectionIntro
        kicker="FANTASY HUB RANKINGS"
        title="Tier-based rankings built for your league"
        text={
          context
            ? `Annual player value calibrated for ${context.teams}-team ${context.format.toLowerCase()}, ${context.scoring}, positional demand, age curve, role, and your exact lineup.`
            : "Import a league to personalize every tier for scoring, format, lineup demand, positional scarcity, and roster horizon."
        }
      />
      {context && (
        <section className="ranking-context">
          <span>
            <b>{context.format}</b> roster horizon
          </span>
          <span>
            <b>{context.scoring}</b> reception scoring
          </span>
          <span>
            <b>{context.rosterSlots.filter((slot) => slot !== "BN").length}</b>{" "}
            starter slots
          </span>
          <span>
            <b>{context.positionDemand.QB > 1.4 ? "Superflex / 2QB" : "1QB"}</b>{" "}
            quarterback value
          </span>
          {context.tePremium > 0 && (
            <span>
              <b>+{context.tePremium} TE PPR</b> premium active
            </span>
          )}
        </section>
      )}
      <section className="ranking-method panel">
        <div>
          <span>2025 FANTASY PPG</span>
          <strong>Actual regular-season scoring</strong>
          <small>Average points per game adjusted for this league&apos;s reception scoring.</small>
        </div>
        <div>
          <span>TEAM OFFENSE</span>
          <strong>NFL points-per-game rank</strong>
          <small>The player&apos;s 2025 team ranked by regular-season scoring.</small>
        </div>
        <div>
          <span>SEASON SNAP %</span>
          <strong>Total participation share</strong>
          <small>Season-long unit snaps, weighted by each game&apos;s available snaps.</small>
        </div>
        <div>
          <span>HUB RANKS</span>
          <strong>Overall and positional standing</strong>
          <small>League-adjusted value remains separate from historical production.</small>
        </div>
      </section>
      <section className="rank-controls ranking-page-controls panel">
        <div
          className="position-filters"
          role="group"
          aria-label="Filter rankings by position"
        >
          {["ALL", "QB", "RB", "WR", "TE", "K", "DEF"].map((value) => (
            <button
              key={value}
              className={position === value ? "active" : ""}
              onClick={() => setPosition(value)}
            >
              {value}
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search all ranked players"
          aria-label="Search player rankings"
        />
        <select
          value={sortBy}
          onChange={(event) => setSortBy(event.target.value as typeof sortBy)}
          aria-label="Sort player rankings"
        >
          <option value="overall">Sort: Hub rank</option>
          <option value="position">Sort: Position rank</option>
          <option value="ppg">Sort: 2025 fantasy PPG</option>
          <option value="games">Sort: 2025 games played</option>
          <option value="offense">Sort: Team offense rank</option>
          <option value="snaps">Sort: Season snap %</option>
        </select>
        <span>{filtered.length} players</span>
      </section>
      <div className="tier-list ranking-tier-list">
        {tiers.map((tier) => {
          const tierPlayers = filtered.filter((player) => player.tier === tier);
          if (!tierPlayers.length) return null;
          return (
            <section className={`tier-section tier-${tier}`} key={tier}>
              <header>
                <div>
                  <span>TIER {tier}</span>
                  <h3>{tierLabels[tier]}</h3>
                </div>
                <small>{tierPlayers.length} players</small>
              </header>
              <div className="rank-table">
                <div className="rank-row ranking-detail-row rank-head">
                  <span>Overall</span>
                  <span>Player</span>
                  <span>Pos.</span>
                  <span>Pos. rank</span>
                  <span>Fantasy PPG</span>
                  <span>2025 GP</span>
                  <span>Team offense</span>
                  <span>Hub score</span>
                  <span>Season snap %</span>
                </div>
                {tierPlayers.map((player) => {
                  const onRoster = rosterNames.has(player.name.toLowerCase());
                  return (
                    <button
                      className={`rank-row ranking-detail-row ${onRoster ? "on-roster" : ""}`}
                      key={`${player.name}-${player.team}`}
                      onClick={() => setSelectedPlayer(player)}
                    >
                      <b>#{player.overallRank}</b>
                      <span className="rank-player">
                        <strong>{player.name}</strong>
                        <small>
                          {player.team}
                          {onRoster ? " · YOUR TEAM" : ""}
                        </small>
                      </span>
                      <span>
                        <i
                          className={`pos pos-${player.position.toLowerCase()}`}
                        >
                          {player.position}
                        </i>
                      </span>
                      <strong className="position-rank">#{player.positionRank}</strong>
                      <strong className="fantasy-ppg">
                        {typeof player.fantasyPpg2025 === "number" ? player.fantasyPpg2025.toFixed(1) : "—"}
                      </strong>
                      <span className="games-played">{player.gamesPlayed2025 ?? "—"}</span>
                      <span className="team-offense-rank">
                        {typeof player.teamOffenseRank2025 === "number" ? (
                          <><b>#{player.teamOffenseRank2025}</b><small>{player.team2025} · {player.teamPointsPerGame2025?.toFixed(1)} PPG</small></>
                        ) : "—"}
                      </span>
                      <strong className="hub-rank-score">
                        {typeof player.rankingValue === "number"
                          ? player.rankingValue.toFixed(1)
                          : "—"}
                      </strong>
                      <span className="rank-snap">
                        {typeof player.snapAverage === "number"
                          ? `${player.snapAverage.toFixed(1)}%`
                          : "—"}
                        {player.snapSeason ? <small>{player.snapSeason} REG</small> : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
        {!filtered.length && (
          <section className="panel rank-empty">
            No players match this filter.
          </section>
        )}
      </div>
    </div>
  );
}

function AdpPage({
  roster,
  leagueRankings,
  context,
  setSelectedPlayer,
}: {
  roster: Player[];
  leagueRankings: LeagueRanking[];
  context: RankingContext | null;
  setSelectedPlayer: (player: Player) => void;
}) {
  const [position, setPosition] = useState("ALL");
  const [query, setQuery] = useState("");
  const [adpSite, setAdpSite] = useState("Consensus");
  const [adpDirection, setAdpDirection] = useState<"asc" | "desc">("asc");
  const rosterNames = new Set(
    roster.map((player) => player.name.toLowerCase()),
  );
  const teamCount = context?.teams ?? 12;
  const positionRanks = new Map<string, number>();
  const personalizedPool: RankedPlayer[] = leagueRankings.map((player) => {
    const positionRank = (positionRanks.get(player.position) ?? 0) + 1;
    positionRanks.set(player.position, positionRank);
    const tier: 1 | 2 | 3 | 4 =
      player.overallRank <= teamCount
        ? 1
        : player.overallRank <= teamCount * 3
          ? 2
          : player.overallRank <= teamCount * 8
            ? 3
            : 4;
    const ageNote =
      context?.format === "Dynasty" && player.age
        ? `${player.age}-year-old ${player.ageAdjustment >= 0 ? "timeline boost" : "age adjustment"}`
        : `${context?.format ?? "Redraft"} horizon`;
    const lineupNote =
      player.lineupAdjustment >= 3
        ? "high lineup demand"
        : player.lineupAdjustment <= -1
          ? "lower positional demand"
          : "balanced positional demand";
    return {
      ...player,
      positionRank,
      tier,
      outlook: `${ageNote}; ${lineupNote} in this league.`,
    };
  });
  const pool = personalizedPool.length ? personalizedPool : rankedPlayers;
  const filtered = pool
    .filter(
      (player) =>
        (position === "ALL" || player.position === position) &&
        player.name.toLowerCase().includes(query.trim().toLowerCase()),
    )
    .sort((a, b) => {
      const aAdp = a.adpBySite?.[adpSite];
      const bAdp = b.adpBySite?.[adpSite];
      if (typeof aAdp !== "number" && typeof bAdp !== "number")
        return a.overallRank - b.overallRank;
      if (typeof aAdp !== "number") return 1;
      if (typeof bAdp !== "number") return -1;
      return adpDirection === "asc" ? aAdp - bAdp : bAdp - aAdp;
    });
  const adpSites = [
    "Consensus",
    "Sleeper",
    "ESPN",
    "CBS",
    "RTSports",
    "Fantrax",
  ];
  return (
    <div className="page-content">
      <SectionIntro
        kicker="DRAFT MARKET"
        title="Compare ADP across fantasy platforms"
        text={
          context
            ? `${context.format} ADP aligned to ${context.scoring} and ${context.positionDemand.QB > 1.4 ? "superflex / 2QB" : "1QB"} where the source supports it.`
            : "Import a league to select the most relevant scoring and roster-format ADP feed."
        }
      />
      {context && (
        <section className="ranking-context">
          <span>
            <b>{context.format}</b> roster horizon
          </span>
          <span>
            <b>{context.scoring}</b> reception scoring
          </span>
          <span>
            <b>{context.rosterSlots.filter((slot) => slot !== "BN").length}</b>{" "}
            starter slots
          </span>
          <span>
            <b>{context.positionDemand.QB > 1.4 ? "Superflex / 2QB" : "1QB"}</b>{" "}
            quarterback value
          </span>
          {context.tePremium > 0 && (
            <span>
              <b>+{context.tePremium} TE PPR</b> premium active
            </span>
          )}
        </section>
      )}
      <section className="rank-controls panel">
        <div
          className="position-filters"
          role="group"
          aria-label="Filter rankings by position"
        >
          {["ALL", "QB", "RB", "WR", "TE", "K", "DEF"].map((value) => (
            <button
              key={value}
              className={position === value ? "active" : ""}
              onClick={() => setPosition(value)}
            >
              {value}
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search all ranked players"
          aria-label="Search player rankings"
        />
        <span>{filtered.length} players</span>
      </section>
      <section className="adp-controls panel">
        <div>
          <span>ADP SOURCE</span>
          <strong>Compare where each platform is drafting players</strong>
        </div>
        <div className="adp-sites" role="group" aria-label="Select ADP source">
          {adpSites.map((site) => (
            <button
              key={site}
              className={adpSite === site ? "active" : ""}
              onClick={() => {
                if (adpSite === site)
                  setAdpDirection((current) =>
                    current === "asc" ? "desc" : "asc",
                  );
                else {
                  setAdpSite(site);
                  setAdpDirection("asc");
                }
              }}
            >
              {site}
              {adpSite === site ? (adpDirection === "asc" ? " ↑" : " ↓") : ""}
            </button>
          ))}
        </div>
        <small>
          Lower ADP means the player is typically selected earlier. Select the
          active source again to reverse sorting.
        </small>
      </section>
      <section className="tier-section adp-market-table">
        <header>
          <div>
            <span>{adpSite.toUpperCase()} MARKET</span>
            <h3>Average draft position</h3>
          </div>
          <small>{filtered.length} players</small>
        </header>
        <div className="rank-table">
          <div className="rank-row adp-market-row rank-head">
            <span>ADP</span>
            <span>Player</span>
            <span>Pos.</span>
            <span>Hub rank</span>
            <span>Market gap</span>
            <span>Availability</span>
          </div>
          {filtered.map((player) => {
            const onRoster = rosterNames.has(player.name.toLowerCase());
            const adp = player.adpBySite?.[adpSite];
            const gap =
              typeof adp === "number"
                ? Math.round(adp - player.overallRank)
                : null;
            return (
              <button
                className={`rank-row adp-market-row ${onRoster ? "on-roster" : ""}`}
                key={`${player.name}-${player.team}`}
                onClick={() => setSelectedPlayer(player)}
              >
                <strong className="rank-adp">
                  {typeof adp === "number" ? adp.toFixed(1) : "—"}
                </strong>
                <span className="rank-player">
                  <strong>{player.name}</strong>
                  <small>
                    {player.team}
                    {onRoster ? " · YOUR TEAM" : ""}
                  </small>
                </span>
                <span>
                  <i className={`pos pos-${player.position.toLowerCase()}`}>
                    {player.position}
                    {player.positionRank}
                  </i>
                </span>
                <b>#{player.overallRank}</b>
                <span
                  className={`market-gap ${gap != null && gap > 0 ? "positive" : gap != null && gap < 0 ? "negative" : ""}`}
                >
                  {gap == null ? "—" : `${gap > 0 ? "+" : ""}${gap}`}
                </span>
                <p>
                  {typeof adp === "number"
                    ? `Typically selected near pick ${Math.round(adp)} on ${adpSite}.`
                    : `${adpSite} ADP is not available for this player and format.`}
                </p>
              </button>
            );
          })}
        </div>
        {!filtered.length && (
          <section className="panel rank-empty">
            No players match this filter.
          </section>
        )}
      </section>
    </div>
  );
}

function StartSit({
  leagueId,
  week,
  players,
  teams,
  selectedTeamId,
  choice,
  setChoice,
  context,
}: {
  leagueId: string;
  week: number;
  players: Player[];
  teams: LeagueTeam[];
  selectedTeamId: string;
  choice: string;
  setChoice: (v: string) => void;
  context: RankingContext | null;
}) {
  const projectionPlatform = useContext(ProjectionPlatformContext);
  const decisions = useMemo(() => startSitDecisions(players), [players]);
  const [selectedBySlot, setSelectedBySlot] = useState<Record<string, string>>({});
  const yourTeam = teams.find((team) => team.id === selectedTeamId);
  const opponentTeam =
    yourTeam?.matchupId != null
      ? teams.find(
          (team) =>
            team.id !== yourTeam.id && team.matchupId === yourTeam.matchupId,
        )
      : undefined;
  const lineupProjection = (team?: LeagueTeam) =>
    team?.roster
      .filter(isStartingPlayer)
      .reduce((total, player) => total + (player.leagueProjection ?? 0), 0) ??
    0;
  const teamProjection = yourTeam
    ? lineupProjection(yourTeam)
    : players
        .filter(isStartingPlayer)
        .reduce((total, player) => total + (player.leagueProjection ?? 0), 0);
  const opponentProjection = opponentTeam
    ? lineupProjection(opponentTeam)
    : null;
  const matchupGap = (opponentProjection ?? teamProjection) - teamProjection;
  const recommendedAggression =
    opponentProjection == null
      ? 50
      : Math.max(10, Math.min(90, Math.round(50 + matchupGap * 2.5)));
  const [aggressiveness, setAggressiveness] = useState(recommendedAggression);
  const posture =
    aggressiveness < 35
      ? "Play it safe"
      : aggressiveness > 65
        ? "Shoot for upside"
        : "Balanced";
  const scorePlayer = (player: Player) => {
    const range = matchupAdjustedRange(player);
    return player.projection * 0.5 +
      range.floor * 0.5 * (1 - aggressiveness / 100) +
      range.ceiling * 0.5 * (aggressiveness / 100);
  };
  const rememberedStartSit = useMemo(() => decisions.map((decision) => {
    const options = [decision.starter, ...decision.candidates];
    const recommended = [...options].sort((a, b) => {
      const aRange = matchupAdjustedRange(a); const bRange = matchupAdjustedRange(b);
      const aScore = a.projection * .5 + aRange.floor * .5 * (1 - aggressiveness / 100) + aRange.ceiling * .5 * (aggressiveness / 100);
      const bScore = b.projection * .5 + bRange.floor * .5 * (1 - aggressiveness / 100) + bRange.ceiling * .5 * (aggressiveness / 100);
      return bScore - aScore;
    })[0];
    const confidence = Math.min(95, Math.max(50, Math.round(55 + Math.abs(recommended.projection - options.find((item) => item.id !== recommended.id)!.projection) * 4)));
    return { id: `start-sit:${week}:${decision.starter.id}`, leagueId, week, category: "start_sit", recommendation: recommended.name, alternatives: options.map((player) => ({ id: player.id, name: player.name, position: player.position, projection: player.projection, floor: player.floor, ceiling: player.ceiling })), information: { aggressiveness, recommendedAggression, teamProjection, opponentProjection, projectionSource: projectionPlatform, scoring: context?.scoring ?? null }, confidence };
  }), [aggressiveness, context?.scoring, decisions, leagueId, opponentProjection, projectionPlatform, recommendedAggression, teamProjection, week]);
  useEffect(() => { rememberedStartSit.forEach((decision) => rememberDecision(decision)); }, [rememberedStartSit]);
  if (!decisions.length)
    return (
      <div className="page-content">
        <SectionIntro
          kicker="WEEKLY DECISIONS"
          title="Your current lineup has no close calls"
          text="Fantasy Hub checked every starter against position-eligible bench alternatives with credible playing-time projections. No bench player is currently close enough to warrant a start/sit recommendation."
        />
        <section className="panel decision-empty">
          <strong>No realistic lineup swap identified</strong>
          <p>
            Players projected below 2.0 points, unavailable players, and bench
            players who are not eligible for a starter’s lineup slot are
            excluded.
          </p>
        </section>
      </div>
    );
  return (
    <div className="page-content">
      <SectionIntro
        kicker="WEEKLY DECISIONS"
        title="Choose the outcome your matchup requires"
        text={
          context
            ? `Weekly points come directly from your league platform using its ${context.scoring} scoring and ${context.scoringRuleCount} active scoring rules. Fantasy Hub uses that forecast to compare eligible lineup choices.`
            : "A favorite should protect its floor. An underdog may need more volatility and ceiling to create a realistic path to win."
        }
      />
      {context && (
        <section className="ranking-context start-sit-scoring">
          <span>
            <b>{context.scoring}</b> receptions
          </span>
          <span>
            <b>{context.passTouchdown} pts</b> passing TD
          </span>
          <span>
            <b>{context.interception} pts</b> interceptions
          </span>
          {context.tePremium > 0 && (
            <span>
              <b>+{context.tePremium} per TE catch</b> TE premium
            </span>
          )}
          {context.bonusRuleCount > 0 && (
            <span>
              <b>{context.bonusRuleCount}</b> bonus rules
            </span>
          )}
          <span>
            <b>{projectionPlatform}</b> projection source
          </span>
        </section>
      )}
      <section className="risk-console panel">
        <div className="matchup-inputs">
          <label>
            {yourTeam?.teamName ?? "Your team"}
            <input
              type="number"
              step="0.1"
              value={teamProjection.toFixed(1)}
              readOnly
            />
          </label>
          <span>VS</span>
          <label>
            {opponentTeam?.teamName ?? "Opponent not posted"}
            <input
              type="number"
              step="0.1"
              value={opponentProjection?.toFixed(1) ?? ""}
              placeholder="—"
              readOnly
            />
          </label>
        </div>
        <div className="risk-recommendation">
          <span>RECOMMENDED APPROACH</span>
          <strong>
            {recommendedAggression}% ·{" "}
            {recommendedAggression < 35
              ? "Play it safe"
              : recommendedAggression > 65
                ? "Shoot for upside"
                : "Balanced"}
          </strong>
          <p>
            {opponentProjection == null
              ? "The league has not posted a weekly opponent yet, so Fantasy Hub defaults to a balanced posture without inventing a matchup total."
              : matchupGap > 3
                ? `You project ${matchupGap.toFixed(1)} points behind. Accept more variance to improve your upset path.`
                : matchupGap < -3
                  ? `You project ${Math.abs(matchupGap).toFixed(1)} points ahead. Protect the favorite outcome with dependable volume.`
                  : "The matchup is close enough to favor balanced median outcomes."}
          </p>
          <button onClick={() => setAggressiveness(recommendedAggression)}>
            Use recommended
          </button>
        </div>
      </section>
      <section className="aggression-panel panel">
        <div>
          <span>START / SIT AGGRESSIVENESS</span>
          <strong>{aggressiveness}%</strong>
          <small>{posture}</small>
        </div>
        <input
          aria-label="Start sit aggressiveness"
          type="range"
          min="0"
          max="100"
          step="1"
          value={aggressiveness}
          onChange={(event) => setAggressiveness(Number(event.target.value))}
          style={{
            background: `linear-gradient(90deg, var(--green) 0%, var(--gold) ${aggressiveness}%, #dfe7df ${aggressiveness}%, #dfe7df 100%)`,
          }}
        />
        <div className="aggression-labels">
          <span>Protect floor</span>
          <span>Balanced</span>
          <span>Chase ceiling</span>
        </div>
      </section>
      <div className="start-sit-decisions">
        {decisions.map((decision, decisionIndex) => {
          const options = [decision.starter, ...decision.candidates];
          const recommendedPlayer = [...options].sort(
            (a, b) => scorePlayer(b) - scorePlayer(a),
          )[0];
          const storedChoice = selectedBySlot[decision.starter.id];
          const activeChoice = options.some((player) => player.name === storedChoice)
            ? storedChoice
            : decisionIndex === 0 && options.some((player) => player.name === choice)
              ? choice
              : recommendedPlayer.name;
          return <section className="start-sit-option" key={decision.starter.id}>
            <header>
              <div><span>LINEUP DECISION {decisionIndex + 1}</span><h3>{formatRosterSlot(decision.starter.role)} close call</h3></div>
              <small>{decision.candidates.length} eligible bench alternative{decision.candidates.length === 1 ? "" : "s"}</small>
            </header>
            <div className="compare-grid">
              {options.map((player) => {
                const modelChoice = recommendedPlayer.id === player.id;
                const currentlyStarting = player.id === decision.starter.id;
                const adjustedRange = matchupAdjustedRange(player);
                return <button
              key={player.id}
              className={`compare-card ${activeChoice === player.name ? "selected" : ""}`}
              onClick={() => {
                setSelectedBySlot((current) => ({ ...current, [decision.starter.id]: player.name }));
                setChoice(player.name);
                const memory = rememberedStartSit[decisionIndex];
                if (memory) rememberDecision({ ...memory, userSelection: player.name });
              }}
            >
              <div className="choice-top">
                <span className={`pos pos-${player.position.toLowerCase()}`}>
                  {player.position}
                </span>
                {modelChoice && <b>MODEL PICK</b>}
              </div>
              <small>
                {player.team} · {player.opponent}
              </small>
              <MatchupBadge player={player} />
              <h3>{player.name}</h3>
              <div className="range-bar">
                <i
                  style={{
                    left: `${adjustedRange.floor * 2.3}%`,
                    width: `${(adjustedRange.ceiling - adjustedRange.floor) * 2.3}%`,
                  }}
                />
                <b style={{ left: `${player.projection * 2.3}%` }} />
              </div>
              <div className="range-labels">
                <span>
                  Floor <b>{adjustedRange.floor}</b>
                </span>
                <span>
                  Projection <b>{player.projection}</b>
                </span>
                <span>
                  Ceiling <b>{adjustedRange.ceiling}</b>
                </span>
              </div>
              <p>
                {player.matchupStrength
                  ? `${player.matchupStrength.label} ${player.position} matchup (defense rank #${player.matchupStrength.rank}) ${adjustedRange.edge >= 0 ? "expands upside" : "adds downside risk"}. ${aggressiveness > 65 ? "Ceiling" : aggressiveness < 35 ? "Floor" : "Balanced tails"} drive a ${scorePlayer(player).toFixed(1)} risk-adjusted score.`
                  : aggressiveness > 65
                  ? `Ceiling carries more weight at this setting. Risk-adjusted score: ${scorePlayer(player).toFixed(1)}.`
                  : aggressiveness < 35
                    ? `Floor and role certainty carry more weight. Risk-adjusted score: ${scorePlayer(player).toFixed(1)}.`
                    : `Median projection leads the decision. Risk-adjusted score: ${scorePlayer(player).toFixed(1)}.`}
              </p>
              <strong className="select-label">
                {currentlyStarting
                  ? `CURRENT ${formatRosterSlot(player.role)}`
                  : `BENCH ALTERNATIVE · ELIGIBLE FOR ${formatRosterSlot(decision.starter.role)}`}
              </strong>
            </button>;
              })}
            </div>
            <section className="insight-box">
              <span>FANTASY HUB VERDICT · {formatRosterSlot(decision.starter.role)}</span>
              <h3>Start {recommendedPlayer.name}</h3>
              <p>
                At {aggressiveness}% aggressiveness, this recommendation weighs {aggressiveness > 65 ? "ceiling and game-breaking outcomes" : aggressiveness < 35 ? "floor, role certainty, and downside protection" : "floor, median, and ceiling more evenly"}. Every alternative shown is eligible for this lineup slot.
              </p>
            </section>
          </section>;
        })}
      </div>
    </div>
  );
}

type WaiverAddDropPlan = {
  drop: Player | null;
  improvement: number;
  worthIt: boolean;
};

function waiverAddDropPlan(
  add: WaiverPlayer,
  roster: Player[],
  context: RankingContext | null,
): WaiverAddDropPlan {
  const droppable = roster.filter(
    (player) =>
      player.role === "Bench" &&
      player.id !== add.id &&
      (!["K", "DEF"].includes(player.position) || player.position === add.position),
  );
  if (!droppable.length) return { drop: null, improvement: 0, worthIt: false };
  const positionCounts = roster.reduce<Record<string, number>>(
    (counts, player) => ({ ...counts, [player.position]: (counts[player.position] ?? 0) + 1 }),
    {},
  );
  const desiredAt = (position: string) =>
    Math.max(1, Math.ceil(context?.positionDemand[position] ?? (position === "RB" || position === "WR" ? 2 : 1)));
  const dropUtility = (player: Player) => {
    const projection = player.leagueProjection ?? player.projection;
    const roleEvidence = (player.snapAverage ?? player.snapPct ?? 0) / 25;
    const scarcityProtection = (positionCounts[player.position] ?? 0) <= desiredAt(player.position) + 1 ? 3 : 0;
    const availabilityPenalty = ["Out", "IR", "Suspended"].includes(player.status) ? -2 : 0;
    return projection + roleEvidence + scarcityProtection + availabilityPenalty;
  };
  const drop = [...droppable].sort((a, b) => dropUtility(a) - dropUtility(b))[0];
  const addProjection = add.leagueProjection ?? add.projection;
  const needBonus = (positionCounts[add.position] ?? 0) <= desiredAt(add.position) ? 2 : 0;
  const marketBonus = Math.max(0, 3 - add.overallRank * 0.025);
  const formatBonus = context?.format === "Dynasty" ? Math.max(0, add.ageAdjustment) * 0.18 : 0;
  const injuryPenalty = ["Out", "IR", "Suspended"].includes(add.status) ? 4 : add.status === "Questionable" ? 1 : 0;
  const addUtility = addProjection + add.lineupAdjustment * 0.35 + needBonus + marketBonus + formatBonus - injuryPenalty;
  const improvement = Number((addUtility - dropUtility(drop)).toFixed(1));
  return { drop, improvement, worthIt: improvement >= 1.5 };
}

function waiverBid(player: WaiverPlayer, index: number) {
  const positionPremium =
    player.position === "RB"
      ? 3
      : player.position === "WR"
        ? 2
        : player.position === "TE"
          ? 1
          : 0;
  const midpoint = Math.max(
    1,
    Math.min(
      24,
      Math.round(
        player.projection * 0.55 +
          player.lineupAdjustment * 0.35 +
          positionPremium -
          index * 0.35,
      ),
    ),
  );
  return `${Math.max(1, midpoint - 3)}–${Math.min(30, midpoint + 3)}% FAAB`;
}

function waiverReason(player: WaiverPlayer, context: RankingContext | null) {
  if (player.status !== "Healthy")
    return `${player.status} status lowers certainty, but the league-adjusted value keeps this player on the watchlist.`;
  if (context?.format === "Dynasty" && player.age && player.age <= 24)
    return `Youth, roster runway, and ${context.scoring} scoring create one of the strongest available dynasty profiles.`;
  if (player.lineupAdjustment >= 3)
    return `Your league’s lineup requirements increase ${player.position} scarcity and make this availability more valuable.`;
  if (player.projection >= 12)
    return `The current league-scored projection supports immediate lineup utility with usable weekly upside.`;
  return `This is one of the highest-ranked unrostered players under the league’s scoring and positional demand.`;
}

function WaiverWire({
  leagueId,
  week,
  players,
  roster,
  leagueSelected,
  leagueStatus,
  context,
  setSelectedPlayer,
}: {
  leagueId: string;
  week: number;
  players: WaiverPlayer[];
  roster: Player[];
  leagueSelected: boolean;
  leagueStatus: string;
  context: RankingContext | null;
  setSelectedPlayer: (player: Player) => void;
}) {
  const [planned, setPlanned] = useState<string[]>([]);
  const [position, setPosition] = useState("ALL");
  const availableRankById = new Map(
    players.map((player, index) => [player.id, index + 1]),
  );
  const positionCounts: Record<string, number> = {};
  const positionRankById = new Map<string, number>();
  players.forEach((player) => {
    positionCounts[player.position] = (positionCounts[player.position] ?? 0) + 1;
    positionRankById.set(player.id, positionCounts[player.position]);
  });
  const positionFilters = ["QB", "RB", "WR", "TE", "K", "DEF"].filter(
    (value) => players.some((player) => player.position === value),
  );
  const filtered = players
    .filter((player) => position === "ALL" || player.position === position);
  const waiverMemories = useMemo(() => players.slice(0, 8).flatMap((player, index) => {
    const plan = waiverAddDropPlan(player, roster, context);
    if (!plan.worthIt || !plan.drop) return [];
    return [{ id: `waiver:${week}:${player.id}`, leagueId, week, category: "waiver", recommendation: `Add ${player.name}; drop ${plan.drop.name}`, alternatives: [{ action: "Hold roster" }, { add: player.name, drop: plan.drop.name }], information: { playerId: player.id, dropPlayerId: plan.drop.id, projection: player.leagueProjection, improvement: plan.improvement, faab: waiverBid(player, index), scoring: context?.scoring ?? null }, confidence: Math.min(92, Math.max(50, Math.round(58 + plan.improvement * 5))) }];
  }), [context, leagueId, players, roster, week]);
  useEffect(() => { waiverMemories.forEach((decision) => rememberDecision(decision)); }, [waiverMemories]);
  if (!leagueSelected)
    return (
      <div className="page-content">
        <SectionIntro
          kicker="ROSTER MARKET"
          title="Choose a league to open its waiver wire"
          text="Available players are determined separately for every league."
        />
        <section className="panel scoreboard-empty">
          No league selected.
        </section>
      </div>
    );
  if (leagueStatus === "pre_draft")
    return (
      <div className="page-content">
        <SectionIntro
          kicker="ROSTER MARKET"
          title="The waiver wire opens after your draft"
          text="This league has not drafted, so players are not yet classified as rostered or available waiver options."
        />
        <section className="panel scoreboard-empty">
          No post-draft free-agent pool is available yet.
        </section>
      </div>
    );
  return (
    <div className="page-content">
      <SectionIntro
        kicker="LIVE LEAGUE AVAILABILITY"
        title="Turn available players into weekly leverage"
        text="Every player shown is currently unrostered across this league. Rankings adjust for league scoring, format, lineup demand, positional scarcity, projection, age, and availability."
      />
      <section className="waiver-controls panel">
        <div
          className="position-filters"
          role="group"
          aria-label="Filter waiver wire by position"
        >
          {["ALL", ...positionFilters].map((value) => (
            <button
              key={value}
              className={position === value ? "active" : ""}
              onClick={() => setPosition(value)}
            >
              {value}
            </button>
          ))}
        </div>
        <span>{filtered.length} of {players.length} available players</span>
      </section>
      <section className="waiver-list panel">
        <header>
          <span>AVAILABLE RANK</span>
          <span>PLAYER</span>
          <span>WEEKLY PROJ.</span>
          <span>STATUS</span>
          <span>CLAIM LEVEL</span>
          <span>ACTION</span>
        </header>
        <div>
          {filtered.map((player) => {
            const availableRank = availableRankById.get(player.id) ?? 0;
            const positionRank = positionRankById.get(player.id) ?? 0;
            const addDropPlan = waiverAddDropPlan(player, roster, context);
            return (
              <article key={player.id}>
                <b className="waiver-rank">#{availableRank}</b>
                <button
                  className="waiver-list-player"
                  onClick={() => setSelectedPlayer(player)}
                  aria-label={`Open ${player.name}`}
                >
                  <span className={`pos pos-${player.position.toLowerCase()}`}>
                    {player.position}
                  </span>
                  <p>
                    <strong>{player.name}</strong>
                    <small>
                      {player.team} · {player.position} #{positionRank} available · {addDropPlan.worthIt && addDropPlan.drop ? `Drop ${addDropPlan.drop.name} · +${addDropPlan.improvement.toFixed(1)} modeled roster value. ` : "Hold current roster; the add does not justify a drop. "}{waiverReason(player, context)}
                    </small>
                  </p>
                </button>
                <b className="waiver-projection">
                  {typeof player.leagueProjection === "number"
                    ? player.leagueProjection.toFixed(1)
                    : "—"}
                </b>
                <Status value={player.status} />
                <span className={`claim-level ${availableRank <= 3 ? "aggressive" : availableRank <= 12 ? "measured" : "watch"}`}>
                  <b>{availableRank <= 3 ? "Aggressive" : availableRank <= 12 ? "Measured" : "Watch"}</b>
                  <small>{waiverBid(player, availableRank - 1)} FAAB</small>
                </span>
                <button
                  className={planned.includes(player.id) ? "waiver-plan added" : "waiver-plan"}
                  disabled={!addDropPlan.worthIt || !addDropPlan.drop}
                  onClick={() => {
                    setPlanned((current) =>
                      current.includes(player.id)
                        ? current.filter((id) => id !== player.id)
                        : [...current, player.id],
                    );
                    const memory = waiverMemories.find((item) => item.id === `waiver:${week}:${player.id}`);
                    if (memory) rememberDecision({ ...memory, userSelection: planned.includes(player.id) ? "Removed from plan" : memory.recommendation });
                  }}
                >
                  {planned.includes(player.id)
                    ? "✓ Planned"
                    : addDropPlan.worthIt && addDropPlan.drop
                      ? `Add · Drop ${addDropPlan.drop.name.split(" ").at(-1)}`
                      : "Hold roster"}
                </button>
              </article>
            );
          })}
        </div>
      </section>
      {!filtered.length && (
        <section className="panel scoreboard-empty">
          No unrostered {position === "ALL" ? "players" : position} options were
          returned for this league.
        </section>
      )}
    </div>
  );
}

type FantasyTradeProfile = Pick<
  TradeAssetValue,
  "trueTalent" | "currentOverall" | "dynastyOverall" | "confidence"
>;

const clampTradeRating = (value: number, minimum = 45, maximum = 99) =>
  Math.round(Math.max(minimum, Math.min(maximum, value)));

function ratingFromPercentile(percentile: number) {
  const value = Math.max(0, Math.min(100, percentile));
  if (value >= 99.5) return 97;
  if (value >= 98) return 94 + ((value - 98) / 1.5) * 2;
  if (value >= 90) return 89 + ((value - 90) / 8) * 4;
  if (value >= 75) return 85 + ((value - 75) / 15) * 3;
  if (value >= 55) return 81 + ((value - 55) / 20) * 3;
  if (value >= 35) return 77 + ((value - 35) / 20) * 3;
  if (value >= 20) return 73 + ((value - 20) / 15) * 3;
  if (value >= 8) return 68 + ((value - 8) / 12) * 4;
  return 60 + (value / 8) * 7;
}

const rankingLookupKey = (player: Pick<Player, "name" | "position">) =>
  `name:${player.name.toLowerCase().replace(/[^a-z0-9]/g, "")}:${player.position}`;

function buildRankingLookup(rankings: LeagueRanking[]) {
  const lookup = new Map<string, LeagueRanking>();
  rankings.forEach((player) => {
    lookup.set(player.id, player);
    lookup.set(rankingLookupKey(player), player);
  });
  return lookup;
}

function rankingForPlayer(
  player: Player,
  rankingById: Map<string, LeagueRanking>,
) {
  return rankingById.get(player.id) ?? rankingById.get(rankingLookupKey(player));
}

function fantasyTradeProfile(
  player: Player,
  ranking: LeagueRanking | undefined,
): FantasyTradeProfile {
  const position = player.position;
  const overallRank = ranking?.overallRank ?? 600;
  const rankPercentile = 100 * (1 - (Math.min(600, overallRank) - 1) / 599);
  const rankGrade = ratingFromPercentile(rankPercentile);
  const ppg = ranking?.fantasyPpg2025;
  const games = ranking?.gamesPlayed2025 ?? 0;
  const productionBands: Record<string, [number, number]> = {
    QB: [14, 25],
    RB: [6, 21],
    WR: [6, 21],
    TE: [4, 17],
  };
  const [replacementPpg, elitePpg] = productionBands[position] ?? [5, 18];
  const rawProductionGrade =
    typeof ppg === "number"
      ? clampTradeRating(
          60 + ((ppg - replacementPpg) / (elitePpg - replacementPpg)) * 36,
          52,
          98,
        )
      : rankGrade;
  const productionWeight = Math.min(0.72, (games / 14) * 0.72);
  const productionGrade =
    rankGrade + (rawProductionGrade - rankGrade) * productionWeight;
  const snap = ranking?.snapAverage;
  const roleGrade =
    typeof snap === "number"
      ? clampTradeRating(55 + snap * 0.42, 50, 97)
      : rankGrade;
  const weeklyProjection = Math.max(
    player.projection,
    player.leagueProjection ?? 0,
  );
  const weeklyGrade = clampTradeRating(
    58 +
      ((weeklyProjection - replacementPpg) / (elitePpg - replacementPpg)) * 36,
    50,
    98,
  );
  const status = player.status.toLowerCase();
  const availabilityGrade =
    status === "healthy"
      ? 95
      : status === "questionable"
        ? 78
        : status === "doubtful"
          ? 60
          : status === "out" || status === "ir" || status === "suspended"
            ? 45
            : 86;
  const trueTalent = clampTradeRating(
    rankGrade * 0.44 +
      productionGrade * 0.34 +
      roleGrade * 0.14 +
      weeklyGrade * 0.08,
  );
  const currentOverall = clampTradeRating(
    trueTalent * 0.5 +
      weeklyGrade * 0.25 +
      availabilityGrade * 0.15 +
      roleGrade * 0.1,
  );
  const age = ranking?.age;
  const peakAge: Record<string, number> = { QB: 29, RB: 24, WR: 26, TE: 27 };
  const peak = peakAge[position] ?? 27;
  const provenYoungPlayer =
    games >= 8 && trueTalent >= 80 && rawProductionGrade >= 78;
  const ageAdjustment =
    typeof age !== "number"
      ? 0
      : age <= peak
        ? provenYoungPlayer
          ? Math.min(4, (peak - age) * 0.65)
          : 0
        : -(age - peak) * (position === "RB" ? 2.6 : position === "WR" ? 1.65 : position === "TE" ? 1.25 : 0.75);
  const futureOverall = clampTradeRating(trueTalent + ageAdjustment);
  const dynastyOverall = clampTradeRating(
    trueTalent * 0.55 + futureOverall * 0.35 + availabilityGrade * 0.1,
  );
  const evidencePoints =
    Math.min(2, games / 7) + (typeof snap === "number" ? 1 : 0) + (ranking ? 1 : 0);
  const confidence =
    evidencePoints >= 3.5 ? "High" : evidencePoints >= 2 ? "Medium" : "Low";
  return { trueTalent, currentOverall, dynastyOverall, confidence };
}

function tradeAsset(
  player: Player,
  rankingById: Map<string, LeagueRanking>,
  format: "Dynasty" | "Keeper" | "Redraft" = "Redraft",
): TradeAssetValue {
  const ranking = rankingForPlayer(player, rankingById);
  const profile = fantasyTradeProfile(player, ranking);
  const formatOverall =
    format === "Dynasty"
      ? profile.dynastyOverall
      : format === "Keeper"
        ? profile.currentOverall * 0.6 + profile.dynastyOverall * 0.4
        : profile.currentOverall;
  const scarcityAdjustment = (ranking?.lineupAdjustment ?? 0) * 0.3;
  const value = Math.max(
    8,
    Math.min(99, Math.round((formatOverall - 55) * 2.25 + scarcityAdjustment)),
  );
  return {
    id: player.id,
    name: player.name,
    position: player.position,
    team: player.team,
    meta: `${player.team} · ${format} · ${profile.confidence} confidence`,
    value,
    ...profile,
  };
}

function teamNeeds(
  team: LeagueTeam,
  rankingById: Map<string, LeagueRanking>,
  context: RankingContext | null,
) {
  return ["QB", "RB", "WR", "TE"]
    .map((position) => {
      const room = team.roster.filter((player) => player.position === position);
      const desired = Math.max(
        1,
        Math.ceil(context?.positionDemand[position] ?? 1),
      );
      const bestRank = Math.min(
        ...room.map(
          (player) => rankingForPlayer(player, rankingById)?.overallRank ?? 500,
        ),
        500,
      );
      return {
        position,
        score:
          Math.max(0, desired - room.length) * 80 +
          bestRank / Math.max(1, room.length),
      };
    })
    .sort((a, b) => b.score - a.score);
}

function tradeRosterStrength(
  roster: Player[],
  rankingById: Map<string, LeagueRanking>,
  context: RankingContext | null,
) {
  const slotCounts = (context?.rosterSlots ?? []).reduce<
    Record<string, number>
  >((counts, slot) => ({ ...counts, [slot]: (counts[slot] ?? 0) + 1 }), {});
  const positionScore = (player: Player) => {
    const ranking = rankingForPlayer(player, rankingById);
    return ranking
      ? tradeAsset(
          player,
          rankingById,
          context?.format ?? "Redraft",
        ).value
      : player.projection * 3;
  };
  const take = (position: string, count: number) =>
    roster
      .filter((player) => player.position === position)
      .map(positionScore)
      .sort((a, b) => b - a)
      .slice(0, count);
  const core = [
    ...take("QB", Math.max(1, slotCounts.QB ?? 1)),
    ...take("RB", Math.max(1, slotCounts.RB ?? 2)),
    ...take("WR", Math.max(1, slotCounts.WR ?? 2)),
    ...take("TE", Math.max(1, slotCounts.TE ?? 1)),
  ];
  const coreIds = new Set(
    ["QB", "RB", "WR", "TE"].flatMap((position) =>
      roster
        .filter((player) => player.position === position)
        .sort((a, b) => positionScore(b) - positionScore(a))
        .slice(
          0,
          Math.max(
            1,
            slotCounts[position] ??
              (position === "RB" || position === "WR" ? 2 : 1),
          ),
        )
        .map((player) => player.id),
    ),
  );
  const flexCount =
    (slotCounts.FLEX ?? 0) +
    (slotCounts.WR_RB_FLEX ?? 0) +
    (slotCounts.REC_FLEX ?? 0);
  const flex = roster
    .filter(
      (player) =>
        ["RB", "WR", "TE"].includes(player.position) && !coreIds.has(player.id),
    )
    .map(positionScore)
    .sort((a, b) => b - a)
    .slice(0, flexCount);
  const usable = [...core, ...flex];
  return Number(
    (
      usable.reduce((sum, value) => sum + value, 0) / Math.max(1, usable.length)
    ).toFixed(1),
  );
}

function buildTradeSuggestions(
  yourTeam: LeagueTeam,
  partner: LeagueTeam,
  rankings: LeagueRanking[],
  context: RankingContext | null,
  style: TradeStyle,
): TradeSuggestion[] {
  const policy = {
    Aggressive: {
      maxNeedRank: 4,
      valueGapMultiplier: 1.8,
      eliteMismatchMultiplier: 4.25,
      yourDeltaFloor: -0.55,
      partnerDeltaFloor: -0.4,
      combinedDeltaFloor: -0.1,
      offerRatioFloor: 0.8,
      acceptanceFloor: 25,
      requireConfidence: false,
    },
    Neutral: {
      maxNeedRank: 3,
      valueGapMultiplier: 1.35,
      eliteMismatchMultiplier: 2.5,
      yourDeltaFloor: -0.3,
      partnerDeltaFloor: -0.25,
      combinedDeltaFloor: 0.05,
      offerRatioFloor: 0.86,
      acceptanceFloor: 35,
      requireConfidence: false,
    },
    Strict: {
      maxNeedRank: 2,
      valueGapMultiplier: 0.85,
      eliteMismatchMultiplier: 1.8,
      yourDeltaFloor: -0.1,
      partnerDeltaFloor: 0,
      combinedDeltaFloor: 0.25,
      offerRatioFloor: 0.95,
      acceptanceFloor: 50,
      requireConfidence: true,
    },
  }[style];
  const rankingById = buildRankingLookup(rankings);
  const format = context?.format ?? "Redraft";
  const yourNeeds = teamNeeds(yourTeam, rankingById, context);
  const partnerNeeds = teamNeeds(partner, rankingById, context);
  const yourNeedOrder = new Map(
    yourNeeds.map((need, index) => [need.position, index]),
  );
  const partnerNeedOrder = new Map(
    partnerNeeds.map((need, index) => [need.position, index]),
  );
  const eligible = (player: Player) =>
    !["K", "DEF"].includes(player.position) && rankingById.has(player.id);
  const partnerAssets = partner.roster
    .filter(eligible)
    .map((player) => tradeAsset(player, rankingById, format))
    .sort(
      (a, b) =>
        (yourNeedOrder.get(a.position) ?? 9) -
          (yourNeedOrder.get(b.position) ?? 9) || b.value - a.value,
    );
  const yourAssets = yourTeam.roster
    .filter(eligible)
    .map((player) => tradeAsset(player, rankingById, format));
  const yourBefore = tradeRosterStrength(yourTeam.roster, rankingById, context);
  const partnerBefore = tradeRosterStrength(
    partner.roster,
    rankingById,
    context,
  );
  const premium = 1;
  const hasPositionDepth = (team: LeagueTeam, position: string) => {
    const desired = Math.max(1, Math.ceil(context?.positionDemand[position] ?? 1));
    return team.roster.filter((player) => player.position === position).length > desired;
  };
  const candidates = partnerAssets.flatMap((target) =>
    yourAssets.flatMap((offer) => {
      if (target.position === offer.position) return [];
      const yourNeedRank = yourNeedOrder.get(target.position) ?? 9;
      const partnerNeedRank = partnerNeedOrder.get(offer.position) ?? 9;
      const yourOfferNeedRank = yourNeedOrder.get(offer.position) ?? 9;
      const partnerTargetNeedRank = partnerNeedOrder.get(target.position) ?? 9;
      if (
        yourNeedRank > policy.maxNeedRank ||
        partnerNeedRank > policy.maxNeedRank
      )
        return [];
      if (
        (yourOfferNeedRank === 0 && !hasPositionDepth(yourTeam, offer.position)) ||
        (partnerTargetNeedRank === 0 && !hasPositionDepth(partner, target.position))
      )
        return [];
      if (
        policy.requireConfidence &&
        (target.confidence === "Low" || offer.confidence === "Low")
      )
        return [];
      const targetRank = rankingForPlayer(
        partner.roster.find((player) => player.id === target.id)!,
        rankingById,
      )?.overallRank ?? 999;
      const offerRank = rankingForPlayer(
        yourTeam.roster.find((player) => player.id === offer.id)!,
        rankingById,
      )?.overallRank ?? 999;
      const betterRank = Math.min(targetRank, offerRank);
      const worseRank = Math.max(targetRank, offerRank);
      const leagueSize = context?.teams ?? 12;
      const eliteAsset = betterRank <= leagueSize;
      if (
        (eliteAsset &&
          worseRank > leagueSize * policy.eliteMismatchMultiplier) ||
        (betterRank <= leagueSize * 3 &&
          worseRank > betterRank * policy.eliteMismatchMultiplier)
      )
        return [];
      const offerRatio = offer.value / Math.max(target.value, 1);
      if (offerRatio < policy.offerRatioFloor) return [];
      const valueGap =
        Math.abs(offer.value - target.value * premium) /
        Math.max(1, target.value);
      const maximumValueGap = eliteAsset
        ? 0.12
        : betterRank <= leagueSize * 3
          ? 0.18
          : 0.25;
      if (valueGap > maximumValueGap * policy.valueGapMultiplier) return [];
      const targetPlayer = partner.roster.find(
        (player) => player.id === target.id,
      )!;
      const offerPlayer = yourTeam.roster.find(
        (player) => player.id === offer.id,
      )!;
      const yourAfterRoster = [
        ...yourTeam.roster.filter((player) => player.id !== offer.id),
        targetPlayer,
      ];
      const partnerAfterRoster = [
        ...partner.roster.filter((player) => player.id !== target.id),
        offerPlayer,
      ];
      const yourAfter = tradeRosterStrength(
        yourAfterRoster,
        rankingById,
        context,
      );
      const partnerAfter = tradeRosterStrength(
        partnerAfterRoster,
        rankingById,
        context,
      );
      const yourDelta = yourAfter - yourBefore;
      const partnerDelta = partnerAfter - partnerBefore;
      if (
        yourDelta < policy.yourDeltaFloor ||
        partnerDelta < policy.partnerDeltaFloor ||
        yourDelta + partnerDelta < policy.combinedDeltaFloor
      )
        return [];
      const yourBenefit = Math.round(
        Math.max(52, Math.min(96, 68 + yourDelta * 8 + (2 - yourNeedRank) * 5)),
      );
      const partnerBenefit = Math.round(
        Math.max(
          52,
          Math.min(96, 68 + partnerDelta * 8 + (2 - partnerNeedRank) * 5),
        ),
      );
      const styleBase =
        style === "Aggressive" ? 76 : style === "Strict" ? 54 : 66;
      const acceptance = Math.round(
        Math.max(
          30,
          Math.min(
            91,
            styleBase +
              partnerDelta * 7 -
              valueGap * 35 +
              (offer.value / Math.max(target.value, 1) - 1) * 18,
          ),
        ),
      );
      if (acceptance < policy.acceptanceFloor) return [];
      const suggestion: TradeSuggestion = {
        id: `${partner.id}-${target.id}-${offer.id}`,
        title: `${target.position} help for ${offer.position} surplus`,
        receive: [target],
        send: [offer],
        yourBenefit,
        partnerBenefit,
        acceptance,
        confidence: Math.round(
          Math.max(
            58,
            Math.min(
              94,
              88 - valueGap * 35 + Math.min(yourDelta, partnerDelta) * 5,
            ),
          ),
        ),
        whyYou: `${target.name} addresses your #${yourNeedRank + 1} positional need and moves modeled roster strength from ${yourBefore.toFixed(1)} to ${yourAfter.toFixed(1)}.`,
        whyThem: `${offer.name} addresses ${partner.teamName}’s #${partnerNeedRank + 1} need and moves its modeled roster strength from ${partnerBefore.toFixed(1)} to ${partnerAfter.toFixed(1)}.`,
        yourBefore,
        yourAfter,
        partnerBefore,
        partnerAfter,
        format,
      };
      return [
        {
          suggestion,
          score:
            style === "Aggressive"
              ? (yourDelta + partnerDelta) * 12 +
                target.value * 0.08 -
                valueGap * 4
              : style === "Strict"
                ? partnerDelta * 22 +
                  Math.min(yourDelta, partnerDelta) * 18 +
                  acceptance * 0.08 -
                  valueGap * 18
                : Math.min(yourDelta, partnerDelta) * 20 +
                  yourDelta +
                  partnerDelta -
                  valueGap * 8,
        },
      ];
    }),
  );
  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((candidate) => candidate.suggestion);
}

function TradeLab({
  leagueId,
  week,
  teams,
  selectedTeamId,
  rankings,
  context,
}: {
  leagueId: string;
  week: number;
  teams: LeagueTeam[];
  selectedTeamId: string;
  rankings: LeagueRanking[];
  context: RankingContext | null;
}) {
  const yourTeam = teams.find((team) => team.id === selectedTeamId);
  const opponents = teams.filter(
    (team) => team.id !== selectedTeamId && team.roster.length,
  );
  const [selectedId, setSelectedId] = useState(opponents[0]?.id ?? "");
  const [styles, setStyles] = useState<Record<string, TradeStyle>>({});
  const [activeTargetId, setActiveTargetId] = useState("");
  const [calculatorSendId, setCalculatorSendId] = useState("");
  const [calculatorReceiveId, setCalculatorReceiveId] = useState("");
  const partner =
    opponents.find((team) => team.id === selectedId) ?? opponents[0];
  const partnerStyle = partner ? (styles[partner.id] ?? "Neutral") : "Neutral";
  const suggestions =
    yourTeam && partner
      ? buildTradeSuggestions(
          yourTeam,
          partner,
          rankings,
          context,
          partnerStyle,
        )
      : [];
  const suggestion =
    suggestions.find((item) => item.receive[0]?.id === activeTargetId) ??
    suggestions[0] ??
    null;
  const tradeMemoryFor = (item: TradeSuggestion) => ({ id: `trade:${week}:${partner?.id ?? "partner"}:${item.id}`, leagueId, week, category: "trade", recommendation: item.title, alternatives: suggestions.map((option) => ({ id: option.id, title: option.title, send: option.send.map((asset) => asset.name), receive: option.receive.map((asset) => asset.name), acceptance: option.acceptance })), information: { partner: partner?.teamName, negotiationProfile: partnerStyle, format: context?.format ?? "Redraft", send: item.send.map((asset) => ({ id: asset.id, name: asset.name, value: asset.value })), receive: item.receive.map((asset) => ({ id: asset.id, name: asset.name, value: asset.value })), yourBenefit: item.yourBenefit, partnerBenefit: item.partnerBenefit }, confidence: item.confidence });
  const tradeMemory = suggestion ? tradeMemoryFor(suggestion) : null;
  function selectPartner(id: string) {
    setSelectedId(id);
    setActiveTargetId("");
    setCalculatorSendId("");
    setCalculatorReceiveId("");
  }
  function updateStyle(style: TradeStyle) {
    if (!partner) return;
    setStyles((current) => ({ ...current, [partner.id]: style }));
  }
  if (!yourTeam)
    return (
      <div className="page-content">
        <SectionIntro
          kicker="TRADE INTELLIGENCE"
          title="Choose your team to build real trade ideas"
          text="Fantasy Hub needs your active roster before it can compare needs with league opponents."
        />
        <section className="panel scoreboard-empty">
          No fantasy team selected.
        </section>
      </div>
    );
  if (!partner)
    return (
      <div className="page-content">
        <SectionIntro
          kicker="TRADE INTELLIGENCE"
          title="No roster-based trade frameworks are available yet"
          text="Suggestions appear after at least two teams have drafted eligible players with league-adjusted values."
        />
        <section className="panel scoreboard-empty">
          Not enough roster data to construct a two-sided proposal.
        </section>
      </div>
    );
  const rankingById = buildRankingLookup(rankings);
  const tradeFormat = context?.format ?? "Redraft";
  const eligibleYourPlayers = yourTeam.roster.filter(
    (player) => !["K", "DEF"].includes(player.position),
  );
  const eligiblePartnerPlayers = partner.roster.filter(
    (player) => !["K", "DEF"].includes(player.position),
  );
  const effectiveSendId =
    calculatorSendId ||
    suggestion?.send[0]?.id ||
    eligibleYourPlayers[0]?.id ||
    "";
  const effectiveReceiveId =
    calculatorReceiveId ||
    suggestion?.receive[0]?.id ||
    eligiblePartnerPlayers[0]?.id ||
    "";
  const calculatorSend = yourTeam.roster.find(
    (player) => player.id === effectiveSendId,
  );
  const calculatorReceive = partner.roster.find(
    (player) => player.id === effectiveReceiveId,
  );
  const calculatorSendAsset = calculatorSend
    ? tradeAsset(calculatorSend, rankingById, tradeFormat)
    : null;
  const calculatorReceiveAsset = calculatorReceive
    ? tradeAsset(calculatorReceive, rankingById, tradeFormat)
    : null;
  const calculatorYourBefore = tradeRosterStrength(
    yourTeam.roster,
    rankingById,
    context,
  );
  const calculatorPartnerBefore = tradeRosterStrength(
    partner.roster,
    rankingById,
    context,
  );
  const calculatorYourAfter =
    calculatorSend && calculatorReceive
      ? tradeRosterStrength(
          [
            ...yourTeam.roster.filter(
              (player) => player.id !== calculatorSend.id,
            ),
            calculatorReceive,
          ],
          rankingById,
          context,
        )
      : calculatorYourBefore;
  const calculatorPartnerAfter =
    calculatorSend && calculatorReceive
      ? tradeRosterStrength(
          [
            ...partner.roster.filter(
              (player) => player.id !== calculatorReceive.id,
            ),
            calculatorSend,
          ],
          rankingById,
          context,
        )
      : calculatorPartnerBefore;
  const calculatorGap =
    calculatorSendAsset && calculatorReceiveAsset
      ? Math.abs(calculatorSendAsset.value - calculatorReceiveAsset.value) /
        Math.max(1, calculatorReceiveAsset.value)
      : 1;
  const calculatorMutual =
    calculatorYourAfter >= calculatorYourBefore &&
    calculatorPartnerAfter >= calculatorPartnerBefore;
  const calculatorProfile =
    partnerStyle === "Aggressive"
      ? { strongGap: 0.32, workableGap: 0.5, partnerGain: -0.4, yourGain: -0.55, offerRatio: 0.8 }
      : partnerStyle === "Strict"
        ? { strongGap: 0.14, workableGap: 0.22, partnerGain: 0, yourGain: -0.1, offerRatio: 0.95 }
        : { strongGap: 0.25, workableGap: 0.4, partnerGain: -0.25, yourGain: -0.3, offerRatio: 0.86 };
  const calculatorOfferRatio =
    calculatorSendAsset && calculatorReceiveAsset
      ? calculatorSendAsset.value / Math.max(1, calculatorReceiveAsset.value)
      : 0;
  const calculatorProfileFit =
    calculatorYourAfter - calculatorYourBefore >= calculatorProfile.yourGain &&
    calculatorPartnerAfter - calculatorPartnerBefore >= calculatorProfile.partnerGain &&
    calculatorOfferRatio >= calculatorProfile.offerRatio;
  const calculatorViability =
    !calculatorSend || !calculatorReceive
      ? "Select players"
      : calculatorSend.position === "TE" && calculatorReceive.position === "TE"
        ? "Poor roster fit"
        : calculatorProfileFit && calculatorGap <= calculatorProfile.strongGap
          ? "Strong framework"
          : calculatorProfileFit && calculatorGap <= calculatorProfile.workableGap
            ? "Negotiable"
            : calculatorMutual && calculatorGap <= calculatorProfile.workableGap
              ? "Fair value, weak fit"
              : "Low viability";
  return (
    <div className="page-content">
      <SectionIntro
        kicker="LIVE LEAGUE TRADE INTELLIGENCE"
        title="Find trades both actual rosters have a reason to accept"
        text="Every package uses players currently owned by the two selected teams. League-adjusted value, lineup demand, positional weakness, package balance, and manager behavior shape each suggestion."
      />
      <section className="trade-controls panel">
        <div>
          <label htmlFor="trade-partner">Trade partner</label>
          <select
            id="trade-partner"
            value={partner.id}
            onChange={(event) => selectPartner(event.target.value)}
          >
            {opponents.map((team) => (
              <option key={team.id} value={team.id}>
                {team.teamName} · {team.managerName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span>Negotiation profile</span>
          <div
            className="style-toggle"
            role="group"
            aria-label="Trade partner negotiation profile"
          >
            {(["Aggressive", "Neutral", "Strict"] as TradeStyle[]).map(
              (style) => (
                <button
                  key={style}
                  className={partnerStyle === style ? "active" : ""}
                  onClick={() => updateStyle(style)}
                >
                  {style}
                </button>
              ),
            )}
          </div>
        </div>
        <p>
          <strong>{partnerStyle}</strong>
          {partnerStyle === "Aggressive"
            ? "Expands eligible needs and value ranges, prioritizing higher-impact, higher-variance deals."
            : partnerStyle === "Strict"
              ? "Only recommends high-confidence packages with an overpay, a top need, and a clear roster gain."
              : "Uses balanced value ranges and requires a practical improvement for both starting lineups."}
        </p>
      </section>
      <section className="trade-calculator panel">
        <header>
          <div>
            <span>TRADE CALCULATOR</span>
            <h3>{tradeFormat} viability</h3>
            <p>
              {tradeFormat === "Dynasty"
                ? "Values include player age, career runway, league demand, and roster impact."
                : tradeFormat === "Keeper"
                  ? "Values blend current-season utility with a partial age and runway adjustment."
                  : "Values emphasize current-season rank, the connected league projection, lineup demand, and roster impact."}
            </p>
          </div>
          <b className={calculatorViability.toLowerCase().replaceAll(" ", "-")}>
            {calculatorViability}
          </b>
        </header>
        <div className="calculator-grid">
          <label>
            You send
            <select
              value={effectiveSendId}
              onChange={(event) => setCalculatorSendId(event.target.value)}
            >
              {yourTeam.roster
                .filter((player) => !["K", "DEF"].includes(player.position))
                .map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name} · {player.position}
                  </option>
                ))}
            </select>
          </label>
          <div className="calculator-score">
            <span>{calculatorSendAsset?.value ?? "—"}</span>
            <i>↔</i>
            <span>{calculatorReceiveAsset?.value ?? "—"}</span>
            <small>
              {calculatorGap < 1
                ? `${Math.round(calculatorGap * 100)}% value gap`
                : "Select both players"}
            </small>
          </div>
          <label>
            You receive
            <select
              value={effectiveReceiveId}
              onChange={(event) => setCalculatorReceiveId(event.target.value)}
            >
              {partner.roster
                .filter((player) => !["K", "DEF"].includes(player.position))
                .map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name} · {player.position}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <div className="calculator-impact">
          <span>
            Your roster{" "}
            <b>
              {calculatorYourBefore.toFixed(1)} →{" "}
              {calculatorYourAfter.toFixed(1)}
            </b>
          </span>
          <span>
            {partner.teamName}{" "}
            <b>
              {calculatorPartnerBefore.toFixed(1)} →{" "}
              {calculatorPartnerAfter.toFixed(1)}
            </b>
          </span>
          <span>
            Format <b>{tradeFormat}</b>
          </span>
        </div>
      </section>
      {suggestion ? (
        <>
          <div
            className="suggestion-tabs"
            role="tablist"
            aria-label="Recommended trade frameworks"
          >
            {suggestions.map((item, index) => (
              <button
                key={item.id}
                role="tab"
                aria-selected={suggestion.id === item.id}
                className={suggestion.id === item.id ? "active" : ""}
                onClick={() => {
                  setActiveTargetId(item.receive[0]?.id ?? "");
                  setCalculatorSendId(item.send[0]?.id ?? "");
                  setCalculatorReceiveId(item.receive[0]?.id ?? "");
                  const memory = tradeMemoryFor(item);
                  rememberDecision({ ...memory, userSelection: `Reviewed: ${item.title}` });
                }}
              >
                <span>OPTION {index + 1}</span>
                <strong>{item.title}</strong>
                <small>{item.acceptance}% estimated acceptance</small>
              </button>
            ))}
          </div>
          <div className="trade-board">
            <section>
              <span>YOU RECEIVE</span>
              {suggestion.receive.map((asset) => (
                <TradeAsset key={asset.id} asset={asset} />
              ))}
            </section>
            <div className="trade-balance">
              <strong>
                {Math.min(suggestion.yourBenefit, suggestion.partnerBenefit)}
              </strong>
              <span>Mutual benefit</span>
              <i>↔</i>
              <b>{suggestion.acceptance}% likely</b>
            </div>
            <section>
              <span>{partner.teamName.toUpperCase()} RECEIVES</span>
              {suggestion.send.map((asset) => (
                <TradeAsset key={asset.id} asset={asset} />
              ))}
            </section>
          </div>
          <div className="mutual-grid">
            <article>
              <span>YOUR TEAM</span>
              <strong>{suggestion.yourBenefit}</strong>
              <h3>Why this helps you</h3>
              <p>{suggestion.whyYou}</p>
            </article>
            <article>
              <span>{partner?.teamName ?? "Trade partner"}</span>
              <strong>{suggestion.partnerBenefit}</strong>
              <h3>Why they may accept</h3>
              <p>{suggestion.whyThem}</p>
            </article>
            <article>
              <span>DEAL CONFIDENCE</span>
              <strong>{suggestion.confidence}%</strong>
              <h3>Framework quality</h3>
              <p>
                Confidence reflects role certainty, valuation range, roster-need
                evidence, and the selected manager profile.
              </p>
            </article>
          </div>
          <section className="trade-note">
            <strong>Actual rosters, modeled acceptance</strong>
            <p>
              Player ownership and team needs are live for this league.
              Negotiation profiles alter package eligibility, value tolerance,
              need requirements, recommendation order, and estimated acceptance.
              Acceptance remains an estimate—not a claim about another manager’s decision.
            </p>
            <button onClick={() => tradeMemory && rememberDecision({ ...tradeMemory, userSelection: `Proposed: ${tradeMemory.recommendation}` })}>Mark as proposed</button>
          </section>
        </>
      ) : (
        <section className="panel trade-no-suggestions">
          <strong>No responsible recommendation for this matchup</strong>
          <p>
            The calculator remains available, but the engine found no
            cross-position deal that addresses both teams’ needs without
            weakening either usable lineup. Try another trade partner or test
            your own framework above.
          </p>
        </section>
      )}
    </div>
  );
}

function HeadToHeadMatchup({
  leagueId,
  defaultWeek,
  initialMatchupId,
}: {
  leagueId: string;
  defaultWeek: number;
  initialMatchupId: number | null;
}) {
  const openPlayer = useContext(PlayerOpenContext);
  const [week, setWeek] = useState(defaultWeek);
  const [data, setData] = useState<ScoreboardData | null>(null);
  const [matchupId, setMatchupId] = useState<number | null>(initialMatchupId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [nflSchedule, setNflSchedule] = useState<NflScheduleData | null>(null);
  const [matchupWeather, setMatchupWeather] = useState<WeatherData | null>(null);
  const [matchupStrengths, setMatchupStrengths] = useState<MatchupStrengthData | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/scoreboard?leagueId=${encodeURIComponent(leagueId)}&week=${week}`,
        );
        const payload = (await response.json()) as ScoreboardData & {
          error?: string;
        };
        if (!response.ok)
          throw new Error(payload.error ?? "Matchup unavailable");
        if (!active) return;
        setData(payload);
        setMatchupId((current) => {
          if (payload.matchups.some((matchup) => matchup.matchupId === current))
            return current;
          return (
            payload.matchups.find((matchup) =>
              matchup.teams.some((team) => team.isMine),
            )?.matchupId ??
            payload.matchups[0]?.matchupId ??
            null
          );
        });
        setError("");
      } catch (requestError) {
        if (active)
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Matchup unavailable",
          );
      } finally {
        if (active) setLoading(false);
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 30000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [leagueId, week]);

  useEffect(() => {
    const season = data?.league.season;
    if (!season) return;
    const controller = new AbortController();
    Promise.all([
      fetch(`/api/nfl-schedule?season=${encodeURIComponent(season)}`, { signal: controller.signal }),
      loadWeatherData(season, week),
      fetch(`/api/matchup-strength?season=${encodeURIComponent(season)}`, { signal: controller.signal }),
    ])
      .then(async ([scheduleResponse, weatherPayload, strengthResponse]) => {
        if (scheduleResponse.ok) setNflSchedule(await scheduleResponse.json() as NflScheduleData);
        setMatchupWeather(weatherPayload);
        if (strengthResponse.ok) setMatchupStrengths(await strengthResponse.json() as MatchupStrengthData);
      })
      .catch((requestError) => {
        if (requestError?.name !== "AbortError") {
          setNflSchedule(null);
          setMatchupWeather(null);
        }
      });
    return () => controller.abort();
  }, [data?.league.season, week]);

  const matchup =
    data?.matchups.find((item) => item.matchupId === matchupId) ?? null;
  const orderedTeams = matchup
    ? [...matchup.teams].sort((a, b) => Number(b.isMine) - Number(a.isMine))
    : [];
  const firstTeam = orderedTeams[0];
  const secondTeam = orderedTeams[1];
  const leaderId =
    firstTeam && secondTeam
      ? firstTeam.points >= secondTeam.points
        ? firstTeam.rosterId
        : secondTeam.rosterId
      : "";
  const matchupPlayer = (player: ScoreboardPlayer) =>
    applyMatchupStrength(
      applyWeather(
        applyOpponent(playerShell(player), nflSchedule, week),
        matchupWeather,
      ),
      matchupStrengths,
    );

  const teamColumn = (team: ScoreboardTeam | undefined, side: string) => {
    if (!team) return <section className="head-to-head-team empty">Team pending</section>;
    const starters = team.topPlayers.filter((player) => player.isStarter);
    const bench = team.topPlayers.filter((player) => !player.isStarter);
    const renderPlayers = (players: ScoreboardPlayer[]) =>
      players.map((player) => {
        const enriched = matchupPlayer(player);
        return (
        <article className="head-to-head-player" key={player.id}>
          <PlayerHeadshot id={player.id} position={player.position} />
          <p>
            <button
              className="inline-player-link"
              onClick={() => openPlayer(playerShell(player))}
            >
              {player.name}
            </button>
            <small>
              {formatRosterSlot(player.lineupSlot)} · {player.nflTeam} · {player.yards} YDS
              {player.touchdowns ? ` · ${player.touchdowns} TD` : ""}
              {player.targets
                ? ` · ${player.receptions}/${player.targets} REC`
                : ""}
            </small>
            <span className="head-to-head-matchup">
              <MatchupBadge player={enriched} />
              {enriched.weatherSummary && <small>☁ {enriched.weatherSummary}</small>}
            </span>
          </p>
          <b>{player.points.toFixed(2)}</b>
        </article>
        );
      });
    return (
      <section className={`head-to-head-team ${team.isMine ? "mine" : ""}`}>
        <header>
          <span>{team.isMine ? "YOUR TEAM" : side}</span>
          <h3>{team.teamName}</h3>
          <small>{team.managerName}</small>
          <strong>{team.points.toFixed(2)}</strong>
          {leaderId === team.rosterId && <i>LEADING</i>}
        </header>
        <div className="head-to-head-group">
          <h4>STARTERS · {starters.length}</h4>
          {renderPlayers(starters)}
          {!starters.length && <p className="matchup-roster-empty">No starters posted.</p>}
        </div>
        {bench.length > 0 && (
          <details className="head-to-head-bench">
            <summary>Bench · {bench.length} players</summary>
            {renderPlayers(bench)}
          </details>
        )}
      </section>
    );
  };

  return (
    <div className="page-content head-to-head-page">
      <section className="head-to-head-hero">
        <div>
          <span>LIVE MATCHUP CENTER</span>
          <h2>{data?.league.name ?? "Loading matchup…"}</h2>
          <p>Fantasy scoring refreshes every 30 seconds. NFL opponent, weather, and position matchup grades use live schedule data and {matchupStrengths?.sourceSeason ?? 2025} fantasy points allowed.</p>
        </div>
        <label>
          Week
          <select value={week} onChange={(event) => setWeek(Number(event.target.value))}>
            {Array.from({ length: 18 }, (_, index) => index + 1).map((value) => (
              <option key={value} value={value}>Week {value}</option>
            ))}
          </select>
        </label>
        {data && data.matchups.length > 1 && (
          <label>
            Matchup
            <select
              value={matchupId ?? ""}
              onChange={(event) => setMatchupId(Number(event.target.value))}
            >
              {data.matchups.map((item) => (
                <option key={item.matchupId} value={item.matchupId}>
                  {item.teams.map((team) => team.teamName).join(" vs ")}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="live-refresh"><i />{loading ? "Refreshing" : `Updated ${data ? new Date(data.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—"}`}</div>
      </section>
      {error && <section className="scoreboard-error">{error}</section>}
      {matchup && firstTeam && secondTeam ? (
        <>
          <section className="head-to-head-score panel">
            <div><small>{firstTeam.isMine ? "YOU" : firstTeam.teamName}</small><strong>{firstTeam.points.toFixed(2)}</strong></div>
            <span><b>{matchup.status === "Live" ? "● LIVE" : matchup.status}</b><i>VS</i><small>Week {data?.week}</small></span>
            <div><small>{secondTeam.isMine ? "YOU" : secondTeam.teamName}</small><strong>{secondTeam.points.toFixed(2)}</strong></div>
          </section>
          <div className="head-to-head-grid">
            {teamColumn(firstTeam, "TEAM 1")}
            {teamColumn(secondTeam, "OPPONENT")}
          </div>
        </>
      ) : (
        !error && <section className="panel scoreboard-empty">{loading ? "Loading live matchup…" : "No matchup has been posted for this week."}</section>
      )}
    </div>
  );
}

// Retained as the season-schedule renderer while the Matchups navigation uses
// the live head-to-head game center above.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function Matchups({
  players,
  season,
  defaultWeek,
}: {
  players: Player[];
  season: string;
  defaultWeek: number;
}) {
  const openPlayer = useContext(PlayerOpenContext);
  const [schedule, setSchedule] = useState<NflScheduleData | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [week, setWeek] = useState(defaultWeek);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/nfl-schedule?season=${encodeURIComponent(season)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = (await response.json()) as NflScheduleData & {
          error?: string;
        };
        if (!response.ok)
          throw new Error(data.error ?? "NFL schedule unavailable");
        return data;
      })
      .then((data) => {
        setSchedule(data);
        setWeek((current) => current ?? data.currentWeek);
        setError("");
      })
      .catch((requestError) => {
        if (requestError?.name !== "AbortError")
          setError(
            requestError instanceof Error
              ? requestError.message
              : "NFL schedule unavailable",
          );
      });
    return () => controller.abort();
  }, [season]);
  const loading = !schedule || String(schedule.season) !== season;
  const activeWeek = week ?? schedule?.currentWeek ?? 1;
  const games =
    schedule?.weeks.find((item) => item.week === activeWeek)?.games ?? [];
  useEffect(() => {
    let active = true;
    void loadWeatherData(season, activeWeek).then((payload) => {
      if (active) setWeather(payload);
    });
    return () => {
      active = false;
    };
  }, [season, activeWeek]);
  const weatherByGame = new Map(
    (weather?.week === activeWeek ? weather.games : []).map((item) => [
      item.gameId,
      item,
    ]),
  );
  const playerMatchup = (team: string) => {
    const code = normalizeNflTeam(team);
    const game = games.find(
      (item) =>
        item.away.abbreviation === code || item.home.abbreviation === code,
    );
    if (!game) return null;
    const away = game.away.abbreviation === code;
    return {
      game,
      weather: weatherByGame.get(game.id),
      label: `${away ? "@" : "vs"} ${away ? game.home.abbreviation : game.away.abbreviation}`,
      venue: away ? "Road" : "Home",
    };
  };
  return (
    <div className="page-content matchup-season-page">
      <section className="matchup-season-head">
        <div>
          <span>FULL {season} NFL SEASON</span>
          <h2>Every weekly matchup, mapped to your roster.</h2>
          <p>
            Move through Weeks 1–18 to see each player’s opponent, stadium
            weather, kickoff, and bye week.
          </p>
        </div>
        <label>
          Schedule week
          <select
            value={activeWeek}
            onChange={(event) => setWeek(Number(event.target.value))}
          >
            {Array.from({ length: 18 }, (_, index) => index + 1).map(
              (value) => (
                <option key={value} value={value}>
                  Week {value}
                </option>
              ),
            )}
          </select>
        </label>
      </section>
      {error && <section className="scoreboard-error">{error}</section>}
      {loading && (
        <section className="panel scoreboard-empty">
          Loading the {season} NFL schedule…
        </section>
      )}
      {!loading && !error && (
        <>
          <div className="matchup-grid roster-matchups">
            {players.map((player) => {
              const matchup = playerMatchup(player.team);
              return (
                <article className={!matchup ? "bye-week" : ""} key={player.id}>
                  <div>
                    <span
                      className={`pos pos-${player.position.toLowerCase()}`}
                    >
                      {player.position}
                    </span>
                    <b className={matchup ? "edge-neutral" : "bye-label"}>
                      {matchup?.venue.toUpperCase() ?? "BYE"}
                    </b>
                  </div>
                  <h3><button className="inline-player-link" onClick={() => openPlayer(player)}>{player.name}</button></h3>
                  <small>
                    {player.team} · {matchup?.label ?? `Bye Week ${activeWeek}`}
                  </small>
                  <p>
                    {matchup
                      ? `${matchup.game.away.name} at ${matchup.game.home.name} · ${new Date(matchup.game.date).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}${matchup.game.broadcast ? ` · ${matchup.game.broadcast}` : ""}`
                      : `${player.team} is not scheduled to play in Week ${activeWeek}. Plan a replacement before lineups lock.`}
                  </p>
                  {matchup?.weather && (
                    <small>
                      {matchup.weather.venue} · {matchup.weather.summary}
                    </small>
                  )}
                  <div className="match-meter">
                    <i style={{ width: matchup ? "72%" : "12%" }} />
                  </div>
                  <span>{matchup ? "Scheduled matchup" : "Bye week"}</span>
                </article>
              );
            })}
          </div>
          <section className="week-slate panel">
            <div className="panel-header">
              <div>
                <span>NFL WEEK {activeWeek}</span>
                <h3>Complete game slate</h3>
              </div>
              <b>{games.length} games</b>
            </div>
            <div>
              {games.map((game) => {
                const gameWeather = weatherByGame.get(game.id);
                return (
                  <article key={game.id}>
                    <time>
                      {new Date(game.date).toLocaleString([], {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </time>
                    <p>
                      <span>{game.away.abbreviation}</span>
                      <strong>{game.away.name}</strong>
                      <i>at</i>
                      <span>{game.home.abbreviation}</span>
                      <strong>{game.home.name}</strong>
                    </p>
                    <small>
                      {gameWeather
                        ? `${gameWeather.venue} · ${gameWeather.summary}`
                        : game.broadcast || game.status}
                    </small>
                  </article>
                );
              })}
            </div>
            {!games.length && (
              <p className="schedule-empty">
                No regular-season games were returned for Week {activeWeek}.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function runLeagueSimulation(
  volume: number,
  simulation: SimulationContext,
  teams: LeagueTeam[],
  selectedTeamId: string,
  seed: number,
): SimulationResult {
  const random = seededRandom(seed);
  const normal = () =>
    Math.sqrt(-2 * Math.log(Math.max(0.000001, random()))) *
    Math.cos(2 * Math.PI * random());
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const strengths = new Map(
    teams.map((team) => {
      const starters = team.roster.filter(
        (player) =>
          player.role !== "Bench" &&
          player.role !== "IR" &&
          player.role !== "TAXI",
      );
      return [
        team.id,
        Math.max(
          1,
          starters.reduce((sum, player) => sum + player.projection, 0),
        ),
      ];
    }),
  );
  const sampleScore = (teamId: string) => {
    const base = strengths.get(teamId) ?? 1;
    const weeklyVariance = Math.max(7, base * 0.17);
    const injuryShock = random() < 0.035 ? base * (0.08 + random() * 0.14) : 0;
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
    const standings = new Map(
      teams.map((team) => [team.id, { wins: 0, points: 0 }]),
    );
    for (const week of simulation.weeks) {
      for (const matchup of week.matchups) {
        const [first, second] = matchup.teams;
        if (!standings.has(first) || !standings.has(second)) continue;
        const completed =
          week.week < simulation.league.currentWeek &&
          matchup.points.some((points) => points > 0);
        const firstScore = completed ? matchup.points[0] : sampleScore(first);
        const secondScore = completed ? matchup.points[1] : sampleScore(second);
        standings.get(first)!.points += firstScore;
        standings.get(second)!.points += secondScore;
        if (firstScore === secondScore) {
          standings.get(first)!.wins += 0.5;
          standings.get(second)!.wins += 0.5;
        } else
          standings.get(firstScore > secondScore ? first : second)!.wins += 1;
      }
    }
    const seeded = [...standings.entries()]
      .sort((a, b) => b[1].wins - a[1].wins || b[1].points - a[1].points)
      .map(([id]) => id);
    const userSeed = seeded.indexOf(selectedTeamId);
    userWins.push(standings.get(selectedTeamId)?.wins ?? 0);
    if (userSeed >= 0 && userSeed < simulation.league.playoffTeams)
      playoffs += 1;
    const byeCount = Math.max(
      0,
      2 ** Math.ceil(Math.log2(simulation.league.playoffTeams)) -
        simulation.league.playoffTeams,
    );
    if (userSeed >= 0 && userSeed < byeCount) byes += 1;
    const qualifiers = seeded.slice(0, simulation.league.playoffTeams);
    if (simulateBracket(qualifiers) === selectedTeamId) titles += 1;
  }
  userWins.sort((a, b) => a - b);
  const percentile = (fraction: number) =>
    userWins[
      Math.min(
        userWins.length - 1,
        Math.floor((userWins.length - 1) * fraction),
      )
    ] ?? 0;
  const yourTeam = teamById.get(selectedTeamId);
  const starters =
    yourTeam?.roster
      .filter(
        (player) =>
          player.role !== "Bench" &&
          player.role !== "IR" &&
          player.role !== "TAXI",
      )
      .sort((a, b) => b.projection - a.projection) ?? [];
  const strengthRank =
    [...strengths.entries()]
      .sort((a, b) => b[1] - a[1])
      .findIndex(([id]) => id === selectedTeamId) + 1;
  const lowOpportunity = starters.filter((player) => player.projection < 2);
  return {
    playoffOdds: (playoffs / volume) * 100,
    byeOdds: (byes / volume) * 100,
    titleOdds: (titles / volume) * 100,
    medianWins: percentile(0.5),
    winPercentiles: [
      ["10th", 0.1],
      ["25th", 0.25],
      ["50th", 0.5],
      ["75th", 0.75],
      ["90th", 0.9],
    ].map(([label, value]) => ({
      label: String(label),
      value: percentile(Number(value)),
    })),
    seed,
    topDrivers: starters
      .slice(0, 3)
      .map(
        (player) =>
          `${player.name} anchors the lineup at ${player.projection.toFixed(1)} projected points.`,
      ),
    riskDrivers: [
      `Projected starter strength ranks ${strengthRank}th of ${teams.length} teams.`,
      lowOpportunity.length
        ? `${lowOpportunity.length} starting slot${lowOpportunity.length === 1 ? " has" : "s have"} under 2.0 expected points.`
        : "No current starter is below the 2.0-point opportunity threshold.",
      "Weekly variance includes a player-availability shock in 3.5% of team-weeks.",
    ],
  };
}

function Simulator({
  simulations,
  setSimulations,
  leagueId,
  teams,
  selectedTeamId,
  context,
}: {
  simulations: number;
  setSimulations: (n: number) => void;
  leagueId: string;
  teams: LeagueTeam[];
  selectedTeamId: string;
  context: RankingContext | null;
}) {
  const [simulation, setSimulation] = useState<SimulationContext | null>(null);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/simulation-context?leagueId=${encodeURIComponent(leagueId)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = (await response.json()) as SimulationContext & {
          error?: string;
        };
        if (!response.ok)
          throw new Error(data.error ?? "Simulation details unavailable");
        return data;
      })
      .then((data) => {
        setSimulation(data);
        setError("");
      })
      .catch((requestError) => {
        if (requestError?.name !== "AbortError")
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Simulation details unavailable",
          );
      });
    return () => controller.abort();
  }, [leagueId]);
  function run() {
    if (!simulation || !selectedTeamId) return;
    setRunning(true);
    window.setTimeout(() => {
      const seed = Math.floor(Math.random() * 2_147_483_647);
      setResult(
        runLeagueSimulation(
          simulations,
          simulation,
          teams,
          selectedTeamId,
          seed,
        ),
      );
      setRunning(false);
    }, 20);
  }
  if (error)
    return (
      <div className="page-content">
        <SectionIntro
          kicker="MONTE CARLO LAB"
          title="League simulation is unavailable"
          text={error}
        />
      </div>
    );
  if (!simulation)
    return (
      <div className="page-content">
        <SectionIntro
          kicker="MONTE CARLO LAB"
          title="Loading actual league details…"
          text="Pulling the fantasy schedule, playoff rules, rosters, lineup structure, and scoring configuration."
        />
        <section className="panel scoreboard-empty">
          Preparing league model…
        </section>
      </div>
    );
  const maxWins = Math.max(
    1,
    ...(result?.winPercentiles.map((item) => item.value) ?? [
      simulation.league.regularSeasonWeeks,
    ]),
  );
  return (
    <div className="page-content simulator-live">
      <SectionIntro
        kicker="LEAGUE-SPECIFIC MONTE CARLO"
        title={`Simulate ${simulation.league.name}, not a generic league`}
        text="Each run uses actual rosters, corrected opportunity-aware projections, weekly fantasy matchups, completed results, lineup rules, scoring configuration, playoff field, and playoff timing."
      />
      <section className="simulation-context panel">
        <span>
          <b>{simulation.league.totalTeams}</b> teams
        </span>
        <span>
          <b>{simulation.league.playoffTeams}</b> playoff spots
        </span>
        <span>
          <b>Week {simulation.league.playoffWeekStart}</b> playoffs begin
        </span>
        <span>
          <b>{simulation.league.starterSlots.length}</b> starter slots
        </span>
        <span>
          <b>{context?.scoring ?? "Custom"}</b> scoring
        </span>
        <span>
          <b>{simulation.league.scoringRuleCount}</b> scoring rules
        </span>
      </section>
      <section className="sim-hero">
        <div>
          <label>
            Simulation volume
            <select
              value={simulations}
              onChange={(event) => setSimulations(Number(event.target.value))}
            >
              <option value="5000">5,000 seasons</option>
              <option value="10000">10,000 seasons</option>
              <option value="25000">25,000 seasons</option>
            </select>
          </label>
          <button onClick={run} disabled={running}>
            {running ? "Running seasons…" : "Run simulation"}
          </button>
          {result && <small>Seed {result.seed.toLocaleString()}</small>}
        </div>
        {result ? (
          <div className="sim-results">
            <Metric
              label="Playoff odds"
              value={`${result.playoffOdds.toFixed(1)}%`}
              detail={`${result.medianWins} median wins`}
              tone="good"
            />
            <Metric
              label="First-round bye"
              value={`${result.byeOdds.toFixed(1)}%`}
              detail="Based on actual playoff field"
            />
            <Metric
              label="Title odds"
              value={`${result.titleOdds.toFixed(1)}%`}
              detail={`${simulations.toLocaleString()} modeled seasons`}
              tone="good"
            />
          </div>
        ) : (
          <div className="simulation-ready">
            <strong>Ready to simulate</strong>
            <p>Results remain hidden until you run the model.</p>
          </div>
        )}
      </section>
      {result && (
        <>
          <section className="win-distribution panel">
            <div className="panel-header">
              <div>
                <span>REGULAR-SEASON OUTCOMES</span>
                <h3>Win distribution</h3>
              </div>
            </div>
            <div>
              {result.winPercentiles.map((item) => (
                <article key={item.label}>
                  <strong>{item.value}</strong>
                  <i>
                    <em
                      style={{ height: `${(item.value / maxWins) * 100}%` }}
                    />
                  </i>
                  <span>{item.label}</span>
                </article>
              ))}
            </div>
          </section>
          <div className="simulation-drivers">
            <section className="panel">
              <div className="panel-header">
                <div>
                  <span>UPSIDE DRIVERS</span>
                  <h3>What raises the ceiling</h3>
                </div>
              </div>
              {result.topDrivers.map((driver) => (
                <p key={driver}>{driver}</p>
              ))}
            </section>
            <section className="panel">
              <div className="panel-header">
                <div>
                  <span>RISK DRIVERS</span>
                  <h3>What holds the team back</h3>
                </div>
              </div>
              {result.riskDrivers.map((driver) => (
                <p key={driver}>{driver}</p>
              ))}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function PlayerPanel({
  player,
  close,
  portfolioScans,
}: {
  player: Player;
  close: () => void;
  portfolioScans: LeagueScan[];
}) {
  const projectionPlatform = useContext(ProjectionPlatformContext);
  const [history, setHistory] = useState<PlayerHistory | null>(null);
  const [historyState, setHistoryState] = useState<
    "loading" | "ready" | "unavailable"
  >("loading");
  const [selectedSeason, setSelectedSeason] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(
      `/api/player-history?id=${encodeURIComponent(player.id)}&name=${encodeURIComponent(player.name)}`,
      { signal: controller.signal },
    )
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data: PlayerHistory) => {
        setHistory(data);
        setHistoryState(
          data.sourceStatus === "available" ? "ready" : "unavailable",
        );
      })
      .catch((error) => {
        if (error?.name !== "AbortError") setHistoryState("unavailable");
      });
    return () => controller.abort();
  }, [player.id, player.name]);
  const maxSeasonPoints = Math.max(
    1,
    ...(history?.seasons.map((season) => season.points) ?? []),
  );
  const activeSeason = selectedSeason || history?.seasons[0]?.season || "";
  const seasonWeeks =
    history?.weeks
      .filter((week) => week.season === activeSeason)
      .sort((a, b) => a.week - b.week) ?? [];
  const playedWeeks = seasonWeeks.filter(
    (week) => week.points || week.totalYards || week.touchdowns,
  );
  const weeklyAverage = playedWeeks.length
    ? playedWeeks.reduce((total, week) => total + week.points, 0) /
      playedWeeks.length
    : 0;
  const rosteredIn = portfolioScans.filter((scan) =>
    scan.roster.some(
      (candidate) =>
        candidate.id === player.id ||
        (candidate.name === player.name && candidate.position === player.position),
    ),
  );
  const availableIn = portfolioScans.filter((scan) =>
    scan.waiverPlayers.some(
      (candidate) =>
        candidate.id === player.id ||
        (candidate.name === player.name && candidate.position === player.position),
    ),
  );
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <aside className="player-panel player-dossier">
        <header>
          <div className="dossier-player-identity">
            <PlayerHeadshot id={player.id} position={player.position} large />
            <div>
            <span className={`pos pos-${player.position.toLowerCase()}`}>
              {player.position}
            </span>
            <small>
              {player.team} · {player.opponent}
            </small>
            <h2>{player.name}</h2>
            <Status value={player.status} />
            </div>
          </div>
          <button className="close" onClick={close}>
            ×
          </button>
        </header>
        <section className="dossier-hero">
          <div>
            <span>{projectionPlatform.toUpperCase()} PROJECTION</span>
            <strong>
              {typeof player.leagueProjection === "number"
                ? player.leagueProjection.toFixed(1)
                : "—"}
            </strong>
            <small>Weekly estimate from {projectionPlatform}</small>
          </div>
          <div className="outcome-range">
            <span>
              Status <b>{player.status}</b>
            </span>
            <span>
              Slot <b>{formatRosterSlot(player.role)}</b>
            </span>
            <span>
              Team <b>{player.team}</b>
            </span>
          </div>
        </section>
        <section className="dossier-facts">
          <div>
            <span>Role</span>
            <strong>{formatRosterSlot(player.role)}</strong>
          </div>
          <div>
            <span>Trend</span>
            <strong className={player.trend >= 0 ? "up" : "down"}>
              {player.trend >= 0 ? "+" : ""}
              {player.trend.toFixed(1)}
            </strong>
          </div>
          <div>
            <span>Experience</span>
            <strong>
              {history?.player.yearsExp != null
                ? `${history.player.yearsExp} yrs`
                : "—"}
            </strong>
          </div>
          <div>
            <span>Age</span>
            <strong>{history?.player.age ?? "—"}</strong>
          </div>
        </section>
        <section className="snap-usage-card">
          <header>
            <div><span>SNAP PARTICIPATION</span><h3>How often the player is on the field</h3></div>
            <b>{history?.snapProfile?.season ?? player.snapSeason ?? "—"}</b>
          </header>
          {history?.snapProfile || typeof player.snapPct === "number" ? (
            <div>
              <article><span>LATEST WEEK</span><strong>{(history?.snapProfile?.latestPct ?? player.snapPct)?.toFixed(0)}%</strong><small>Week {history?.snapProfile?.latestWeek ?? player.snapWeek ?? "—"}</small></article>
              <article><span>SEASON AVG.</span><strong>{typeof (history?.snapProfile?.averagePct ?? player.snapAverage) === "number" ? `${(history?.snapProfile?.averagePct ?? player.snapAverage)!.toFixed(1)}%` : "—"}</strong><small>{history?.snapProfile?.games ?? "—"} games</small></article>
              <article><span>OFFENSE</span><strong>{typeof history?.snapProfile?.offensePct === "number" ? `${history.snapProfile.offensePct.toFixed(1)}%` : "—"}</strong><small>Average share</small></article>
              <article><span>DEFENSE / ST</span><strong>{typeof (history?.snapProfile?.defensePct ?? history?.snapProfile?.specialTeamsPct) === "number" ? `${(history?.snapProfile?.defensePct ?? history?.snapProfile?.specialTeamsPct)!.toFixed(1)}%` : "—"}</strong><small>Average share</small></article>
            </div>
          ) : (
            <p>Snap participation is not available for this player or season.</p>
          )}
          <footer>Game-level snap counts · refreshed from the current published season file</footer>
        </section>
        {portfolioScans.length > 0 && (
          <section className="portfolio-player-footprint">
            <header><div><span>PORTFOLIO FOOTPRINT</span><h3>Across all connected leagues</h3></div><b>{rosteredIn.length}/{portfolioScans.length} rostered</b></header>
            <div>
              {rosteredIn.map((scan) => <article key={`owned-${scan.league.id}`}><i>OWNED</i><p><strong>{scan.league.name}</strong><small>{scan.teamName} · {scan.league.format} · {scan.league.scoring}</small></p></article>)}
              {availableIn.map((scan) => <article key={`available-${scan.league.id}`}><i className="available">AVAILABLE</i><p><strong>{scan.league.name}</strong><small>On this league’s waiver wire</small></p></article>)}
              {!rosteredIn.length && !availableIn.length && <p className="history-empty">No ownership or top-waiver footprint found in the current portfolio scan.</p>}
            </div>
          </section>
        )}
        <section className="history-section">
          <header>
            <div>
              <span>HISTORICAL PRODUCTION</span>
              <h3>Season performance</h3>
            </div>
            {historyState === "ready" && <small>Full PPR</small>}
          </header>
          {historyState === "loading" && (
            <div className="history-loading">
              <i />
              <i />
              <i />
            </div>
          )}
          {historyState === "unavailable" && (
            <p className="history-empty">
              Historical production is unavailable for this player.
            </p>
          )}
          {historyState === "ready" && (
            <div className="season-history">
              {history!.seasons.map((season) => (
                <article key={season.season}>
                  <div>
                    <strong>{season.season}</strong>
                    <span>
                      {season.games} games ·{" "}
                      {season.positionRank
                        ? `Pos. #${season.positionRank}`
                        : "Rank unavailable"}
                    </span>
                  </div>
                  <div className="season-bar">
                    <i
                      style={{
                        width: `${Math.max(4, (season.points / maxSeasonPoints) * 100)}%`,
                      }}
                    />
                  </div>
                  <div>
                    <b>{season.points.toFixed(1)} pts</b>
                    <span>{season.pointsPerGame.toFixed(1)} PPG</span>
                  </div>
                  <dl>
                    <div>
                      <dt>Yards</dt>
                      <dd>{season.yards.toLocaleString()}</dd>
                    </div>
                    <div>
                      <dt>TD</dt>
                      <dd>{season.touchdowns}</dd>
                    </div>
                    <div>
                      <dt>Rec</dt>
                      <dd>{season.receptions}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          )}
        </section>
        <section className="history-section">
          <header>
            <div>
              <span>RECENT FORM</span>
              <h3>Latest weekly results</h3>
            </div>
          </header>
          {historyState === "ready" && history!.recentWeeks.length > 0 ? (
            <div className="week-strip">
              {history!.recentWeeks.map((week) => (
                <article key={week.week}>
                  <span>W{week.week}</span>
                  <strong>{week.points.toFixed(1)}</strong>
                  <small>
                    {week.yards} yd · {week.touchdowns} TD
                  </small>
                  <i
                    style={{
                      height: `${Math.min(100, Math.max(8, (week.points / 30) * 100))}%`,
                    }}
                  />
                </article>
              ))}
            </div>
          ) : (
            historyState === "ready" && (
              <p className="history-empty">
                No recent weekly results were returned.
              </p>
            )
          )}
        </section>
        {historyState === "ready" && (
          <section className="history-section full-game-log">
            <header>
              <div>
                <span>FULL GAME LOG</span>
                <h3>Week-by-week production</h3>
              </div>
              <label>
                Season
                <select
                  value={activeSeason}
                  onChange={(event) => setSelectedSeason(event.target.value)}
                >
                  {history!.seasons.map((season) => (
                    <option key={season.season} value={season.season}>
                      {season.season}
                    </option>
                  ))}
                </select>
              </label>
            </header>
            <div className="game-log-summary">
              <span>
                Games <b>{playedWeeks.length}</b>
              </span>
              <span>
                Average <b>{weeklyAverage.toFixed(1)}</b>
              </span>
              <span>
                Best week{" "}
                <b>
                  {playedWeeks.length
                    ? Math.max(
                        ...playedWeeks.map((week) => week.points),
                      ).toFixed(1)
                    : "—"}
                </b>
              </span>
              <span>
                10+ points{" "}
                <b>{playedWeeks.filter((week) => week.points >= 10).length}</b>
              </span>
            </div>
            <div className="game-log-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Week</th>
                    <th>PPR</th>
                    <th>Total yd</th>
                    <th>Pass</th>
                    <th>Rush</th>
                    <th>Receiving</th>
                    <th>TD</th>
                  </tr>
                </thead>
                <tbody>
                  {seasonWeeks.map((week) => (
                    <tr key={`${week.season}-${week.week}`}>
                      <td>
                        <b>W{week.week}</b>
                      </td>
                      <td>
                        <strong>{week.points.toFixed(1)}</strong>
                      </td>
                      <td>{week.totalYards}</td>
                      <td>
                        <span>
                          {week.passYards} yd · {week.passTouchdowns} TD
                          {week.interceptions
                            ? ` · ${week.interceptions} INT`
                            : ""}
                        </span>
                      </td>
                      <td>
                        <span>
                          {week.rushAttempts} att · {week.rushYards} yd ·{" "}
                          {week.rushTouchdowns} TD
                        </span>
                      </td>
                      <td>
                        <span>
                          {week.receptions}/{week.targets} ·{" "}
                          {week.receivingYards} yd · {week.receivingTouchdowns}{" "}
                          TD
                        </span>
                      </td>
                      <td>{week.touchdowns}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!seasonWeeks.length && (
                <p className="history-empty">
                  No weekly results were returned for this season.
                </p>
              )}
            </div>
          </section>
        )}
        <section className="dossier-outlook">
          <span>FANTASY HUB OUTLOOK</span>
          <h3>
            {player.ceiling - player.floor > 18
              ? "High-variance matchup weapon"
              : "Stable weekly lineup asset"}
          </h3>
          <p>
            {player.ceiling - player.floor > 18
              ? "The outcome range is wide enough that matchup posture should influence the decision. The ceiling is valuable when chasing an upset; the floor carries more risk when favored."
              : "Role security and historical production provide context around the connected league platform’s weekly projection."}
          </p>
        </section>
      </aside>
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
  tone = "",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: string;
}) {
  return (
    <article className={`metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}
function Header({
  eyebrow,
  title,
  action,
  onClick,
}: {
  eyebrow: string;
  title: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <header className="panel-header">
      <div>
        <span>{eyebrow}</span>
        <h3>{title}</h3>
      </div>
      <button onClick={onClick}>{action} →</button>
    </header>
  );
}
function SectionIntro({
  kicker,
  title,
  text,
}: {
  kicker: string;
  title: string;
  text: string;
}) {
  return (
    <header className="section-intro">
      <span>{kicker}</span>
      <h2>{title}</h2>
      <p>{text}</p>
    </header>
  );
}
function Status({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  const isLongTermIr = normalized === "ir" || normalized.includes("injured reserve");
  const isInjured = ["questionable", "doubtful", "out"].includes(normalized);
  const showInjuryIcon = isLongTermIr || isInjured;
  const statusClass = normalized === "healthy" ? "healthy" : isLongTermIr ? "ir" : "questionable";
  return (
    <span
      className={`status ${statusClass}`}
      aria-label={showInjuryIcon ? value : undefined}
      title={showInjuryIcon ? value : undefined}
    >
      {isLongTermIr ? "🛏️" : isInjured ? "🩹" : value}
    </span>
  );
}
function PlayerChoice({
  player,
  active,
  onClick,
}: {
  player: Player;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`player-choice ${active ? "chosen" : ""}`}
      onClick={onClick}
    >
      <span className={`pos pos-${player.position.toLowerCase()}`}>
        {player.position}
      </span>
      <small>
        {player.team} · {player.opponent}
      </small>
      <strong>{player.name}</strong>
      <div>
        <b>{player.projection}</b>
        <span>PROJECTED</span>
      </div>
    </button>
  );
}
function TradeAsset({ asset }: { asset: TradeAssetValue }) {
  const openPlayer = useContext(PlayerOpenContext);
  return (
    <article className="trade-asset">
      <span className={`pos pos-${asset.position.toLowerCase()}`}>
        {asset.position}
      </span>
      <p>
        <button className="inline-player-link" onClick={() => openPlayer(playerShell(asset))}>{asset.name}</button>
        <small>{asset.meta}</small>
        <span className="trade-rating-profile">
          Talent {asset.trueTalent} · Current {asset.currentOverall} · Dynasty{" "}
          {asset.dynastyOverall}
        </span>
      </p>
      <b>{asset.value}</b>
    </article>
  );
}
