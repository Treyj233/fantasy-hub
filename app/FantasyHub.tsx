"use client";

import { Fragment, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { estimatedWinProbability, playerLeverage, rootingInterests, whatDoINeed } from "./game-day-model.mjs";
import { classifyFantasyPlay, findConfirmedPlayContext, matchupImpactText } from "./live-play-alerts.mjs";
import { PRE_KICKOFF_VISUALS_ENABLED } from "./pre-kickoff-visuals";
import { DEFAULT_PUSH_PREFERENCES, type PushAlertKey, type PushPreferences } from "./push-preferences";
import { disableNativePushNotifications, enableNativePushNotifications, initializeNativeRuntime, isNativeIosApp, nativeHapticsEnabled, nativeImpact, nativeManageSubscriptions, nativePurchase, nativeRefreshPurchases, nativeRestorePurchases, nativeStoreProducts, setNativeHapticsEnabled } from "./native-runtime";
import { useOverflowAutoScroll } from "./use-overflow-auto-scroll";
import { useOverlayGuard } from "./use-overlay-guard";
import { useProductMonitoring } from "./use-product-monitoring";
import { isProtectedWaiverDrop, waiverMarketProtection } from "./waiver-drop-model.mjs";
import LaunchSplash from "./LaunchSplash";
import NewsAndNotes from "./NewsAndNotes";
import DraftDashboard from "./DraftDashboard";
import { cacheActiveLeagueBootstrap, readSessionCache, safeLocalStorageSet, writeSessionCache } from "./local-storage";

type View =
  | "Command Center"
  | "League Stories"
  | "Manager Report"
  | "All Leagues"
  | "Scoreboard"
  | "Game Day Live"
  | "News & Notes"
  | "League Analytics"
  | "My Team"
  | "Team Rankings"
  | "Player Rankings"
  | "ADP"
  | "Draft HQ"
  | "Start / Sit"
  | "Waiver Wire"
  | "Trade Lab"
  | "Matchups"
  | "Simulator"
  | "Glossary"
  | "Fantasy Hub Pro"
  | "My Account"
  | "Theme Locker"
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
  statsSourceSeason?: number;
  statsBlended?: boolean;
  fantasyPpg2025?: number | null;
  gamesPlayed2025?: number | null;
  team2025?: string | null;
  teamOffenseRank2025?: number | null;
  teamPointsPerGame2025?: number | null;
  overallRank?: number;
  sleeperRank?: number;
  rankingValue?: number;
  adpBySite?: Record<string, number | null>;
  age?: number | null;
  ageAdjustment?: number;
  lineupAdjustment?: number;
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
const PORTFOLIO_CACHE_VERSION = 2;
const PORTFOLIO_SCAN_TTL_MS = 30 * 60 * 1000;
const LEAGUE_DISCOVERY_TTL_MS = 30 * 60 * 1000;
const weatherRequestCache = new Map<
  string,
  { expiresAt: number; request: Promise<WeatherData | null> }
>();
type SharedDataCache<T> = { expiresAt: number; value?: T; request?: Promise<T | null> };
const scheduleRequestCache = new Map<string, SharedDataCache<NflScheduleData>>();
const matchupStrengthRequestCache = new Map<string, SharedDataCache<MatchupStrengthData>>();

function readSharedDataCache<T>(
  memoryCache: Map<string, SharedDataCache<T>>,
  key: string,
  storageKey: string,
) {
  const memory = memoryCache.get(key);
  if (memory?.value && memory.expiresAt > Date.now()) return memory.value;
  const stored = readSessionCache<{ expiresAt: number; value: T }>(storageKey);
  if (!stored?.value || stored.expiresAt <= Date.now()) return null;
  memoryCache.set(key, { expiresAt: stored.expiresAt, value: stored.value });
  return stored.value;
}

function storeSharedDataCache<T>(
  memoryCache: Map<string, SharedDataCache<T>>,
  key: string,
  storageKey: string,
  value: T,
  ttl: number,
) {
  const expiresAt = Date.now() + ttl;
  memoryCache.set(key, { expiresAt, value });
  writeSessionCache(storageKey, { expiresAt, value });
  return value;
}

const scheduleStorageKey = (season: string | number) => `fantasy-hub-nfl-schedule:${season}`;
function readCachedScheduleData(season: string | number) {
  const key = String(season);
  return readSharedDataCache(scheduleRequestCache, key, scheduleStorageKey(key));
}
function loadScheduleData(season: string | number) {
  const key = String(season);
  const cached = readCachedScheduleData(key);
  if (cached) return Promise.resolve(cached);
  const pending = scheduleRequestCache.get(key);
  if (pending?.request && pending.expiresAt > Date.now()) return pending.request;
  const request = fetch(`/api/nfl-schedule?season=${encodeURIComponent(key)}`)
    .then(async (response) => response.ok ? await response.json() as NflScheduleData : null)
    .then((value) => value ? storeSharedDataCache(scheduleRequestCache, key, scheduleStorageKey(key), value, 6 * 60 * 60 * 1000) : null)
    .catch(() => null);
  scheduleRequestCache.set(key, { expiresAt: Date.now() + 6 * 60 * 60 * 1000, request });
  return request;
}

const matchupStrengthStorageKey = (season: string | number, week: number) =>
  `fantasy-hub-matchup-strength:${season}:${week}`;
function readCachedMatchupStrengths(season: string | number, week: number) {
  const key = `${season}-${week}`;
  return readSharedDataCache(matchupStrengthRequestCache, key, matchupStrengthStorageKey(season, week));
}
function loadMatchupStrengthData(season: string | number, week: number) {
  const key = `${season}-${week}`;
  const cached = readCachedMatchupStrengths(season, week);
  if (cached) return Promise.resolve(cached);
  const pending = matchupStrengthRequestCache.get(key);
  if (pending?.request && pending.expiresAt > Date.now()) return pending.request;
  const request = fetch(`/api/matchup-strength?season=${encodeURIComponent(String(season))}&week=${week}`)
    .then(async (response) => response.ok ? await response.json() as MatchupStrengthData : null)
    .then((value) => value ? storeSharedDataCache(matchupStrengthRequestCache, key, matchupStrengthStorageKey(season, week), value, 24 * 60 * 60 * 1000) : null)
    .catch(() => null);
  matchupStrengthRequestCache.set(key, { expiresAt: Date.now() + 24 * 60 * 60 * 1000, request });
  return request;
}

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
const nflPlayerHeadshotUrl = (playerId: string) =>
  `https://sleepercdn.com/content/nfl/players/${encodeURIComponent(playerId)}.jpg`;

const proTeamBadgeColors: Record<string, { primary: string; accent: string; text?: string }> = {
  ARI: { primary: "#97233f", accent: "#ffb612" }, ATL: { primary: "#a71930", accent: "#000000" },
  BAL: { primary: "#241773", accent: "#9e7c0c" }, BUF: { primary: "#00338d", accent: "#c60c30" },
  CAR: { primary: "#0085ca", accent: "#101820" }, CHI: { primary: "#0b162a", accent: "#c83803" },
  CIN: { primary: "#fb4f14", accent: "#000000" }, CLE: { primary: "#311d00", accent: "#ff3c00" },
  DAL: { primary: "#003594", accent: "#869397" }, DEN: { primary: "#002244", accent: "#fb4f14" },
  DET: { primary: "#0076b6", accent: "#b0b7bc" }, GB: { primary: "#203731", accent: "#ffb612" },
  HOU: { primary: "#03202f", accent: "#a71930" }, IND: { primary: "#002c5f", accent: "#ffffff" },
  JAX: { primary: "#006778", accent: "#d7a22a" }, KC: { primary: "#e31837", accent: "#ffb81c" },
  LAC: { primary: "#0073cf", accent: "#ffc20e" }, LAR: { primary: "#003594", accent: "#ffa300" },
  LV: { primary: "#000000", accent: "#a5acaf" }, MIA: { primary: "#008e97", accent: "#fc4c02" },
  MIN: { primary: "#4f2683", accent: "#ffc62f" }, NE: { primary: "#002244", accent: "#c60c30" },
  NO: { primary: "#101820", accent: "#d3bc8d" }, NYG: { primary: "#0b2265", accent: "#a71930" },
  NYJ: { primary: "#125740", accent: "#ffffff" }, PHI: { primary: "#004c54", accent: "#a5acaf" },
  PIT: { primary: "#101820", accent: "#ffb612" }, SEA: { primary: "#002244", accent: "#69be28" },
  SF: { primary: "#aa0000", accent: "#b3995d" }, TB: { primary: "#d50a0a", accent: "#ff7900" },
  TEN: { primary: "#0c2340", accent: "#4b92db" }, WAS: { primary: "#5a1414", accent: "#ffb612" },
};

function NflTeamLogo({ team }: { team: string }) {
  const abbreviation = ({ JAC: "JAX", WSH: "WAS", LA: "LAR" } as Record<string, string>)[team.toUpperCase()] ?? team.toUpperCase();
  const colors = proTeamBadgeColors[abbreviation] ?? { primary: "#173f2a", accent: "#f1b432" };
  return (
    <span
      className="nfl-team-logo"
      role="img"
      aria-label={abbreviation}
      style={{ "--team-primary": colors.primary, "--team-accent": colors.accent } as CSSProperties}
    >
      <span>{abbreviation}</span>
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
  tier: 1 | 2 | 3 | 4 | 5 | 6;
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
  passAttempts: number;
  passCompletions: number;
  passTouchdowns: number;
  interceptions: number;
  rushAttempts: number;
  rushYards: number;
  rushTouchdowns: number;
  targets: number;
  receptions: number;
  receivingYards: number;
  receivingTouchdowns: number;
  fumblesLost: number;
  twoPointConversions: number;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  extraPointsMade: number;
  sacks: number;
  defensiveInterceptions: number;
  fumbleRecoveries: number;
  defensiveTouchdowns: number;
  pointsAllowed: number;
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
type BadgeTheme = "arcade" | "team" | "neon" | "minimal" | "stadium" | "broadcast" | "playbook" | "varsity" | "championship" | "gridiron" | "neon-sunday" | "retro" | "glass" | "carbon" | "helmet" | "trading-cards" | "crown-chrome" | "neon-endzone" | "heritage-gridiron";
const badgeThemeOptions: { id: BadgeTheme; name: string; detail: string; preview: string[] }[] = [
  { id: "arcade", name: "Arcade", detail: "Colorful page-by-page gradients", preview: ["★", "⚡", "↔"] },
  { id: "team", name: "Team Colors", detail: "Your team-inspired palette across every badge", preview: ["♟", "+", "◈"] },
  { id: "neon", name: "Neon Night", detail: "Electric badges built for dark mode", preview: ["◆", "🏈", "♛"] },
  { id: "minimal", name: "Minimal", detail: "Clean, quiet outlined page markers", preview: ["✓", "◎", "⌁"] },
  { id: "stadium", name: "Stadium Lights", detail: "Floodlit navy badges with gold edges", preview: ["✦", "★", "⚡"] },
  { id: "broadcast", name: "Broadcast", detail: "Bold sports-TV score-bug graphics", preview: ["LIVE", "▣", "↗"] },
  { id: "playbook", name: "Playbook", detail: "Chalk routes on tactical dark tiles", preview: ["○", "↗", "×"] },
  { id: "varsity", name: "Varsity", detail: "Embroidered letterman patch styling", preview: ["FH", "V", "★"] },
  { id: "championship", name: "Championship", detail: "Polished medal and trophy finishes", preview: ["♛", "★", "1"] },
  { id: "gridiron", name: "Gridiron", detail: "Leather, turf, yard lines, and stitching", preview: ["🏈", "10", "◆"] },
  { id: "neon-sunday", name: "Neon Sunday", detail: "Five-color game-day neon energy", preview: ["●", "▲", "⚡"] },
  { id: "retro", name: "Retro Arcade", detail: "Pixel-era fantasy football color", preview: ["1UP", "★", "+"] },
  { id: "glass", name: "Minimal Glass", detail: "Translucent tiles with crisp symbols", preview: ["◇", "◎", "+"] },
  { id: "carbon", name: "Carbon Pro", detail: "Black carbon with metallic accents", preview: ["PRO", "◆", "↗"] },
  { id: "helmet", name: "Team Helmet", detail: "Helmet-inspired category color shells", preview: ["H", "G", "M"] },
  { id: "trading-cards", name: "Trading Cards", detail: "Collectible frames with rarity shine", preview: ["R", "SR", "★"] },
  { id: "crown-chrome", name: "Aurora Orbit", detail: "Frosted orbital badges illuminated by polar lime signals", preview: ["◌", "N", "✦"] },
  { id: "neon-endzone", name: "Neon End Zone", detail: "Electric glass badges energized by prime-time color", preview: ["TD", "⚡", "◎"] },
  { id: "heritage-gridiron", name: "Sunset Signal", detail: "Warm translucent badges tuned to a coral game-day frequency", preview: ["◒", "FH", "↗"] },
];
const premiumBadgeThemeIds = new Set<BadgeTheme>(["crown-chrome", "neon-endzone", "heritage-gridiron"]);
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
  sleeperRank?: number;
  rankingValue: number;
  adpBySite?: Record<string, number | null>;
  age?: number | null;
  ageAdjustment: number;
  lineupAdjustment: number;
  fantasyPoints2025?: number | null;
  fantasyPpg2025?: number | null;
  gamesPlayed2025?: number | null;
  targets2025?: number | null;
  receptions2025?: number | null;
  receivingYards2025?: number | null;
  receivingTouchdowns2025?: number | null;
  rushingAttempts2025?: number | null;
  rushingYards2025?: number | null;
  rushingTouchdowns2025?: number | null;
  passingAttempts2025?: number | null;
  passingYards2025?: number | null;
  passingTouchdowns2025?: number | null;
  snapAverage?: number | null;
  statsSourceSeason?: number | null;
  compositeAdp?: number | null;
};
type CompositeLeagueRanking = LeagueRanking & {
  compositeAdp: number | null;
  hubRankScore: number;
};
type WaiverPlayer = LeagueRanking & {
  waiverProjection?: number;
  normalizedProjectionScore?: number;
  waiverRank?: number;
  trendCount?: number;
  trendDirection?: "up" | "down";
};
type WaiverTrending = { up: WaiverPlayer[]; down: WaiverPlayer[] };
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
type AccountUser = { displayName: string; email: string; provider: "clerk" | "chatgpt"; signOutPath: string };

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(1, limit), items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(items[index], index);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 15_000,
) {
  const timeoutController = new AbortController();
  const parentSignal = init.signal;
  const abortFromParent = () => timeoutController.abort(parentSignal?.reason);
  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  const timer = window.setTimeout(
    () => timeoutController.abort(new DOMException("Request timed out", "TimeoutError")),
    timeoutMs,
  );
  try {
    return await fetch(input, { ...init, signal: timeoutController.signal });
  } finally {
    window.clearTimeout(timer);
    parentSignal?.removeEventListener("abort", abortFromParent);
  }
}

async function settleWithin<T>(promise: Promise<T>, timeoutMs: number, fallback: T) {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => window.setTimeout(() => resolve(fallback), timeoutMs)),
  ]);
}

function startVisiblePolling(refresh: () => Promise<void>, intervalMs = 30_000) {
  const runWhenVisible = () => {
    if (document.visibilityState === "visible") void refresh();
  };
  const timer = window.setInterval(runWhenVisible, intervalMs);
  document.addEventListener("visibilitychange", runWhenVisible);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", runWhenVisible);
  };
}

type AccountEntitlement = { plan: "free" | "pro" | "elite"; status: string; pro: boolean; elite: boolean; currentPeriodEnd: string | null; provider: "stripe" | "apple" | "manual" | null; owner: boolean };
type RivalryWeek = { active: true; leagueId: string; week: number; season: string; opponentRosterId: number; opponentName: string; managerName: string };
type AccountPreferences = {
  colorMode: Theme;
  teamTheme: string;
  badgeTheme: BadgeTheme;
  leagueOrderJson: string;
  hiddenLeagueIdsJson: string;
  ownedTeamThemesJson: string;
  ownedBadgeThemesJson: string;
  onboardingCompletedAt: string | null;
};
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
  `https://sleeper.com/leagues/${encodeURIComponent(leagueId)}/team`;
const platformLeagueUrl = (league: ConnectedLeague) =>
  league.provider === "espn"
    ? `https://fantasy.espn.com/football/league?leagueId=${encodeURIComponent(league.sourceId ?? league.id.split(":").at(-1) ?? league.id)}`
    : sleeperLeagueUrl(league.sourceId ?? league.id);
function openPlatformLeagueOnMobile(event: MouseEvent<HTMLAnchorElement>, league: ConnectedLeague) {
  if (typeof window === "undefined") return;
  const isMobile = window.matchMedia("(pointer: coarse)").matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (!isMobile) return;
  event.preventDefault();
  window.location.assign(platformLeagueUrl(league));
}
function PlatformLogo({ provider = "Sleeper" }: { provider?: string }) {
  return provider.toLowerCase() === "sleeper" ? <span className="platform-logo" role="img" aria-label="Sleeper" /> : <span className="platform-logo-fallback">{provider}</span>;
}
function FHLogo({ label }: { label?: string }) {
  return <svg className="fh-theme-logo" viewBox="0 0 512 512" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
    <rect className="fh-logo-tile" width="512" height="512" rx="92" />
    <g transform="translate(82 52) rotate(-3 174 174)">
      <rect className="fh-logo-plate" width="348" height="348" rx="82" />
      <g transform="translate(42 46) scale(2.7)">
        <text className="fh-logo-f" x="5" y="75">F</text>
        <text className="fh-logo-h" x="40" y="79">H</text>
        <g className="fh-logo-laces" aria-hidden="true"><path d="M50 44 43 65"/><path d="m45 49 11 4M43 55l11 4M41 61l11 4"/></g>
      </g>
    </g>
    <path className="fh-logo-stripe" d="M0 408 512 258M0 450 512 300" />
  </svg>;
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
type CachedAccountBootstrap = {
  savedAt: number;
  connection?: SleeperConnection | null;
  preferences?: AccountPreferences | null;
  entitlement?: AccountEntitlement;
  leagues?: ManagedLeague[];
  connectedLeagues?: ConnectedLeague[];
};
function cachedAccountBootstrap(email?: string): CachedAccountBootstrap | null {
  if (typeof window === "undefined" || !email) return null;
  try {
    const cached = JSON.parse(
      window.localStorage.getItem(`fantasy-hub-account-bootstrap:${email.trim().toLowerCase()}`) ?? "null",
    ) as CachedAccountBootstrap | null;
    return cached && Date.now() - cached.savedAt < 7 * 24 * 60 * 60 * 1000 ? cached : null;
  } catch {
    return null;
  }
}
type ScoreboardPlayer = {
  id: string;
  name: string;
  position: string;
  nflTeam: string;
  points: number;
  projection: number | null;
  isStarter: boolean;
  lineupSlot: string;
  lineupOrder: number;
  yards: number;
  touchdowns: number;
  receptions: number;
  targets: number;
  offensiveTurnovers: number;
  defensiveTurnovers: number;
  returnTouchdowns: number;
  fieldGoals: number;
};

function playerTemperature(player: ScoreboardPlayer, matchupStatus: string) {
  const isLive = matchupStatus.toLowerCase() === "live";
  const projection = player.projection ?? 0;
  if (!isLive || projection <= 0) return { value: 50, label: isLive ? "No projection" : "Waiting for kickoff", state: "steady" };
  const hasActivity = player.points > 0 || player.yards > 0 || player.touchdowns > 0 || player.receptions > 0 || player.targets > 0;
  if (!hasActivity) return { value: 50, label: "Awaiting first play", state: "steady" };
  const ratio = player.points / projection;
  const productionBoost = Math.min(12, player.touchdowns * 5 + Math.floor(player.receptions / 4) * 2);
  const value = Math.round(Math.max(3, Math.min(97, 18 + ratio * 62 + productionBoost)));
  if (value >= 88) return { value, label: "On fire", state: "fire" };
  if (value >= 68) return { value, label: "Heating up", state: "hot" };
  if (value <= 22) return { value, label: "Freezing cold", state: "ice" };
  if (value <= 38) return { value, label: "Cooling off", state: "cold" };
  return { value, label: "Steady", state: "steady" };
}
type ScoreboardTeam = {
  rosterId: string;
  managerName: string;
  teamName: string;
  points: number;
  isMine: boolean;
  topPlayers: ScoreboardPlayer[];
};

function projectedTeamTotal(team: ScoreboardTeam) {
  const projectedStarters = team.topPlayers.filter(
    (player) => player.isStarter && player.projection != null,
  );
  if (!projectedStarters.length) return null;
  return projectedStarters.reduce(
    (total, player) => total + (player.projection ?? 0),
    0,
  );
}

function ScoreWithProjection({
  team,
  precision = 2,
}: {
  team: ScoreboardTeam;
  precision?: number;
}) {
  const projection = projectedTeamTotal(team);
  return (
    <span className="score-with-projection">
      <b>{team.points.toFixed(precision)}</b>
      {projection != null && <small>PROJ {projection.toFixed(1)}</small>}
    </span>
  );
}
type ScoreboardData = {
  league: { name: string; season: string; currentWeek: number; provider?: string; projectionSource?: string; scoring?: Record<string, number> };
  week: number;
  updatedAt: string;
  matchups: { matchupId: number; status: string; teams: ScoreboardTeam[] }[];
};
type LivePlayContext = {
  id: string;
  gameId: string;
  text: string;
  type: string;
  yardage: number;
  scoringPlay: boolean;
  isTurnover: boolean;
  period: number;
  clock: string;
  at: string;
  offenseTeam: string;
  defenseTeam: string;
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
  condition?: string | null;
  weatherSource?: string | null;
};
type WeatherData = {
  season: number;
  week: number;
  updatedAt: string;
  games: WeatherGame[];
  source?: string;
  weatherProvider?: string;
  weatherProviderUrl?: string;
  weatherDisclaimer?: string;
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
type CachedPortfolioScans = { version: number; savedAt: number; scans: LeagueScan[] };
function cachedPortfolioScans(identity?: string): CachedPortfolioScans | null {
  if (typeof window === "undefined" || !identity) return null;
  try {
    const cached = JSON.parse(
      window.localStorage.getItem(`fantasy-hub-portfolio-scans:${identity}`) ?? "null",
    ) as CachedPortfolioScans | null;
    return cached?.version === PORTFOLIO_CACHE_VERSION ? cached : null;
  } catch {
    return null;
  }
}

type NavGroup = "Home" | "Game Day" | "Manage Team" | "Analyze League" | "Utilities";
const navGroupOrder: NavGroup[] = ["Home", "Game Day", "Manage Team", "Analyze League", "Utilities"];
const mobileCategoryNav: { group: NavGroup; lead: View; label: string; categoryTone: string }[] = [
  { group: "Home", lead: "All Leagues", label: "Home", categoryTone: "category-blue" },
  { group: "Game Day", lead: "Scoreboard", label: "Game Day", categoryTone: "category-red" },
  { group: "Manage Team", lead: "Command Center", label: "Manage", categoryTone: "category-yellow" },
  { group: "Analyze League", lead: "Player Rankings", label: "Analyze", categoryTone: "category-green" },
  { group: "Utilities", lead: "Manage Leagues", label: "Utilities", categoryTone: "category-orange" },
];
const nav: { label: View; displayLabel?: string; mark: string; tone: string; group: NavGroup }[] = [
  { label: "All Leagues", displayLabel: "Mission Hub", mark: "◆", tone: "home-prism", group: "Home" },
  { label: "Theme Locker", mark: "✦", tone: "theme-spectrum", group: "Home" },
  { label: "My Account", mark: "👤", tone: "account-azure", group: "Utilities" },
  { label: "Manage Leagues", mark: "⚙", tone: "utility-steel", group: "Utilities" },
  { label: "Fantasy Hub Pro", displayLabel: "Manage Plans", mark: "P", tone: "pro-gold", group: "Utilities" },
  { label: "Command Center", mark: "★", tone: "command-sun", group: "Manage Team" },
  { label: "My Team", mark: "♟", tone: "roster-cobalt", group: "Manage Team" },
  { label: "Start / Sit", mark: "⚡", tone: "decision-orange", group: "Manage Team" },
  { label: "Waiver Wire", mark: "+", tone: "waiver-green", group: "Manage Team" },
  { label: "Trade Lab", mark: "↔", tone: "trade-rose", group: "Manage Team" },
  { label: "Simulator", mark: "✦", tone: "simulator-indigo", group: "Manage Team" },
  { label: "Manager Report", mark: "✓", tone: "report-mint", group: "Manage Team" },
  { label: "Player Rankings", mark: "♛", tone: "player-gold", group: "Analyze League" },
  { label: "Team Rankings", mark: "↥", tone: "team-jade", group: "Analyze League" },
  { label: "Draft HQ", mark: "🖥", tone: "pro-gold", group: "Analyze League" },
  { label: "ADP", mark: "⌁", tone: "adp-cyan", group: "Analyze League" },
  { label: "League Analytics", mark: "◈", tone: "analytics-violet", group: "Analyze League" },
  { label: "League Stories", mark: "✎", tone: "stories-sunset", group: "Analyze League" },
  { label: "Scoreboard", displayLabel: "Fantasy Scoreboard", mark: "▣", tone: "score-crimson", group: "Game Day" },
  { label: "Matchups", displayLabel: "Fantasy Matchups", mark: "◎", tone: "matchup-aqua", group: "Game Day" },
  { label: "Game Day Live", mark: "🏈", tone: "football-bronze", group: "Game Day" },
  { label: "News & Notes", mark: "🗞", tone: "news-pulse", group: "Game Day" },
  { label: "Glossary", mark: "?", tone: "glossary-plum", group: "Utilities" },
];

const glossaryDetails: Record<View, { summary: string; use: string }> = {
  "All Leagues": { summary: "Your portfolio-wide Mission Hub, combining urgent lineup, waiver, weather, injury, and trade actions across every connected league.", use: "Open first to see the three most important actions across your portfolio." },
  "Manage Leagues": { summary: "Connect, remove, refresh, and reorder Sleeper or ESPN leagues attached to your Fantasy Hub account.", use: "Use when adding a league, changing league order, or updating connected platforms." },
  "Theme Locker": { summary: "Browse, collect, and apply every Fantasy Hub palette and navigation badge pack.", use: "Use whenever you want to personalize the colors and navigation style across your Hub." },
  "Fantasy Hub Pro": { summary: "Compare Free and Pro access, start a subscription, restore an App Store purchase, or manage active billing.", use: "Use to review plans and unlock Fantasy Hub’s proprietary tools." },
  "My Account": { summary: "Review account details, subscription status, billing management, notification preferences, and sign-in controls.", use: "Use to manage your Fantasy Hub account or safely end a subscription." },
  "Command Center": { summary: "A league-specific briefing that combines roster readiness, matchup edges, priorities, and recommended next moves.", use: "Open before making weekly decisions for one team." },
  "My Team": { summary: "Your complete roster in platform lineup order, separated into starters, bench, IR, and other reserve slots.", use: "Use to review lineup status, player trends, projections, weather, and opponent strength." },
  "Start / Sit": { summary: "Compares realistic lineup decisions using platform projections, floor, median, ceiling, matchup strength, and game-script needs.", use: "Use when two or more eligible players are competing for the same lineup or flex spot." },
  "Waiver Wire": { summary: "Ranks players actually available in the selected league and pairs worthwhile additions with sensible drop candidates.", use: "Use before waivers process or when replacing an injured or inactive player." },
  "Trade Lab": { summary: "Evaluates manual trades for free and adds Pro roster-aware suggestions, team-need analysis, and negotiation profiles.", use: "Use to test a package or find mutually beneficial roster upgrades." },
  "Simulator": { summary: "Runs an analytical season simulation using the league’s rosters, schedule, scoring, lineup rules, and player ranges.", use: "Use to understand likely outcomes, upside paths, and the factors limiting a team." },
  "League Analytics": { summary: "Adapts to dynasty or redraft and explains roster strength, depth, positional allocation, competitive window, and future trajectory.", use: "Use for a deeper strategic view beyond this week’s lineup." },
  "Team Rankings": { summary: "Ranks every team using league-relative starters, depth, balance, scoring settings, and—when applicable—runway and draft capital.", use: "Use to identify genuine league strengths, weaknesses, and trade partners." },
  "Player Rankings": { summary: "Tier-based player rankings tailored to league format, scoring, lineup demand, and positional importance.", use: "Use for rest-of-season player comparison and roster-value context." },
  "ADP": { summary: "Shows market draft position by available source, separated from Fantasy Hub’s internal player rankings.", use: "Use for draft preparation and to compare market cost with your player evaluation." },
  "Draft HQ": { summary: "A configurable mock-draft room with a live board, roster construction, rankings, and tiered draft intelligence.", use: "Use before your draft to rehearse your slot, settings, and roster-building plan." },
  "Scoreboard": { summary: "The all-day Fantasy Scoreboard with live fantasy scores, win odds, What Do I Need paths, rooting interests, swings, and the Sunday Pulse ticker.", use: "Leave open on game day to follow every matchup that matters." },
  "Game Day Live": { summary: "Tracks the live pro football schedule, scores, weather, and the fantasy players from your matchup involved in each game.", use: "Use to follow real games and understand why each one matters to your leagues." },
  "News & Notes": { summary: "A live Fantasy Hub news desk that translates league-wide developments into clear fantasy impact and suggested next steps.", use: "Use throughout the week to catch injuries, role changes, roster moves, and game-day performances that affect your decisions." },
  "Matchups": { summary: "A detailed side-by-side view of your lineup and opponent in platform order with scoring, projections, weather, and pro-football matchup quality.", use: "Use to inspect one fantasy matchup in detail." },
  "League Stories": { summary: "Turns weekly league activity into recaps, previews, rivalries, awards, power movement, upsets, and season narratives.", use: "Use for the social story of the league, not just optimization." },
  "Manager Report": { summary: "Tracks saved recommendations, choices, outcomes, waiver and trade efficiency, bench points, and decision quality based on information available at the time.", use: "Use to understand where your process is helping or hurting you." },
  "Glossary": { summary: "A plain-language guide to every Fantasy Hub page and the best time to use it.", use: "Use whenever you want to understand a tool or jump directly to it." },
};

const normalizeNflTeam = (team: string) =>
  (({ JAC: "JAX", WSH: "WAS", LA: "LAR" }) as Record<string, string>)[team] ?? team;
const isStartingPlayer = (player: Player) =>
  !["Bench", "IR", "TAXI"].includes(player.role);

const leagueRelativeGrade = (value: number, values: number[]) => {
  if (values.length < 2) return 72;
  const mean = values.reduce((sum, item) => sum + item, 0) / values.length;
  const variance = values.reduce((sum, item) => sum + (item - mean) ** 2, 0) / values.length;
  const deviation = Math.sqrt(variance);
  if (deviation < .01) return 72;
  return Math.max(42, Math.min(97, 72 + ((value - mean) / deviation) * 12));
};
const formatRosterSlot = (slot: string) => slot.replace(/_/g, " ");
const nflThemes: { id: string; shortCode?: string; name: string; primary: string; secondary: string; premium?: boolean; detail?: string }[] = [
  { id: "CROWN", shortCode: "AURORA", name: "Aurora Orbit", primary: "#12304A", secondary: "#A7FF5B", premium: true, detail: "Midnight glacier blue energized by acid-lime aurora light." },
  { id: "NEONX", shortCode: "NEON", name: "Neon End Zone", primary: "#30106B", secondary: "#27F5FF", premium: true, detail: "Prime-time violet illuminated by electric cyan and laser glow." },
  { id: "HERITAGE", shortCode: "SUNSET", name: "Sunset Signal", primary: "#4B164C", secondary: "#FF785A", premium: true, detail: "Deep blackberry fades into luminous coral and warm sunset glass." },
  {
    id: "ARI",
    shortCode: "DESERT",
    name: "Desert Noir",
    primary: "#97233F",
    secondary: "#000000",
  },
  {
    id: "ATL",
    shortCode: "CRIMSON",
    name: "Crimson Flight",
    primary: "#A71930",
    secondary: "#000000",
  },
  {
    id: "BAL",
    shortCode: "PURPLE",
    name: "Purple Reign",
    primary: "#241773",
    secondary: "#9E7C0C",
  },
  {
    id: "BUF",
    shortCode: "FROST",
    name: "Cold Front",
    primary: "#00338D",
    secondary: "#C60C30",
  },
  {
    id: "CAR",
    shortCode: "ELECTRIC",
    name: "Electric Night",
    primary: "#0085CA",
    secondary: "#101820",
  },
  {
    id: "CHI",
    shortCode: "MIDWAY",
    name: "Midway Night",
    primary: "#0B162A",
    secondary: "#C83803",
  },
  {
    id: "CIN",
    shortCode: "ORANGE",
    name: "Orange Rush",
    primary: "#FB4F14",
    secondary: "#000000",
  },
  {
    id: "CLE",
    shortCode: "EMBER",
    name: "Ember Forge",
    primary: "#311D00",
    secondary: "#FF3C00",
  },
  {
    id: "DAL",
    shortCode: "LONE STAR",
    name: "Lone Star Steel",
    primary: "#003594",
    secondary: "#869397",
  },
  {
    id: "DEN",
    shortCode: "ALPINE",
    name: "Alpine Blaze",
    primary: "#FB4F14",
    secondary: "#002244",
  },
  {
    id: "DET",
    shortCode: "MOTOR",
    name: "Motor City Ice",
    primary: "#0076B6",
    secondary: "#B0B7BC",
  },
  {
    id: "GB",
    shortCode: "FROZEN",
    name: "Frozen Gold",
    primary: "#203731",
    secondary: "#FFB612",
  },
  {
    id: "HOU",
    shortCode: "ORBITAL",
    name: "Orbital Crimson",
    primary: "#03202F",
    secondary: "#A71930",
  },
  {
    id: "IND",
    shortCode: "CHROME",
    name: "Midnight Chrome",
    primary: "#002C5F",
    secondary: "#A2AAAD",
  },
  {
    id: "JAX",
    shortCode: "COASTAL",
    name: "Coastal Gold",
    primary: "#006778",
    secondary: "#D7A22A",
  },
  {
    id: "KC",
    shortCode: "ROYAL",
    name: "Royal Redline",
    primary: "#E31837",
    secondary: "#FFB81C",
  },
  {
    id: "LV",
    shortCode: "SHADOW",
    name: "Silver Shadow",
    primary: "#000000",
    secondary: "#A5ACAF",
  },
  {
    id: "LAC",
    shortCode: "CURRENT",
    name: "Golden Current",
    primary: "#0080C6",
    secondary: "#FFC20E",
  },
  {
    id: "LAR",
    shortCode: "ROYAL",
    name: "Royal Sunset",
    primary: "#003594",
    secondary: "#FFA300",
  },
  {
    id: "MIA",
    shortCode: "SOUTH BEACH",
    name: "South Beach",
    primary: "#008E97",
    secondary: "#FC4C02",
  },
  {
    id: "MIN",
    shortCode: "NORDIC",
    name: "Nordic Gold",
    primary: "#4F2683",
    secondary: "#FFC62F",
  },
  {
    id: "NE",
    shortCode: "HARBOR",
    name: "Harbor Red",
    primary: "#002244",
    secondary: "#C60C30",
  },
  {
    id: "NO",
    shortCode: "CRESCENT",
    name: "Crescent Gold",
    primary: "#101820",
    secondary: "#D3BC8D",
  },
  {
    id: "NYG",
    shortCode: "EMPIRE",
    name: "Empire Blue",
    primary: "#0B2265",
    secondary: "#A71930",
  },
  {
    id: "NYJ",
    shortCode: "GOTHAM",
    name: "Gotham Green",
    primary: "#125740",
    secondary: "#000000",
  },
  {
    id: "PHI",
    shortCode: "MIDNIGHT",
    name: "Midnight Teal",
    primary: "#004C54",
    secondary: "#A5ACAF",
  },
  {
    id: "PIT",
    shortCode: "STEEL",
    name: "Steel Gold",
    primary: "#101820",
    secondary: "#FFB612",
  },
  {
    id: "SF",
    shortCode: "GOLD RUSH",
    name: "Gold Rush",
    primary: "#AA0000",
    secondary: "#B3995D",
  },
  {
    id: "SEA",
    shortCode: "PACIFIC",
    name: "Pacific Voltage",
    primary: "#002244",
    secondary: "#69BE28",
  },
  {
    id: "TB",
    shortCode: "HARBOR",
    name: "Crimson Harbor",
    primary: "#D50A0A",
    secondary: "#34302B",
  },
  {
    id: "TEN",
    shortCode: "MUSIC CITY",
    name: "Music City Ice",
    primary: "#0C2340",
    secondary: "#4B92DB",
  },
  {
    id: "WAS",
    shortCode: "CAPITAL",
    name: "Capital Gold",
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
  const passCatcher = ["QB", "WR", "TE"].includes(player.position);
  const windPenalty = game.indoor ? 0 : (game.windMph ?? 0) >= 25 ? (passCatcher ? -.16 : -.05) : (game.windMph ?? 0) >= 18 ? (passCatcher ? -.1 : -.03) : 0;
  const rainPenalty = game.indoor ? 0 : (game.precipitationProbability ?? 0) >= 60 ? (player.position === "RB" ? -.02 : -.06) : 0;
  const coldPenalty = game.indoor ? 0 : (game.temperatureF ?? 60) <= 25 ? -.04 : 0;
  return { ...player, weatherAdjustment: Math.max(-.22, windPenalty + rainPenalty + coldPenalty), weatherSummary: game.summary };
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

const opponentCode = (opponent: string) =>
  normalizeNflTeam(opponent.replace(/^(vs|@)\s+/, "").trim());
const matchupPosition = (position: string) => position === "FB" ? "RB" : position;
const matchupPointsLabel = (position: string) =>
  position === "K" ? "fantasy points allowed to kickers" : position === "DEF" ? "fantasy points allowed to D/ST" : `PPR fantasy points allowed to ${position}`;
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
      className={`matchup-team matchup-${strength.label.toLowerCase()}`}
      style={{ "--matchup-hue": hue, "--matchup-position": `${strength.score}%` } as CSSProperties}
      title={`${player.matchupSourceSeason ?? new Date().getUTCFullYear() - 1} ${matchupPosition(player.position)} matchup: ${strength.label}, ${strength.rank}${strength.rank === 1 ? "st" : strength.rank === 2 ? "nd" : strength.rank === 3 ? "rd" : "th"} most ${matchupPointsLabel(matchupPosition(player.position))} (${strength.pointsAllowed.toFixed(1)} per game)`}
    >
      <b>{player.opponent}</b>
      <span><i /><b>{strength.label}</b> · #{strength.rank} vs {matchupPosition(player.position)}</span>
    </span>
  );
}

function matchupAdjustedRange(player: Player) {
  const projection = Math.max(0, player.projection);
  const positionVolatility: Record<string, number> = { QB: .24, RB: .36, WR: .43, TE: .4, K: .48, DEF: .46 };
  const baseVolatility = positionVolatility[matchupPosition(player.position)] ?? .38;
  const benchVolatility = isStartingPlayer(player) ? 0 : .07;
  const snapVolatility = typeof player.snapPct === "number" ? Math.max(-.07, Math.min(.1, (65 - player.snapPct) / 250)) : 0;
  const injuryVolatility = /questionable|doubtful|out/i.test(player.status) ? .1 : 0;
  const roleStability = projection >= 18 ? -.04 : projection <= 7 ? .06 : 0;
  const volatility = Math.max(.18, Math.min(.62, baseVolatility + benchVolatility + snapVolatility + injuryVolatility + roleStability));
  const trendTail = Math.max(-.08, Math.min(.08, player.trend / 100));
  const offenseTail = player.teamOffenseRank2025 == null ? 0 : Math.max(-.05, Math.min(.05, (17 - player.teamOffenseRank2025) / 320));
  const baseFloor = Number(Math.max(0, projection * (1 - volatility - Math.min(0, trendTail))).toFixed(1));
  const baseCeiling = Number(Math.max(projection, projection * (1 + volatility + Math.max(0, trendTail) + offenseTail)).toFixed(1));
  const strength = player.matchupStrength;
  if (!strength) return { floor: baseFloor, ceiling: baseCeiling, edge: 0, confidence: 0 };
  const confidence = Math.min(1, strength.games / 8);
  const edge = ((strength.score - 50) / 50) * confidence;
  const floorFactor = 1 + edge * (edge >= 0 ? 0.04 : 0.12);
  const ceilingFactor = 1 + edge * (edge >= 0 ? 0.12 : 0.04);
  return {
    floor: Number(Math.max(0, baseFloor * floorFactor).toFixed(1)),
    ceiling: Number(Math.max(player.projection, baseCeiling * ceilingFactor).toFixed(1)),
    edge,
    confidence,
  };
}

function aggressionScore(player: Player, aggressiveness: number) {
  const range = matchupAdjustedRange(player);
  const risk = aggressiveness / 100;
  const floorWeight = Math.max(0, 1 - risk * 2);
  const ceilingWeight = Math.max(0, risk * 2 - 1);
  const medianWeight = 1 - floorWeight - ceilingWeight;
  return range.floor * floorWeight + player.projection * medianWeight + range.ceiling * ceilingWeight;
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
  const cachedAccount = cachedAccountBootstrap(accountUser?.email);
  const initialPortfolioCache = useMemo(
    () => cachedPortfolioScans(cachedAccount?.connection?.sleeperUserId ?? accountUser?.email),
    [accountUser?.email, cachedAccount?.connection?.sleeperUserId],
  );
  const [view, setView] = useState<View>("All Leagues");
  const [draftStylesReady, setDraftStylesReady] = useState(false);
  useEffect(() => {
    if (view === "Trade Lab") void import("./trade-calculator.css");
    if (view === "Player Rankings" || view === "ADP") void import("./player-ranks.css");
    if (view !== "Draft HQ" || draftStylesReady) return;
    let active = true;
    void Promise.all([
      import("./draft-dashboard.css"),
      import("./draft-dashboard-list.css"),
    ]).then(() => {
      if (active) setDraftStylesReady(true);
    });
    return () => { active = false; };
  }, [view, draftStylesReady]);
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    document.querySelector<HTMLElement>(".workspace")?.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [view]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [leagueId, setLeagueId] = useState("");
  const [leagueName, setLeagueName] = useState("No league selected");
  const [importState, setImportState] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [starterChoice, setStarterChoice] = useState("Rome Odunze");
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [leagueTeams, setLeagueTeams] = useState<LeagueTeam[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [leagueRankings, setLeagueRankings] = useState<LeagueRanking[]>([]);
  const [rankingContext, setRankingContext] = useState<RankingContext | null>(
    null,
  );
  const [waiverPlayers, setWaiverPlayers] = useState<WaiverPlayer[]>([]);
  const [waiverTrending, setWaiverTrending] = useState<WaiverTrending>({ up: [], down: [] });
  const [leagueStatus, setLeagueStatus] = useState("unknown");
  const [leagueWeek, setLeagueWeek] = useState(0);
  const [leagueSeason, setLeagueSeason] = useState(
    String(new Date().getFullYear()),
  );
  const [leagueRefreshedAt, setLeagueRefreshedAt] = useState<number | null>(null);
  const [connection, setConnection] = useState<SleeperConnection | null>(cachedAccount?.connection ?? null);
  const [leaguePlatform, setLeaguePlatform] = useState("Sleeper");
  const [availableLeagues, setAvailableLeagues] = useState<ConnectedLeague[]>(
    cachedAccount?.connectedLeagues ?? [],
  );
  const [hiddenLeagueIds, setHiddenLeagueIds] = useState<string[]>(() => {
    try { return JSON.parse(cachedAccount?.preferences?.hiddenLeagueIdsJson ?? "[]") as string[]; }
    catch { return []; }
  });
  const [managedLeagues, setManagedLeagues] = useState<ManagedLeague[]>(cachedAccount?.leagues ?? []);
  const [portfolioScans, setPortfolioScans] = useState<LeagueScan[]>(initialPortfolioCache?.scans ?? []);
  const [portfolioScansSavedAt, setPortfolioScansSavedAt] = useState(initialPortfolioCache?.savedAt ?? 0);
  const updatePortfolioScans = useCallback((nextScans: LeagueScan[]) => {
    setPortfolioScans(nextScans);
    setPortfolioScansSavedAt(Date.now());
  }, []);
  const [liveMatchupCount, setLiveMatchupCount] = useState<number | null>(null);
  const [selectedMatchupId, setSelectedMatchupId] = useState<number | null>(
    null,
  );
  const [scoreboardScope, setScoreboardScope] = useState<"all" | "league">("all");
  const [accountLoading, setAccountLoading] = useState(Boolean(accountUser && !cachedAccount));
  const [accountError, setAccountError] = useState("");
  const [entitlement, setEntitlement] = useState<AccountEntitlement>(cachedAccount?.entitlement ?? { plan: "free", status: "inactive", pro: false, elite: false, currentPeriodEnd: null, provider: null, owner: false });
  const [rivalryWeek, setRivalryWeek] = useState<RivalryWeek | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(cachedAccount?.preferences ? !cachedAccount.preferences.onboardingCompletedAt : false);
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "light";
    const savedTheme = cachedAccount?.preferences?.colorMode ?? window.localStorage.getItem("fantasy-hub-theme");
    if (savedTheme === "light" || savedTheme === "dark") return savedTheme;
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });
  const [teamTheme, setTeamTheme] = useState(cachedAccount?.preferences?.teamTheme ?? "LAC");
  const [badgeTheme, setBadgeTheme] = useState<BadgeTheme>(cachedAccount?.preferences?.badgeTheme ?? "arcade");
  const parseOwnedThemes = (value: string | undefined, fallback: string) => {
    try { return [...new Set([fallback, ...(JSON.parse(value ?? "[]") as string[])])]; }
    catch { return [fallback]; }
  };
  const [ownedTeamThemes, setOwnedTeamThemes] = useState<string[]>(() => parseOwnedThemes(cachedAccount?.preferences?.ownedTeamThemesJson, cachedAccount?.preferences?.teamTheme ?? "LAC"));
  const [ownedBadgeThemes, setOwnedBadgeThemes] = useState<string[]>(() => parseOwnedThemes(cachedAccount?.preferences?.ownedBadgeThemesJson, cachedAccount?.preferences?.badgeTheme ?? "arcade"));
  const effectiveTeamTheme = teamTheme;
  const effectiveBadgeTheme: BadgeTheme = badgeTheme;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    const isIPadLayout = window.matchMedia(
      "(min-width: 701px) and (max-width: 1366px) and (pointer: coarse)",
    ).matches;
    return isIPadLayout
      ? false
      : window.localStorage.getItem("fantasy-hub-sidebar-collapsed") === "true";
  });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileCategoryOpen, setMobileCategoryOpen] = useState<NavGroup | null>(null);
  const [leagueDrawerOpen, setLeagueDrawerOpen] = useState(false);
  const [leagueHandlePreviewing, setLeagueHandlePreviewing] = useState(false);
  const [draggedLeagueId, setDraggedLeagueId] = useState("");
  const [leagueDropTarget, setLeagueDropTarget] = useState<{
    id: string;
    position: "before" | "after";
  } | null>(null);
  const importRequest = useRef(0);
  const preferenceSaveQueue = useRef<Promise<void>>(Promise.resolve());
  const leagueDragOccurred = useRef(false);

  useEffect(() => initializeNativeRuntime(), []);

  useEffect(() => {
    let secondFrame = 0;
    let timer = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      setLeagueHandlePreviewing(false);
      secondFrame = window.requestAnimationFrame(() => {
        setLeagueHandlePreviewing(true);
        timer = window.setTimeout(() => setLeagueHandlePreviewing(false), 1_300);
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      window.clearTimeout(timer);
    };
  }, [view]);
  useOverflowAutoScroll();
  useOverlayGuard();
  useProductMonitoring(view, importState === "loading", accountError);

  useEffect(() => {
    if (!entitlement.pro || !leagueId || leaguePlatform.toLowerCase() !== "sleeper") {
      return;
    }
    let controller = new AbortController();
    const loadRivalryWeek = () => {
      controller.abort();
      controller = new AbortController();
      const currentController = controller;
      void fetch(`/api/rivalry-week?leagueId=${encodeURIComponent(leagueId)}`, { signal: currentController.signal })
        .then(async (response) => response.ok ? await response.json() as RivalryWeek | { active: false } : { active: false as const })
        .then((payload) => { if (!currentController.signal.aborted) setRivalryWeek(payload.active ? payload : null); })
        .catch(() => { if (!currentController.signal.aborted) setRivalryWeek(null); });
    };
    const refreshAfterRivalChange = (event: Event) => {
      const changedLeagueId = (event as CustomEvent<{ leagueId?: string }>).detail?.leagueId;
      if (!changedLeagueId || changedLeagueId === leagueId) loadRivalryWeek();
    };
    loadRivalryWeek();
    window.addEventListener("fantasy-hub:rivals-updated", refreshAfterRivalChange);
    return () => {
      controller.abort();
      window.removeEventListener("fantasy-hub:rivals-updated", refreshAfterRivalChange);
    };
  }, [entitlement.pro, leagueId, leaguePlatform]);

  useEffect(() => {
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (mode: "portrait") => Promise<void>;
    };
    if (
      !orientation?.lock ||
      !window.matchMedia("(max-width: 700px) and (pointer: coarse)").matches
    ) return;
    void orientation.lock("portrait").catch(() => {
      // Regular browser tabs may reject orientation locking. The installed PWA
      // manifest and native iOS plist remain the authoritative constraints.
    });
  }, []);

  useEffect(() => {
    if (view !== "Waiver Wire") return;
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    });
  }, [view]);

  useEffect(() => {
    if (!mobileNavOpen && !mobileCategoryOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileNavOpen(false);
        setMobileCategoryOpen(null);
      }
    };
    const closeCategoryOnOutsidePress = (event: PointerEvent) => {
      if (!mobileCategoryOpen || !(event.target instanceof Element)) return;
      if (event.target.closest(".mobile-category-menu, .mobile-category-tray")) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setMobileCategoryOpen(null);
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeCategoryOnOutsidePress, true);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeCategoryOnOutsidePress, true);
    };
  }, [mobileNavOpen, mobileCategoryOpen]);

  useEffect(() => {
    let edgeStart: { x: number; y: number } | null = null;
    const drawerViewport = window.matchMedia("(max-width: 700px), (min-width: 701px) and (max-width: 1366px) and (pointer: coarse)");
    const onTouchStart = (event: TouchEvent) => {
      if (!drawerViewport.matches) {
        edgeStart = null;
        return;
      }
      const touch = event.touches[0];
      if (!touch || touch.clientX < window.innerWidth - 24) return;
      edgeStart = { x: touch.clientX, y: touch.clientY };
    };
    const onTouchEnd = (event: TouchEvent) => {
      const touch = event.changedTouches[0];
      if (!edgeStart || !touch) return;
      const horizontalTravel = edgeStart.x - touch.clientX;
      const verticalTravel = Math.abs(edgeStart.y - touch.clientY);
      edgeStart = null;
      if (drawerViewport.matches && horizontalTravel > 48 && verticalTravel < 72) {
        setMobileCategoryOpen(null);
        setMobileNavOpen(false);
        setLeagueDrawerOpen(true);
      }
    };
    const closeDrawerOutsideMobileLayout = (event: MediaQueryListEvent) => {
      if (!event.matches) {
        edgeStart = null;
        setLeagueDrawerOpen(false);
      }
    };
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    drawerViewport.addEventListener("change", closeDrawerOutsideMobileLayout);
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchend", onTouchEnd);
      drawerViewport.removeEventListener("change", closeDrawerOutsideMobileLayout);
    };
  }, []);

  useEffect(() => {
    if (!leagueDrawerOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLeagueDrawerOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [leagueDrawerOpen]);

  useEffect(() => {
    const leagues = availableLeagues.filter(
      (league) => !hiddenLeagueIds.includes(league.id),
    );
    if (!leagues.length) return;
    let active = true;
    const week = leagueStatus === "pre_draft" || leagueWeek < 1
      ? 1
      : Math.min(18, leagueWeek);
    const refreshLiveMatchups = async () => {
      const results = await mapWithConcurrency(leagues, 3, async (league) => {
        try {
          const response = await fetchWithTimeout(
            `/api/scoreboard?leagueId=${encodeURIComponent(league.id)}&week=${week}&scope=mine`,
            {},
            12_000,
          );
          if (!response.ok) return false;
          const data = await response.json() as ScoreboardData;
          const matchup = data.matchups.find((item) =>
            item.teams.some((team) => team.isMine),
          );
          return matchup?.status === "Live";
        } catch {
          return false;
        }
      });
      if (active) setLiveMatchupCount(results.filter(Boolean).length);
    };
    void refreshLiveMatchups();
    const stopPolling = startVisiblePolling(refreshLiveMatchups);
    return () => {
      active = false;
      stopPolling();
    };
  }, [availableLeagues, hiddenLeagueIds, leagueStatus, leagueWeek]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    const systemBackground = theme === "dark" ? "#181b22" : "#f4f7f5";
    document.documentElement.style.backgroundColor = systemBackground;
    document.body.style.backgroundColor = systemBackground;
    const themeColors = Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'));
    const themeColor = themeColors[0] ?? document.createElement("meta");
    themeColor.name = "theme-color";
    themeColor.content = systemBackground;
    themeColor.removeAttribute("media");
    if (!themeColor.isConnected) document.head.appendChild(themeColor);
    themeColors.slice(1).forEach((entry) => entry.remove());
    safeLocalStorageSet("fantasy-hub-theme", theme);
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    const selectedTheme =
      nflThemes.find((team) => team.id === effectiveTeamTheme) ??
      nflThemes.find((team) => team.id === "LAC")!;
    const rawPrimaryColor = selectedTheme.primary;
    const primaryBrightness =
      colorChannels(rawPrimaryColor).reduce(
        (sum, channel) => sum + channel,
        0,
      ) / 3;
    // Premium themes intentionally use deep brand colors. In dark mode those
    // colors also power accent text, so lift only very dark primaries enough to
    // remain readable while preserving their hue and theme identity.
    const primaryColor =
      theme === "dark" && primaryBrightness < 96
        ? mixColor(rawPrimaryColor, 255, 0.32)
        : rawPrimaryColor;
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
    safeLocalStorageSet("fantasy-hub-team-theme", selectedTheme.id);
    window.localStorage.removeItem("fantasy-hub-primary");
    window.localStorage.removeItem("fantasy-hub-secondary");
  }, [effectiveTeamTheme, theme]);

  useEffect(() => {
    document.documentElement.dataset.badgeTheme = effectiveBadgeTheme;
    safeLocalStorageSet("fantasy-hub-badge-theme", effectiveBadgeTheme);
  }, [effectiveBadgeTheme]);

  useEffect(() => {
    if (!accountUser) return;
    let active = true;
    void (async () => {
      // League discovery should never wait on StoreKit. Saved leagues can begin
      // hydrating immediately while purchase state is reconciled in parallel.
      const nativeEntitlementRefresh = isNativeIosApp()
        ? nativeRestorePurchases().catch(() => false)
        : Promise.resolve(false);
      const cachedLeagueId = window.localStorage.getItem("fantasy-hub-active-league");
      if (cachedLeagueId) void importLeague(cachedLeagueId);
      try {
        const freshlyBootstrapped = cachedAccount && Date.now() - cachedAccount.savedAt < 10_000;
        const data = freshlyBootstrapped ? cachedAccount : await (async () => {
          const response = await fetch("/api/v1/bootstrap");
          if (!response.ok) throw new Error("Account unavailable");
          return await response.json() as {
          connection?: SleeperConnection | null;
          preferences?: AccountPreferences | null;
          entitlement?: AccountEntitlement;
          leagues?: ManagedLeague[];
          connectedLeagues?: ConnectedLeague[];
          };
        })();
        if (!active) return;
        setConnection(data.connection ?? null);
        const nextEntitlement = data.entitlement ?? { plan: "free" as const, status: "inactive", pro: false, elite: false, currentPeriodEnd: null, provider: null, owner: false };
        setEntitlement(nextEntitlement);
        setManagedLeagues(data.leagues ?? []);
        const savedLeagueOrder = (() => {
          try {
            return JSON.parse(data.preferences?.leagueOrderJson ?? "[]") as string[];
          } catch {
            return [];
          }
        })();
        const savedLeagueOrderIndex = new Map(savedLeagueOrder.map((id, index) => [id, index]));
        const bootstrappedLeagues = [...(data.connectedLeagues ?? [])].sort((a, b) => {
          const aIndex = savedLeagueOrderIndex.get(a.id);
          const bIndex = savedLeagueOrderIndex.get(b.id);
          if (aIndex == null && bIndex == null) return 0;
          if (aIndex == null) return 1;
          if (bIndex == null) return -1;
          return aIndex - bIndex;
        });
        if (bootstrappedLeagues.length) {
          setAvailableLeagues(bootstrappedLeagues);
          const selected = bootstrappedLeagues.find((league) => league.id === cachedLeagueId) ?? bootstrappedLeagues[0];
          setLeagueId(selected.id);
          setLeagueName(selected.name);
          void importLeague(selected.id, data.connection?.sleeperUserId, selected.rosterId);
          // League discovery is considerably more expensive than opening a
          // saved league. Refresh it in the background only when its snapshot
          // is old; Manage Leagues still exposes an unconditional refresh.
          const discoveryRefreshedAt = Number(
            window.localStorage.getItem("fantasy-hub-league-discovery-refreshed-at") ?? 0,
          );
          if (Date.now() - discoveryRefreshedAt >= LEAGUE_DISCOVERY_TTL_MS) {
            void loadLeagues(false, true).catch(() => undefined);
          }
        } else if (data.connection) {
          void loadLeagues(true).catch(() => setAccountError("League refresh is temporarily unavailable."));
        }
        safeLocalStorageSet(
          `fantasy-hub-account-bootstrap:${accountUser.email.trim().toLowerCase()}`,
          JSON.stringify({ savedAt: Date.now(), ...data }),
        );
        if (data.preferences) {
          setTheme(data.preferences.colorMode);
          const effectiveTeamTheme = data.preferences.teamTheme;
          const effectiveBadgeTheme = data.preferences.badgeTheme;
          setTeamTheme(effectiveTeamTheme);
          setBadgeTheme(effectiveBadgeTheme);
          setOwnedTeamThemes(parseOwnedThemes(data.preferences.ownedTeamThemesJson, data.preferences.teamTheme));
          setOwnedBadgeThemes(parseOwnedThemes(data.preferences.ownedBadgeThemesJson, data.preferences.badgeTheme));
          safeLocalStorageSet("fantasy-hub-theme", data.preferences.colorMode);
          safeLocalStorageSet("fantasy-hub-team-theme", effectiveTeamTheme);
          safeLocalStorageSet("fantasy-hub-badge-theme", effectiveBadgeTheme);
          safeLocalStorageSet("fantasy-hub-league-order", data.preferences.leagueOrderJson);
          const savedHiddenLeagueIds = data.preferences.hiddenLeagueIdsJson ?? "[]";
          safeLocalStorageSet("fantasy-hub-hidden-leagues", savedHiddenLeagueIds);
          try {
            setHiddenLeagueIds(JSON.parse(savedHiddenLeagueIds) as string[]);
          } catch {
            setHiddenLeagueIds([]);
          }
          setNeedsOnboarding(!data.preferences.onboardingCompletedAt);
        } else {
          setTheme("light");
          safeLocalStorageSet("fantasy-hub-theme", "light");
          setNeedsOnboarding(true);
        }
        setAccountLoading(false);
        if (isNativeIosApp()) {
          void nativeEntitlementRefresh.then(async () => {
            if (!active) return;
            const reconciledResponse = await fetch("/api/account");
            if (!reconciledResponse.ok || !active) return;
            const reconciled = (await reconciledResponse.json()) as {
              preferences?: AccountPreferences | null;
              entitlement?: AccountEntitlement;
            };
            if (!active) return;
            const reconciledEntitlement = reconciled.entitlement ?? { plan: "free" as const, status: "inactive", pro: false, elite: false, currentPeriodEnd: null, provider: null, owner: false };
            setEntitlement(reconciledEntitlement);
            if (reconciled.preferences) {
              const reconciledTeamTheme = reconciled.preferences.teamTheme;
              const reconciledBadgeTheme = reconciled.preferences.badgeTheme;
              setTeamTheme(reconciledTeamTheme);
              setBadgeTheme(reconciledBadgeTheme);
              setOwnedTeamThemes(parseOwnedThemes(reconciled.preferences.ownedTeamThemesJson, reconciled.preferences.teamTheme));
              setOwnedBadgeThemes(parseOwnedThemes(reconciled.preferences.ownedBadgeThemesJson, reconciled.preferences.badgeTheme));
              safeLocalStorageSet("fantasy-hub-team-theme", reconciledTeamTheme);
              safeLocalStorageSet("fantasy-hub-badge-theme", reconciledBadgeTheme);
            }
          }).catch(() => {
            // The initial server entitlement remains the safe fallback.
          });
        }
      } catch {
        if (!active) return;
        setAccountError(
          "We couldn’t load your Fantasy Hub account. Refresh and try again.",
        );
      } finally {
        if (active) setAccountLoading(false);
      }
    })();
    return () => { active = false; };
    // Account bootstrap intentionally runs only when the authenticated user changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountUser]);

  async function saveAccountPreferences(overrides: Partial<{ colorMode: Theme; teamTheme: string; badgeTheme: BadgeTheme; leagueOrder: string[]; hiddenLeagueIds: string[] }>, completeOnboarding = false) {
    const save = async () => {
      const response = await fetch("/api/account/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ colorMode: theme, teamTheme, badgeTheme, ...overrides, completeOnboarding }),
      });
      if (!response.ok) throw new Error("Preference sync failed");
      if (completeOnboarding) setNeedsOnboarding(false);
    };
    const queuedSave = preferenceSaveQueue.current.then(save, save);
    preferenceSaveQueue.current = queuedSave.catch(() => undefined);
    try {
      await queuedSave;
    } catch {
      setAccountError("Your changes are applied on this device, but account sync will retry later.");
    }
  }

  function toggleLeagueVisibility(id: string) {
    setHiddenLeagueIds((current) => {
      const hiding = !current.includes(id);
      const next = current.includes(id)
        ? current.filter((leagueId) => leagueId !== id)
        : [...current, id];
      safeLocalStorageSet("fantasy-hub-hidden-leagues", JSON.stringify(next));
      void saveAccountPreferences({ hiddenLeagueIds: next });
      if (hiding && id === leagueId) {
        const nextVisibleLeague = availableLeagues.find(
          (league) => league.id !== id && !next.includes(league.id),
        );
        if (nextVisibleLeague) {
          void openConnectedLeague(nextVisibleLeague);
        } else {
          setLeagueId("");
          setLeagueName("No league selected");
          setPlayers([]);
          setLeagueTeams([]);
          setSelectedTeamId("");
          setLeagueRankings([]);
          setRankingContext(null);
          setWaiverPlayers([]);
          setWaiverTrending({ up: [], down: [] });
          setImportState("idle");
        }
      }
      return next;
    });
  }

  useEffect(() => {
    if (!accountUser || !portfolioScans.length) return;
    const cacheKey = `fantasy-hub-portfolio-scans:${connection?.sleeperUserId ?? accountUser.email}`;
    if (portfolioScans.some((scan) => scan.status === "unavailable")) {
      window.localStorage.removeItem(cacheKey);
      return;
    }
    safeLocalStorageSet(cacheKey, JSON.stringify({
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

  async function importLeague(
    idOverride?: string,
    ownerIdOverride?: string,
    rosterIdOverride?: string,
    forceRefresh = false,
    silent = false,
  ) {
    const requestedLeagueId = idOverride?.trim() || leagueId.trim();
    if (!requestedLeagueId) return;
    const requestNumber = ++importRequest.current;
    if (!silent) {
      setImportState("loading");
      setSelectedPlayer(null);
      setPlayers([]);
      setLeagueTeams([]);
      setSelectedTeamId("");
      setLeagueRankings([]);
      setRankingContext(null);
      setWaiverPlayers([]);
      setWaiverTrending({ up: [], down: [] });
      setLeagueStatus("unknown");
      setLeagueWeek(0);
      setLeagueRefreshedAt(null);
      setSelectedMatchupId(null);
      setStarterChoice("");
    }
    const normalizeId = (value?: string | null) => value?.trim().toLowerCase() ?? "";
    const savedTeamId = window.localStorage.getItem(
      `fantasy-hub-selected-team:${requestedLeagueId}`,
    );
    const resolveOwnedTeam = (teams: LeagueTeam[]) => {
      const rosterId = normalizeId(rosterIdOverride);
      const ownerId = normalizeId(ownerIdOverride);
      const rememberedId = normalizeId(savedTeamId);
      return (
        (rosterId
          ? teams.find((team) => normalizeId(team.id) === rosterId)
          : undefined) ??
        (ownerId
          ? teams.find((team) => normalizeId(team.ownerId) === ownerId)
          : undefined) ??
        (rememberedId
          ? teams.find((team) => normalizeId(team.id) === rememberedId)
          : undefined) ??
        (teams.length === 1 ? teams[0] : undefined)
      );
    };
    const applyCachedCore = (data: {
      league?: { name?: string; platform?: string; status?: string; season?: string; currentWeek?: number };
      teams?: LeagueTeam[];
      rankings?: LeagueRanking[];
      waiverPlayers?: WaiverPlayer[];
      waiverTrending?: WaiverTrending;
      rankingContext?: RankingContext;
      cache?: { refreshedAt?: string };
    }) => {
      if (!data.league) return;
      const season = data.league.season ?? String(new Date().getFullYear());
      const currentWeek = Math.max(1, data.league.currentWeek ?? 1);
      const schedule = readCachedScheduleData(season);
      const matchupStrengths = readCachedMatchupStrengths(season, currentWeek);
      const enhancePlayer = (player: Player) =>
        applyMatchupStrength(applyOpponent(player, schedule, currentWeek), matchupStrengths);
      const importedTeams = (data.teams ?? []).map((team) => ({
        ...team,
        roster: team.roster.map(enhancePlayer),
      }));
      const ownedTeam = resolveOwnedTeam(importedTeams);
      setLeagueId(requestedLeagueId);
      setLeagueName(data.league.name ?? "Saved league");
      setLeaguePlatform(data.league.platform ?? "Sleeper");
      setLeagueTeams(importedTeams);
      if (ownedTeam) {
        setSelectedTeamId(ownedTeam.id);
        setPlayers(ownedTeam.roster);
      } else {
        setSelectedTeamId("");
        setPlayers([]);
      }
      setLeagueRankings((data.rankings ?? []).map(enhancePlayer));
      setWaiverPlayers((data.waiverPlayers ?? []).map((player) => enhancePlayer(player) as WaiverPlayer));
      setWaiverTrending({
        up: (data.waiverTrending?.up ?? []).map((player) => enhancePlayer(player) as WaiverPlayer),
        down: (data.waiverTrending?.down ?? []).map((player) => enhancePlayer(player) as WaiverPlayer),
      });
      setLeagueStatus(data.league.status ?? "unknown");
      setLeagueWeek(data.league.currentWeek ?? 0);
      setLeagueSeason(data.league.season ?? String(new Date().getFullYear()));
      setRankingContext(data.rankingContext ?? null);
      setLeagueRefreshedAt(data.cache?.refreshedAt ? new Date(data.cache.refreshedAt).getTime() : null);
      setImportState("success");
    };
    try {
      const cached = JSON.parse(
        window.localStorage.getItem(`fantasy-hub-league-bootstrap:${requestedLeagueId}`) ?? "null",
      ) as Parameters<typeof applyCachedCore>[0] | null;
      if (cached) applyCachedCore(cached);
    } catch {
      window.localStorage.removeItem(`fantasy-hub-league-bootstrap:${requestedLeagueId}`);
    }
    try {
      const response = await fetch(
        `/api/league?id=${encodeURIComponent(requestedLeagueId)}${forceRefresh ? "&refresh=1" : ""}`,
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
        waiverTrending?: WaiverTrending;
        rankingContext?: RankingContext;
        cache?: { status?: string; refreshedAt?: string };
      };
      cacheActiveLeagueBootstrap(requestedLeagueId, JSON.stringify(data));
      safeLocalStorageSet("fantasy-hub-active-league", requestedLeagueId);
      if (requestNumber !== importRequest.current) return;
      const season = data.league.season ?? String(new Date().getFullYear());
      const currentWeek = Math.max(1, data.league.currentWeek ?? 1);
      const applyLeagueData = (
        weather: WeatherData | null,
        schedule: NflScheduleData | null,
        matchupStrengths: MatchupStrengthData | null,
      ) => {
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
        const ownedTeam = resolveOwnedTeam(importedTeams);
        if (ownedTeam) {
          setSelectedTeamId(ownedTeam.id);
          setPlayers(ownedTeam.roster);
        } else {
          setSelectedTeamId("");
          setPlayers([]);
        }
        setLeagueRankings((data.rankings ?? []).map((player) =>
          applyMatchupStrength(applyWeather(applyOpponent(player, schedule, currentWeek), weather), matchupStrengths),
        ));
        const enhanceWaiverPlayer = (player: WaiverPlayer) =>
          applyMatchupStrength(
            applyWeather(applyOpponent(player, schedule, currentWeek), weather),
            matchupStrengths,
          ) as WaiverPlayer;
        setWaiverPlayers((data.waiverPlayers ?? []).map(enhanceWaiverPlayer));
        setWaiverTrending({
          up: (data.waiverTrending?.up ?? []).map(enhanceWaiverPlayer),
          down: (data.waiverTrending?.down ?? []).map(enhanceWaiverPlayer),
        });
        setLeagueStatus(data.league.status ?? "unknown");
        setLeagueWeek(data.league.currentWeek ?? 0);
        setLeagueSeason(season);
        setRankingContext(data.rankingContext ?? null);
        setLeagueRefreshedAt(
          data.cache?.refreshedAt
            ? new Date(data.cache.refreshedAt).getTime()
            : Date.now(),
        );
        setImportState("success");
      };
      // Shared NFL context is identical across leagues. Reuse it synchronously
      // so a cached roster keeps its opponent grades on the first switch paint.
      applyLeagueData(
        null,
        readCachedScheduleData(season),
        readCachedMatchupStrengths(season, currentWeek),
      );
      let weather: WeatherData | null = null;
      let schedule: NflScheduleData | null = null;
      let matchupStrengths: MatchupStrengthData | null = null;
      try {
        const [weatherPayload, schedulePayload, matchupPayload] = await Promise.all([
          loadWeatherData(season, currentWeek),
          loadScheduleData(season),
          loadMatchupStrengthData(season, currentWeek),
        ]);
        weather = weatherPayload;
        schedule = schedulePayload;
        matchupStrengths = matchupPayload;
      } catch {
        /* Schedule and weather enrichment are optional; core roster loading continues. */
      }
      applyLeagueData(weather, schedule, matchupStrengths);
    } catch {
      if (requestNumber !== importRequest.current) return;
      if (!silent) setImportState("error");
    }
  }

  async function loadLeagues(activateFirst = false, forceRefresh = false) {
    const response = await fetch(`/api/account/leagues${forceRefresh ? "?refresh=1" : ""}`);
    if (!response.ok) throw new Error("Leagues unavailable");
    const data = (await response.json()) as {
      connection: SleeperConnection | null;
      leagues: ConnectedLeague[];
    };
    if (forceRefresh)
      safeLocalStorageSet("fantasy-hub-league-discovery-refreshed-at", String(Date.now()));
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
    const savedHiddenLeagueIds = (() => {
      try {
        return JSON.parse(
          window.localStorage.getItem("fantasy-hub-hidden-leagues") ?? "[]",
        ) as string[];
      } catch {
        return [];
      }
    })();
    const selectableLeagues = orderedLeagues.filter(
      (league) => !savedHiddenLeagueIds.includes(league.id),
    );
    try {
      const cached = JSON.parse(
        window.localStorage.getItem(
          `fantasy-hub-portfolio-scans:${data.connection?.sleeperUserId ?? accountUser?.email ?? "account"}`,
        ) ?? "null",
      ) as { version?: number; savedAt?: number; scans?: LeagueScan[] } | null;
      const leagueIds = new Set(orderedLeagues.map((league) => league.id));
      if (
        cached?.version === PORTFOLIO_CACHE_VERSION &&
        cached.scans?.length === orderedLeagues.length &&
        cached.scans.every((scan) => leagueIds.has(scan.league.id))
      ) {
        setPortfolioScans(cached.scans);
        setPortfolioScansSavedAt(cached.savedAt ?? 0);
      }
    } catch {
      window.localStorage.removeItem(
        `fantasy-hub-portfolio-scans:${data.connection?.sleeperUserId ?? accountUser?.email ?? "account"}`,
      );
    }
    if (data.connection) setConnection(data.connection);
    setAvailableLeagues(orderedLeagues);
    const activeLeague = selectableLeagues.find((league) => league.id === leagueId);
    if ((activateFirst || !activeLeague) && selectableLeagues.length) {
      const defaultLeague = activeLeague ?? selectableLeagues[0];
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
      safeLocalStorageSet(
        "fantasy-hub-league-order",
        JSON.stringify(ordered.map((league) => league.id)),
      );
      void saveAccountPreferences({ leagueOrder: ordered.map((league) => league.id) });
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
      safeLocalStorageSet(
        "fantasy-hub-league-order",
        JSON.stringify(ordered.map((league) => league.id)),
      );
      void saveAccountPreferences({ leagueOrder: ordered.map((league) => league.id) });
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
    setSelectedPlayer(null);
    // Swap from the local/server snapshot without clearing the current page or
    // showing a loading refresh, then reconcile fresh provider data quietly.
    await importLeague(league.id, connection?.sleeperUserId, league.rosterId, false, true);
    void importLeague(league.id, connection?.sleeperUserId, league.rosterId, true, true);
  }

  function selectLeagueTeam(teamId: string) {
    setSelectedTeamId(teamId);
    const team = leagueTeams.find((candidate) => candidate.id === teamId);
    setPlayers(team?.roster ?? []);
    setSelectedPlayer(null);
    if (leagueId && teamId) {
      safeLocalStorageSet(`fantasy-hub-selected-team:${leagueId}`, teamId);
    } else if (leagueId) {
      window.localStorage.removeItem(`fantasy-hub-selected-team:${leagueId}`);
    }
  }

  const selectedLeagueTeam = leagueTeams.find(
    (team) => team.id === selectedTeamId,
  );
  const selectedConnectedLeague = availableLeagues.find(
    (league) => league.id === leagueId,
  );
  const visibleLeagues = availableLeagues.filter(
    (league) => !hiddenLeagueIds.includes(league.id),
  );
  const visibleNav = nav;
  const activeRivalryWeek = entitlement.elite && rivalryWeek?.leagueId === leagueId && leaguePlatform.toLowerCase() === "sleeper" ? rivalryWeek : null;
  const activeNavGroup = nav.find((item) => item.label === view)?.group ?? "Home";
  const proViews = new Set<View>(["Command Center", "League Analytics", "Simulator"]);
  const eliteViews = new Set<View>(["League Stories", "Manager Report"]);
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
      teams={leagueTeams}
      teamSelected={Boolean(selectedTeamId)}
      leagueStatus={leagueStatus}
    />
  );
  const viewTitle = nav.find((item) => item.label === view)?.displayLabel ?? view;

  if (!accountUser) return <SignInScreen />;
  if (accountLoading) return <AccountLoading />;
  if (needsOnboarding)
    return <AccountOnboarding displayName={accountUser.displayName} colorMode={theme} teamTheme={effectiveTeamTheme} badgeTheme={effectiveBadgeTheme} isPro={entitlement.pro} onColorMode={setTheme} onTeamTheme={setTeamTheme} onBadgeTheme={setBadgeTheme} onComplete={() => void saveAccountPreferences({}, true)} />;
  return (
    <ProjectionPlatformContext.Provider value={leaguePlatform}>
    <PlayerOpenContext.Provider value={setSelectedPlayer}>
    <main
      className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""} ${mobileNavOpen ? "mobile-nav-open" : ""} ${activeRivalryWeek ? "rivalry-week-active" : ""}`}
      data-release="scoreboard-render-fix-2"
    >
      <aside className="sidebar" id="primary-sidebar">
        <button
          className="sidebar-collapse"
          type="button"
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!sidebarCollapsed}
          title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={() => {
            setSidebarCollapsed((current) => {
              safeLocalStorageSet(
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
          <button
            className="brand-logo"
            type="button"
            aria-label="Go to Fantasy Hub home"
            title="Home"
            onClick={() => {
              void nativeImpact();
              setView("All Leagues");
              setMobileNavOpen(false);
              setMobileCategoryOpen(null);
              window.scrollTo({ top: 0, left: 0, behavior: "auto" });
            }}
          >
            <FHLogo />
          </button>
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
          {navGroupOrder.map((group) => (
            <div className="nav-group" key={group}>
              <span>{group}</span>
              {visibleNav.filter((item) => item.group === group).map((item) => (
                <button
                  key={item.label}
                  className={view === item.label ? "active" : ""}
                  onClick={() => {
                    void nativeImpact();
                    if (item.label === "Matchups") setSelectedMatchupId(null);
                    if (item.label === "Scoreboard") setScoreboardScope("all");
                    if (item.label === "Waiver Wire") window.scrollTo({ top: 0, left: 0, behavior: "auto" });
                    setView(item.label);
                    setMobileNavOpen(false);
                  }}
                  title={sidebarCollapsed ? (item.displayLabel ?? item.label) : undefined}
                >
                  <i className={`nav-badge ${item.tone}`} aria-hidden="true">
                    {item.mark}
                  </i>
                  <span className="nav-label">{item.displayLabel ?? item.label}</span>
                  {eliteViews.has(item.label) && !entitlement.elite ? <b className="nav-pro-tag nav-elite-tag">ELITE</b> : proViews.has(item.label) && !entitlement.pro && <b className="nav-pro-tag">PRO</b>}
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
              setTheme((current) => {
                const next = current === "light" ? "dark" : "light";
                void saveAccountPreferences({ colorMode: next });
                return next;
              })
            }
          >
            <span aria-hidden="true">{theme === "dark" ? "☾" : "☀"}</span>
            <b>{theme === "dark" ? "Dark mode" : "Light mode"}</b>
            <i aria-hidden="true">
              <em />
            </i>
          </button>
          <div>
            <span className="live-dot" /> {importState === "loading" ? "REFRESHING LEAGUE" : leagueRefreshedAt ? `UPDATED ${new Date(leagueRefreshedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "DATA READY"}
          </div>
          <small>{leagueId ? leagueName : "Connect a league to begin"}</small>
        </div>
      </aside>
      <button
        className="mobile-drawer-backdrop"
        type="button"
        aria-label="Close navigation menu"
        onClick={() => setMobileNavOpen(false)}
      />

      <section className="workspace">
        <div className="mobile-header-stack">
        <header className="topbar">
          <button
            className="mobile-menu-toggle"
            type="button"
            aria-label={mobileNavOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-controls="primary-sidebar"
            aria-expanded={mobileNavOpen}
            onClick={() => {
              void nativeImpact("light");
              setMobileCategoryOpen(null);
              setMobileNavOpen((current) => !current);
            }}
          >
            <span aria-hidden="true" />
            <span aria-hidden="true" />
            <span aria-hidden="true" />
          </button>
          <div>
            <p className="season-context">
              <span className="season-context-full">{periodLabel} · {leagueSeason}</span>
              <span className="season-context-mobile">{periodLabel} &apos;{leagueSeason.slice(-2)}</span>
            </p>
            <h1>{viewTitle}</h1>
          </div>
          <div className="top-actions">
            <div className="account-actions">
              <button className="account-chip account-chip-button" type="button" onClick={() => setView("My Account")}>
                <span>{accountUser.displayName.slice(0, 1).toUpperCase()}</span>
                <small>
                  {connection?.displayName ?? accountUser.displayName}
                  <b>My Account</b>
                </small>
              </button>
              <div className="account-utility-row">
                {leagueId && (
                  <a
                    className="platform-open"
                    href={selectedConnectedLeague ? platformLeagueUrl(selectedConnectedLeague) : sleeperLeagueUrl(leagueId)}
                    onClick={(event) => openPlatformLeagueOnMobile(event, selectedConnectedLeague ?? { id: leagueId, sourceId: leagueId, provider: leaguePlatform.toLowerCase() === "espn" ? "espn" : "sleeper", name: leagueName, teams: 0, format: "", scoring: "", rosterId: "", starterCount: 0 })}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${platformActionLabel(view, leaguePlatform)} (opens in a new tab)`}
                  >
                    <PlatformLogo provider={leaguePlatform} />
                    <span className="platform-open-copy">
                      <strong>{leaguePlatform.toLowerCase() === "espn" ? "Open ESPN" : "Open Sleeper"}</strong>
                      <small>{platformActionLabel(view, leaguePlatform)}</small>
                    </span>
                    <b aria-hidden="true">↗</b>
                  </a>
                )}
                <button className="ghost season-roll pro-top-action" onClick={() => setView("Fantasy Hub Pro")}>
                  <span>Fantasy Hub Pro</span> <b>PRO</b>
                </button>
                <button
                  className="account-theme-customizer"
                  type="button"
                  aria-label="Open Theme Locker"
                  onClick={() => {
                    setView("Theme Locker");
                    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
                  }}
                >
                  <i className="theme-customizer-art" aria-hidden="true"><span /><span /><span /></i>
                  <span className="theme-customizer-copy"><strong>Theme Locker</strong><small>Make the Hub yours</small></span>
                  {!entitlement.pro && <b>PRO</b>}
                  <em aria-hidden="true">›</em>
                </button>
              </div>
            </div>
          </div>
        </header>
        <nav className="mobile-category-tray" aria-label="Fantasy Hub categories">
          {mobileCategoryNav.map((item) => {
            const leadPage = nav.find((page) => page.label === item.lead)!;
            return (
            <button
              key={item.group}
              type="button"
              className={activeNavGroup === item.group ? "active" : ""}
              aria-label={item.group}
              aria-current={activeNavGroup === item.group ? "page" : undefined}
              aria-expanded={mobileCategoryOpen === item.group}
              onClick={() => {
                void nativeImpact();
                if (item.group === "Home") {
                  setView("All Leagues");
                  setMobileCategoryOpen(null);
                } else {
                  setMobileNavOpen(false);
                  setMobileCategoryOpen((current) => current === item.group ? null : item.group);
                }
              }}
            >
              <i className={`nav-badge ${leadPage.tone} ${item.categoryTone}`} aria-hidden="true">{leadPage.mark}</i><span>{item.label}</span>
            </button>
            );
          })}
        </nav>
        {mobileCategoryOpen && createPortal(
          <button
            className="mobile-category-scrim"
            type="button"
            aria-label="Close category menu"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setMobileCategoryOpen(null);
            }}
          ><span aria-hidden="true" /></button>,
          document.body,
        )}
        {mobileCategoryOpen && (
          <section className="mobile-category-menu" aria-label={`${mobileCategoryOpen} pages`}>
            <header><div><small>EXPLORE</small><strong>{mobileCategoryOpen}</strong></div><button type="button" aria-label="Close category menu" onClick={() => setMobileCategoryOpen(null)}>×</button></header>
            <div>
              {visibleNav.filter((item) => item.group === mobileCategoryOpen).map((item) => (
                <button key={item.label} type="button" className={view === item.label ? "active" : ""} aria-current={view === item.label ? "page" : undefined} onClick={() => {
                  void nativeImpact();
                  if (item.label === "Matchups") setSelectedMatchupId(null);
                  if (item.label === "Scoreboard") setScoreboardScope("all");
                  if (item.label === "Waiver Wire") window.scrollTo({ top: 0, left: 0, behavior: "auto" });
                  setView(item.label);
                  setMobileCategoryOpen(null);
                }}>
                  <i className={`nav-badge ${item.tone}`} aria-hidden="true">{item.mark}</i><span><b>{item.displayLabel ?? item.label}</b><small>{glossaryDetails[item.label].use}</small></span>{eliteViews.has(item.label) && !entitlement.elite ? <em className="nav-elite-tag">ELITE</em> : proViews.has(item.label) && !entitlement.pro ? <em>PRO</em> : <strong aria-hidden="true">›</strong>}
                </button>
              ))}
            </div>
          </section>
        )}
        </div>

        {activeRivalryWeek && <button className="rivalry-week-banner" type="button" onClick={() => { setView("League Stories"); window.scrollTo({ top: 0, left: 0, behavior: "auto" }); }}><i aria-hidden="true">⚡</i><span><small>ELITE · WEEK {activeRivalryWeek.week}</small><strong>Rivalry Week: You vs {activeRivalryWeek.opponentName}</strong></span><em>Open report <b aria-hidden="true">→</b></em></button>}

        {view !== "Manage Leagues" && (
          <section className={`tool-context-bar ${view === "All Leagues" ? "home-context" : ""}`} aria-label="Current tool context">
            <button
              className="context-league-button"
              type="button"
              aria-label={`Switch league. Current league: ${leagueName}`}
              aria-expanded={leagueDrawerOpen}
              onClick={() => {
                void nativeImpact();
                setMobileCategoryOpen(null);
                setLeagueDrawerOpen(true);
              }}
            ><b>{leagueName}</b><small>League</small><i aria-hidden="true">‹</i></button>
            <span><b>{rankingContext?.scoring ?? "Scoring pending"}</b><small>Format</small></span>
            <span><b>{periodLabel}</b><small>Season</small></span>
          </section>
        )}

        {!leagueDrawerOpen && view !== "Manage Leagues" && visibleLeagues.length > 0 && createPortal(
          <button
            className={`league-edge-handle${leagueHandlePreviewing ? " previewing" : ""}`}
            type="button"
            aria-label="Swipe or tap to switch leagues"
            onClick={() => {
              void nativeImpact();
              setMobileCategoryOpen(null);
              setLeagueDrawerOpen(true);
            }}
          />,
          document.body,
        )}

        {leagueDrawerOpen && createPortal(
          <div className="league-drawer-layer" role="presentation">
            <button className="league-drawer-scrim" type="button" aria-label="Close league switcher" onClick={() => setLeagueDrawerOpen(false)} />
            <aside className="league-drawer" role="dialog" aria-modal="true" aria-label="Switch leagues" data-preserve-page-scroll>
              <header>
                <div><small>MY LEAGUES</small><strong>Choose your league</strong></div>
                <button type="button" aria-label="Close league switcher" onClick={() => setLeagueDrawerOpen(false)}>×</button>
              </header>
              <div className="league-drawer-list">
                {visibleLeagues.map((league) => (
                  <button
                    key={league.id}
                    type="button"
                    className={leagueId === league.id ? "active" : ""}
                    aria-current={leagueId === league.id ? "true" : undefined}
                    disabled={importState === "loading"}
                    onClick={() => {
                      setLeagueDrawerOpen(false);
                      void nativeImpact();
                      void openConnectedLeague(league);
                    }}
                  ><span><b>{league.name}</b><small>{league.season} · {league.teams} teams · {league.format} · {league.scoring}</small></span>{leagueId === league.id ? <em>ACTIVE</em> : <strong aria-hidden="true">›</strong>}</button>
                ))}
              </div>
              <button className="league-drawer-manage" type="button" onClick={() => { setLeagueDrawerOpen(false); setView("Manage Leagues"); window.scrollTo({ top: 0, left: 0, behavior: "auto" }); }}>Manage leagues</button>
            </aside>
          </div>,
          document.body,
        )}

        {accountError && view !== "Manage Leagues" && (
          <section className="app-status-banner" role="status">
            <span><b>Some data needs another pass.</b>{accountError}</span>
            <button type="button" onClick={() => { setAccountError(""); void loadLeagues(false).catch(() => setAccountError("League data is still unavailable. Your saved dashboard remains available.")); }}>Retry</button>
            <button type="button" className="dismiss" aria-label="Dismiss status message" onClick={() => setAccountError("")}>×</button>
          </section>
        )}

        {view !== "Manage Leagues" && visibleLeagues.length > 0 && (
          <section className="league-switcher">
            <div>
              <header>
                <span>MY LEAGUES</span>
                <button
                  className={`league-live-link ${liveMatchupCount === null ? "checking" : liveMatchupCount > 0 ? "live" : "idle"}`}
                  type="button"
                  aria-label={liveMatchupCount && liveMatchupCount > 0 ? `Open Fantasy Scoreboard, ${liveMatchupCount} matchups live` : "Open Fantasy Scoreboard, no matchups live"}
                  onClick={() => {
                    void nativeImpact();
                    setScoreboardScope("all");
                    setView("Scoreboard");
                    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
                  }}
                >
                  <i aria-hidden="true" />
                  <b>{liveMatchupCount === null ? "CHECKING" : liveMatchupCount > 0 ? `${liveMatchupCount} LIVE` : "NOT LIVE"}</b>
                  <small>SCOREBOARD →</small>
                </button>
              </header>
              <strong>{visibleLeagues.length} leagues shown</strong>
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
              {visibleLeagues.map((league) => (
                <button
                  key={league.id}
                  className={`${leagueId === league.id ? "active" : ""} ${draggedLeagueId === league.id ? "dragging" : ""} ${leagueDropTarget?.id === league.id && draggedLeagueId !== league.id ? `drop-${leagueDropTarget.position}` : ""}`}
                  draggable
                  onDragStart={(event) => {
                    leagueDragOccurred.current = true;
                    setDraggedLeagueId(league.id);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", league.id);
                    const dragPreview = event.currentTarget.cloneNode(true) as HTMLElement;
                    dragPreview.classList.add("league-drag-preview");
                    document.body.appendChild(dragPreview);
                    event.dataTransfer.setDragImage(dragPreview, dragPreview.offsetWidth / 2, dragPreview.offsetHeight / 2);
                    window.requestAnimationFrame(() => dragPreview.remove());
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
                    if (!leagueDragOccurred.current) {
                      void nativeImpact();
                      void openConnectedLeague(league);
                    }
                  }}
                  disabled={importState === "loading"}
                  title="Drag to reorder · Alt+Left/Right also moves this league"
                >
                  <i className="league-drag-handle" aria-hidden="true">⋮⋮</i>
                  <b title={league.name}>{league.name}</b>
                  <small title={`${league.season} · ${league.teams} teams · ${league.format} · ${league.scoring}`}>
                    {league.season} · {league.teams} teams · {league.format} ·{" "}
                    {league.scoring}
                  </small>
                  {leagueId === league.id && (
                    <em className={`league-refresh-state ${importState === "loading" ? "refreshing" : ""}`}>
                      {importState === "loading"
                        ? "Refreshing in background"
                        : leagueRefreshedAt
                          ? `Updated ${new Date(leagueRefreshedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                          : "Ready"}
                    </em>
                  )}
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
            <button
              className={`team-active-live ${liveMatchupCount === null ? "checking" : liveMatchupCount > 0 ? "live" : "idle"}`}
              type="button"
              aria-label={liveMatchupCount && liveMatchupCount > 0 ? `Open Fantasy Scoreboard, ${liveMatchupCount} matchups live` : "Open Fantasy Scoreboard, no matchups live"}
              onClick={() => {
                void nativeImpact();
                setScoreboardScope("all");
                setView("Scoreboard");
                window.scrollTo({ top: 0, left: 0, behavior: "auto" });
              }}
            ><i aria-hidden="true" /><span><b>{liveMatchupCount === null ? "CHECKING" : liveMatchupCount > 0 ? `${liveMatchupCount} LIVE` : "NOT LIVE"}</b><small>Open scoreboard</small></span><strong aria-hidden="true">›</strong></button>
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

        {view === "Command Center" && !entitlement.pro && <ProGate feature="Command Center" onUpgrade={() => setView("Fantasy Hub Pro")} />}
        {view === "Command Center" && entitlement.pro &&
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
              leagueTeams={leagueTeams}
              selectedTeamId={selectedTeamId}
            />
          ) : (
            rosterEmptyState
          ))}
        {view === "All Leagues" && (
          <AllLeagues
            leagues={visibleLeagues}
            cachedScans={portfolioScans}
            cachedScansSavedAt={portfolioScansSavedAt}
            isPro={entitlement.pro}
            onScansChange={updatePortfolioScans}
            onManage={() => setView("Manage Leagues")}
            onPersonalize={() => {
              setView("Theme Locker");
              window.scrollTo({ top: 0, left: 0, behavior: "auto" });
            }}
            onOpen={async (league, destination = "Command Center") => {
              await openConnectedLeague(league);
              if (destination === "Scoreboard") setScoreboardScope("league");
              setView(destination);
            }}
          />
        )}
        {view === "League Stories" && !entitlement.elite && <ProGate feature="League Stories" tier="Elite" onUpgrade={() => setView("Fantasy Hub Pro")} />}
        {view === "League Stories" && entitlement.elite && (
          <LeagueStories
            key={leagueId || "no-league"}
            leagueId={leagueId}
            setView={setView}
          />
        )}
        {view === "Manager Report" && !entitlement.elite && <ProGate feature="Manager Report Card" tier="Elite" onUpgrade={() => setView("Fantasy Hub Pro")} />}
        {view === "Manager Report" && entitlement.elite && <ManagerReport key={leagueId || "no-league"} leagueId={leagueId} />}
        {view === "Scoreboard" && (
          scoreboardScope === "all" ? (
            <AllLeagueScoreboard
              leagues={visibleLeagues}
              defaultWeek={defaultGameWeek}
              onOpenLeague={async (league) => {
                await openConnectedLeague(league);
                setScoreboardScope("league");
              }}
              onOpenMatchups={async (league, matchupId) => {
                await openConnectedLeague(league);
                setSelectedMatchupId(matchupId);
                setView("Matchups");
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
        {view === "Game Day Live" && (
          <NflGames
            key={`${leagueId}-${defaultGameWeek}`}
            leagueId={leagueId}
            season={selectedConnectedLeague?.season ?? leagueSeason}
            defaultWeek={defaultGameWeek}
            players={players}
          />
        )}
        {view === "News & Notes" && <NewsAndNotes onOpenPlayer={(player) => setSelectedPlayer(playerShell(player))} />}
        {view === "League Analytics" && !entitlement.pro && <ProGate feature="League Analytics" onUpgrade={() => setView("Fantasy Hub Pro")} />}
        {view === "League Analytics" && entitlement.pro &&
          (rosterReady ? (
            <LeagueAnalytics
              players={players}
              teams={leagueTeams}
              selectedTeamId={selectedTeamId}
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
              leagueId={leagueId}
              week={defaultGameWeek}
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
            isPro={entitlement.pro}
            week={defaultGameWeek}
            onUpgrade={() => setView("Fantasy Hub Pro")}
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
        {view === "Draft HQ" && !draftStylesReady && (
          <section className="draft-hq-style-loader panel" aria-live="polite">
            <span>DRAFT HQ</span>
            <strong>Setting your draft room…</strong>
            <p>Loading the board, player pool, roster settings, and theme.</p>
            <div className="load-progress indeterminate" role="progressbar" aria-label="Loading Draft HQ"><span /></div>
          </section>
        )}
        {view === "Draft HQ" && draftStylesReady && (
          <DraftDashboard
            key={`${leagueId}:${rankingContext?.teams ?? 0}:${rankingContext?.rosterSlots.join(",") ?? ""}:${selectedTeamId}`}
            players={leagueRankings}
            leagueContext={rankingContext}
            draftSlot={selectedTeamId}
            isPro={entitlement.pro}
            isElite={entitlement.elite}
            onUpgrade={() => setView("Fantasy Hub Pro")}
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
              isPro={entitlement.pro}
              onUpgrade={() => setView("Fantasy Hub Pro")}
            />
          ) : (
            rosterEmptyState
          ))}
        {view === "Waiver Wire" && (
          <WaiverWire
            key={leagueId || "no-league"}
            players={waiverPlayers}
            trending={waiverTrending}
            roster={players}
            leagueSelected={Boolean(leagueId)}
            leagueStatus={leagueStatus}
            context={rankingContext}
            setSelectedPlayer={setSelectedPlayer}
          />
        )}
        {view === "Trade Lab" && (
          <TradeLab
            key={`${leagueId}-${selectedTeamId}`}
            teams={leagueTeams}
            selectedTeamId={selectedTeamId}
            rankings={leagueRankings}
            context={rankingContext}
            isPro={entitlement.pro}
            onUpgrade={() => setView("Fantasy Hub Pro")}
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
        {view === "Simulator" && !entitlement.pro && <ProGate feature="Season Simulator" onUpgrade={() => setView("Fantasy Hub Pro")} />}
        {view === "Simulator" && entitlement.pro &&
          (rosterReady ? (
            <Simulator
              key={`${leagueId}-${selectedTeamId}`}
              leagueId={leagueId}
              teams={leagueTeams}
              selectedTeamId={selectedTeamId}
              context={rankingContext}
            />
          ) : (
            rosterEmptyState
          ))}
        {view === "Glossary" && <Glossary onNavigate={setView} />}
        {view === "Theme Locker" && (
          <ThemeStore
            teamTheme={effectiveTeamTheme}
            onTeamThemeChange={(value) => { setTeamTheme(value); void saveAccountPreferences({ teamTheme: value }); }}
            badgeTheme={effectiveBadgeTheme}
            onBadgeThemeChange={(value) => { setBadgeTheme(value); void saveAccountPreferences({ badgeTheme: value }); }}
            isPro={entitlement.pro}
            isElite={entitlement.elite}
            isOwner={entitlement.owner}
            ownedTeamThemes={ownedTeamThemes}
            ownedBadgeThemes={ownedBadgeThemes}
            onPurchaseConfirmed={(themeId, badgeId) => {
              setOwnedTeamThemes((current) => current.includes(themeId) ? current : [...current, themeId]);
              setOwnedBadgeThemes((current) => current.includes(badgeId) ? current : [...current, badgeId]);
            }}
            onUpgrade={() => setView("Fantasy Hub Pro")}
          />
        )}
        {view === "Manage Leagues" && (
          <ManageLeagues
            connectedLeagues={availableLeagues}
            hiddenLeagueIds={hiddenLeagueIds}
            managedLeagues={managedLeagues}
            accountError={accountError}
            onOpen={async (league) => {
              setView("Command Center");
              await openConnectedLeague(league);
            }}
            onAdd={addManagedLeague}
            onRemove={removeManagedLeague}
            onRefresh={async () => {
              await Promise.all([loadManagedLeagues(), loadLeagues(false, true)]);
            }}
            onMove={moveConnectedLeague}
            onReorder={reorderConnectedLeague}
            onToggleVisibility={toggleLeagueVisibility}
          />
        )}
        {view === "Fantasy Hub Pro" && <ProPlans entitlement={entitlement} />}
        {view === "My Account" && <AccessAccount accountUser={accountUser} entitlement={entitlement} onPlans={() => setView("Fantasy Hub Pro")} />}
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

function Glossary({ onNavigate }: { onNavigate: (view: View) => void }) {
  const categories = mobileCategoryNav.map((category) => ({
    ...category,
    leadPage: nav.find((item) => item.label === category.lead)!,
    pages: nav.filter((item) => item.group === category.group),
  }));
  return (
    <div className="page-content glossary-page">
      <SectionIntro
        compact
        kicker="FANTASY HUB GUIDE"
        title="Know where to go—and why"
        text="Every page has a distinct job. Browse by purpose, then jump directly into the tool you need."
      />
      <nav className="glossary-jump" aria-label="Glossary sections">
        {categories.map((category) => (
          <a key={category.group} href={`#glossary-${category.group.toLowerCase().replaceAll(" ", "-")}`}>
            <i className={`nav-badge ${category.leadPage.tone}`} aria-hidden="true">{category.leadPage.mark}</i>
            <span>{category.label}</span>
          </a>
        ))}
      </nav>
      <div className="glossary-groups">
        {categories.map((category) => (
          <section className="panel glossary-group" id={`glossary-${category.group.toLowerCase().replaceAll(" ", "-")}`} key={category.group}>
            <header><div><i className={`nav-badge ${category.leadPage.tone}`} aria-hidden="true">{category.leadPage.mark}</i><span>{category.label.toUpperCase()}</span></div><small>{category.pages.length} {category.pages.length === 1 ? "page" : "pages"}</small></header>
            <div className="glossary-grid">
              {category.pages.map((item) => {
                const details = glossaryDetails[item.label];
                return (
                  <button type="button" className="glossary-card" key={item.label} onClick={() => onNavigate(item.label)}>
                    <i className={`nav-badge ${item.tone}`} aria-hidden="true">{item.mark}</i>
                    <span><strong>{item.displayLabel ?? item.label}</strong><small>{item.displayLabel ? `Fantasy Hub page: ${item.label}` : "Fantasy Hub page"}</small></span>
                    <p>{details.summary}</p>
                    <em><b>BEST TIME TO USE IT</b>{details.use}</em>
                    <u>Open page →</u>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <section className="panel glossary-definition">
        <span>TRADE LAB TERM</span>
        <h3>Value adjustment</h3>
        <p>An uneven multi-asset trade is more than the sum of its individual values. Fantasy Hub adds a consolidation premium to the side receiving fewer assets based on the best asset&apos;s quality, package concentration, extra roster spots required, and the connected league&apos;s depth. This prevents several lesser pieces from automatically equaling one elite player simply because their raw values reach the same total.</p>
      </section>
    </div>
  );
}

function AccountOnboarding({ displayName, colorMode, teamTheme, badgeTheme, isPro, onColorMode, onTeamTheme, onBadgeTheme, onComplete }: { displayName: string; colorMode: Theme; teamTheme: string; badgeTheme: BadgeTheme; isPro: boolean; onColorMode: (value: Theme) => void; onTeamTheme: (value: string) => void; onBadgeTheme: (value: BadgeTheme) => void; onComplete: () => void }) {
  return <main className="onboarding-shell">
    <section className="onboarding-card">
      <header><span>WELCOME TO FANTASY HUB</span><h1>Make it yours, {displayName.split(" ")[0]}.</h1><p>Your leagues and preferences will follow your account across devices. Choose a starting look—you can change it anytime.</p></header>
      <div className="onboarding-modes"><button className={colorMode === "light" ? "active" : ""} onClick={() => onColorMode("light")}><b>☀</b><span>Light mode</span></button><button className={colorMode === "dark" ? "active" : ""} onClick={() => onColorMode("dark")}><b>☾</b><span>Dark mode</span></button></div>
      {isPro ? <><div className="onboarding-section"><div><span>TEAM THEME</span><strong>Choose your colors</strong></div><div className="onboarding-team-grid">{nflThemes.map((team) => <button key={team.id} className={teamTheme === team.id ? "active" : ""} title={team.name} aria-label={team.name} aria-pressed={teamTheme === team.id} onClick={() => onTeamTheme(team.id)}><i style={{ background: `linear-gradient(135deg,${team.primary} 0 50%,${team.secondary} 50%)` }} /><b>{team.shortCode ?? team.id}</b></button>)}</div></div><div className="onboarding-section"><div><span>SIDEBAR STYLE</span><strong>Pick a badge pack</strong></div><div className="onboarding-badges">{([['arcade','Arcade','★ ⚡ ↔'],['team','Team Colors','♟ + ◈'],['neon','Neon Night','◆ 🏈 ♛'],['minimal','Minimal','✓ ◎ ⌁']] as [BadgeTheme,string,string][]).map(([id,name,icons]) => <button key={id} className={badgeTheme === id ? "active" : ""} onClick={() => onBadgeTheme(id)}><b>{icons}</b><span>{name}</span></button>)}</div></div></> : <div className="onboarding-pro-note"><span>FANTASY HUB PRO</span><strong>Team-inspired themes and badge packs unlock with Pro.</strong><p>Light and dark mode remain available to everyone. You can preview every Pro look after entering the Hub.</p></div>}
      <footer><small>You’ll connect Sleeper or ESPN after setup. The first successful sync is saved to this account.</small><button onClick={onComplete}>Enter Fantasy Hub →</button></footer>
    </section>
  </main>;
}

function SignInScreen() {
  const nativeIos = isNativeIosApp();
  const [currentNflWeek, setCurrentNflWeek] = useState<number | null>(null);
  const signInHref = nativeIos ? "/native-sign-in" : "/sign-in";
  const signUpHref = nativeIos ? "/sign-up?native=ios" : "/sign-up";
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/nfl-schedule", { signal: controller.signal })
      .then(async (response) => response.ok ? await response.json() as { currentWeek?: number } : null)
      .then((schedule) => {
        if (schedule?.currentWeek) setCurrentNflWeek(schedule.currentWeek);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  return (
    <main className="auth-landing">
      <div className="auth-landing-sky" aria-hidden="true">
        <i /><i /><i /><i />
      </div>
      <div className="auth-landing-grid" aria-hidden="true" />

      <header className="auth-landing-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/marketing/app-store/fh-blue-app-mark.png" alt="Fantasy Hub" />
        <div><strong>FANTASY</strong><b>HUB</b></div>
      </header>

      <section className="auth-landing-hero">
        <div className="auth-live-pill"><i /> SUNDAY PULSE · LIVE MATCHUP INTELLIGENCE</div>
        <h1>Run your league.<br /><em>Own the week.</em></h1>
        <p>Every matchup, move, and decision in one command center.</p>

        <div className="auth-matchup-stage" aria-hidden="true">
          <div className="auth-player-card auth-player-card-left"><span>W</span><b>WIN PROB.</b><strong>67%</strong></div>
          <div className="auth-field-ball">
            <div className="auth-football"><i /><span /><span /><span /><span /></div>
            <b>{currentNflWeek ? `WEEK ${currentNflWeek}` : "CURRENT WEEK"}</b>
          </div>
          <div className="auth-player-card auth-player-card-right"><span>F</span><b>PROJECTED</b><strong>124.8</strong></div>
          <div className="auth-score-pulse"><span>YOUR TEAM</span><b>98.4</b><i>LIVE</i><b>91.2</b><span>RIVAL</span></div>
        </div>
      </section>

      <section className="auth-landing-actions">
        <Link className="auth-landing-login" href={signInHref}>Log in</Link>
        <Link className="auth-landing-signup" href={signUpHref}>Create account</Link>
      </section>

      <p className="auth-league-sync"><b>SLEEPER + ESPN</b><span>Sync every league into one home.</span></p>

      <div className="auth-feature-ticker" aria-hidden="true">
        <span>LINEUP INTEL</span><i>◆</i><span>TRADE LAB</span><i>◆</i><span>LIVE SCORES</span><i>◆</i><span>WAIVER WIRE</span>
      </div>
    </main>
  );
}

function AccountLoading() {
  return <LaunchSplash />;
}

function EmptyRoster({
  leagueSelected,
  loading,
  leagueName,
  teams,
  teamSelected,
  leagueStatus,
}: {
  leagueSelected: boolean;
  loading: boolean;
  leagueName: string;
  teams: LeagueTeam[];
  teamSelected: boolean;
  leagueStatus: string;
}) {
  const hasDraftedRoster = teams.some((team) => team.roster.length > 0);
  const needsTeamSelection = leagueSelected && !teamSelected && hasDraftedRoster;
  const isUndrafted = leagueSelected && !hasDraftedRoster && leagueStatus === "pre_draft";
  const title = loading
    ? `Opening ${leagueName}`
    : needsTeamSelection
      ? "Choose your fantasy team"
      : isUndrafted
      ? `${leagueName} has not drafted yet`
      : leagueSelected
        ? `${leagueName} roster is unavailable`
        : "Choose a league to begin";
  const text = loading
    ? "Fantasy Hub is loading this league’s settings and roster."
    : needsTeamSelection
      ? "The league is drafted. Select your team above once and Fantasy Hub will remember it for this league."
      : isUndrafted
      ? "This league is connected, but your roster is currently empty. Fantasy Hub will populate these tools after the draft appears in the league data."
      : leagueSelected
        ? "Fantasy Hub found the league, but no roster data is currently available from the provider."
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
          : needsTeamSelection
            ? "Use the Fantasy team menu above to identify your roster."
            : leagueSelected
            ? "No players have been assigned to your roster."
            : "No league selected."}
      </section>
    </div>
  );
}

function ProGate({ feature, tier = "Pro", onUpgrade }: { feature: string; tier?: "Pro" | "Elite"; onUpgrade: () => void }) {
  const elite = tier === "Elite";
  return <div className="page-content pro-gate-page"><section className={`pro-gate panel ${elite ? "elite-gate" : ""}`}><span>FANTASY HUB {tier.toUpperCase()}</span><div className="pro-lock"><FHLogo label="Fantasy Hub" /></div><h2>{feature} is an {elite ? "Elite" : "Pro"} experience.</h2><p>{elite ? "Elite adds deeper decision intelligence, League Stories, complete manager accountability, premium draft analysis, every theme, and every future Fantasy Hub tool as it arrives." : "Your leagues, rosters, live scores, matchups, rankings, waiver pool, and Start/Sit tools remain free. Pro unlocks Fantasy Hub’s proprietary simulations, advanced analysis, decision memory, and trade intelligence."}</p><button onClick={onUpgrade}>Explore Fantasy Hub {tier} →</button><small>Platform connection is not what you pay for. Membership is built around Fantasy Hub’s original models, tools, and experience.</small></section></div>;
}

function AccessAccount({ accountUser, entitlement, onPlans }: { accountUser: AccountUser; entitlement: AccountEntitlement; onPlans: () => void }) {
  const nativeIos = useSyncExternalStore(() => () => undefined, isNativeIosApp, () => false);
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingError, setBillingError] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushPreferences, setPushPreferences] = useState<PushPreferences>(DEFAULT_PUSH_PREFERENCES);
  const [pushMessage, setPushMessage] = useState("");
  const [vibrationsEnabled, setVibrationsEnabled] = useState(() => nativeHapticsEnabled());
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const billingProvider = entitlement.provider;
  const recurringBilling = billingProvider === "stripe" || billingProvider === "apple" || billingProvider === "app_store";

  useEffect(() => {
    if (!nativeIos) return;
    void fetch("/api/account/push").then((response) => response.ok ? response.json() : null).then((data: { enabled?: boolean; preferences?: PushPreferences } | null) => {
      setPushEnabled(Boolean(data?.enabled));
      if (data?.preferences) setPushPreferences(data.preferences);
    }).catch(() => undefined);
  }, [nativeIos]);

  function toggleVibrations() {
    const next = !vibrationsEnabled;
    setNativeHapticsEnabled(next);
    setVibrationsEnabled(next);
    if (next) void nativeImpact("medium");
  }

  async function updatePushPreference(key: PushAlertKey) {
    const previous = pushPreferences;
    const next = { ...previous, [key]: !previous[key] };
    setPushPreferences(next);
    setPushBusy(true);
    setPushMessage("");
    try {
      const response = await fetch("/api/account/push", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preferences: next }) });
      const data = await response.json() as { error?: string; preferences?: PushPreferences };
      if (!response.ok) throw new Error(data.error ?? "Unable to save notification preferences");
      if (data.preferences) setPushPreferences(data.preferences);
      setPushMessage("Notification preferences saved.");
    } catch (requestError) {
      setPushPreferences(previous);
      setPushMessage(requestError instanceof Error ? requestError.message : "Unable to save notification preferences");
    } finally {
      setPushBusy(false);
    }
  }

  async function togglePush() {
    setPushBusy(true);
    setPushMessage("");
    try {
      if (pushEnabled) await disableNativePushNotifications();
      else await enableNativePushNotifications();
      setPushEnabled(!pushEnabled);
      setPushMessage(pushEnabled ? "Fantasy Hub notifications are off on this device." : "Fantasy Hub notifications are ready on this device.");
    } catch (requestError) {
      setPushMessage(requestError instanceof Error ? requestError.message : "Unable to update notifications");
    } finally {
      setPushBusy(false);
    }
  }

  async function openSubscriptionManagement() {
    setBillingBusy(true);
    setBillingError("");
    try {
      if (nativeIos && (billingProvider === "apple" || billingProvider === "app_store")) {
        await nativeManageSubscriptions();
        return;
      }
      if (billingProvider === "apple" || billingProvider === "app_store") {
        throw new Error("Apple subscriptions must be managed from Settings → Apple Account → Subscriptions on an Apple device.");
      }
      const response = await fetch("/api/billing/portal", { method: "POST" });
      const data = await response.json() as { url?: string; error?: string };
      if (!response.ok || !data.url) throw new Error(data.error ?? "Billing management is temporarily unavailable");
      window.location.assign(data.url);
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : "Billing management is temporarily unavailable");
    } finally {
      setBillingBusy(false);
    }
  }

  async function restoreAppStorePurchases() {
    setBillingBusy(true);
    setBillingError("");
    try {
      await nativeRestorePurchases();
      window.location.reload();
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : "Purchases could not be restored");
    } finally {
      setBillingBusy(false);
    }
  }

  async function deleteAccount() {
    if (deleteConfirmation !== "DELETE") return;
    setDeletingAccount(true);
    setDeleteError("");
    try {
      const response = await fetch("/api/v1/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: deleteConfirmation }),
      });
      const data = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message ?? "Unable to delete account");
      window.location.assign(accountUser.signOutPath);
    } catch (requestError) {
      setDeleteError(requestError instanceof Error ? requestError.message : "Unable to delete account");
      setDeletingAccount(false);
    }
  }

  return <div className="page-content access-account-page">
    <section className="access-account-hero">
      <span>MY ACCOUNT</span><h2>Your Fantasy Hub identity.</h2><p>Account information, membership, notifications, billing, and secure access controls in one place.</p>
    </section>
    {nativeIos && <section className="native-notifications panel">
      <header><div><span>NOTIFICATION PREFERENCES</span><h3>Choose what deserves an alert</h3><p>Alerts are grouped by matchup and tied only to leagues saved on this account. Big-play alerts trigger at 5 or more fantasy points.</p></div><button type="button" disabled={pushBusy} aria-pressed={pushEnabled} onClick={() => void togglePush()}>{pushBusy ? "Updating…" : pushEnabled ? "Turn notifications off" : "Enable notifications"}</button></header>
      {pushEnabled && <details className="notification-options">
        <summary><span><strong>Optional notification types</strong><small>{Object.values(pushPreferences).filter(Boolean).length} of {Object.keys(pushPreferences).length} enabled</small></span><b aria-hidden="true">⌄</b></summary>
        <div className="notification-types">{([
        ["kickoffSoon", "15 minutes to kickoff", "A player in your lineup or your opponent’s lineup is about to lock."],
        ["slateStarted", "Pro football slate started", "One concise alert when a game window containing relevant players begins."],
        ["bigPlays", "Big plays · 5+ points", "Real play context, fantasy points, league, and estimated matchup impact."],
        ["matchupResults", "Matchup won or lost", "A final result once the fantasy matchup outcome is confirmed."],
        ["closeGame", "Close matchup", "Your matchup is within 5 points or its live win probability enters the 40–60% range late in the slate."],
        ["pathToVictory", "Path to victory", "A late-game update showing the player, points, or stat line you still need to win."],
        ["weatherRisk", "Inclement weather", "Actionable wind, precipitation, temperature, or delay risk before a relevant player’s kickoff."],
        ["lineupUrgency", "Lineup needs attention", "Empty slots, inactive starters, or a relevant game nearing lock."],
        ["injuryStatus", "Important injury changes", "New inactive or major status changes affecting starters."],
      ] as [PushAlertKey, string, string][]).map(([key, title, detail]) => <button type="button" key={key} className={pushPreferences[key] ? "enabled" : ""} aria-pressed={pushPreferences[key]} disabled={pushBusy} onClick={() => void updatePushPreference(key)}><i aria-hidden="true">{pushPreferences[key] ? "✓" : ""}</i><span><strong>{title}</strong><small>{detail}</small></span></button>)}</div>
      </details>}
      {pushMessage && <p className="notification-message" role="status">{pushMessage}</p>}
    </section>}
    {nativeIos && <section className="device-feedback panel">
      <div><span>DEVICE FEEDBACK</span><h3>Vibrations</h3><p>Use subtle haptic feedback when navigating, opening trays, and selecting Fantasy Hub controls.</p></div>
      <button type="button" role="switch" aria-checked={vibrationsEnabled} className={vibrationsEnabled ? "enabled" : ""} onClick={toggleVibrations}><i aria-hidden="true" /><span>{vibrationsEnabled ? "On" : "Off"}</span></button>
    </section>}
    <section className="account-settings-grid">
      <article className="panel account-profile-card"><header><span>{accountUser.displayName.slice(0,1).toUpperCase()}</span><div><small>ACCOUNT PROFILE</small><h3>{accountUser.displayName}</h3><p>{accountUser.email}</p></div></header><dl><div><dt>Sign-in provider</dt><dd>{accountUser.provider === "clerk" ? "Fantasy Hub account" : "ChatGPT"}</dd></div><div><dt>Membership</dt><dd>{entitlement.elite ? "Fantasy Hub Elite" : entitlement.pro ? "Fantasy Hub Pro" : "Fantasy Hub Free"}</dd></div></dl><p className="account-edit-note">Name, email, password, and connected sign-in methods are securely managed by your authentication provider.</p></article>
      <article className="panel account-plan-card"><header><div><small>MEMBERSHIP & BILLING</small><h3>{entitlement.elite ? "Elite is active" : entitlement.pro ? "Pro is active" : "Free plan"}</h3></div><b className={entitlement.pro ? "active" : "free"}>{entitlement.elite ? "ELITE" : entitlement.pro ? "PRO" : "FREE"}</b></header><p>{entitlement.pro ? recurringBilling ? `Your membership is billed through ${billingProvider === "stripe" ? "Fantasy Hub billing" : "the App Store"}.` : `Your account has ${entitlement.elite ? "Elite" : "Pro"} access without a recurring subscription.` : "Upgrade for advanced intelligence, simulations, stories, and customization."}</p><div className="account-plan-actions"><button onClick={onPlans}>{entitlement.pro ? "View plan benefits" : "Explore plans"}</button>{entitlement.pro && recurringBilling && <button disabled={billingBusy} onClick={() => void openSubscriptionManagement()}>{billingBusy ? "Opening…" : "Manage billing"}</button>}</div>{nativeIos && <button className="restore-purchases-link" type="button" disabled={billingBusy} onClick={() => void restoreAppStorePurchases()}>{billingBusy ? "Checking purchases…" : "Restore App Store purchases"}</button>}{billingError && <p className="billing-error" role="alert">{billingError}</p>}</article>
    </section>
    {entitlement.pro && recurringBilling && <section className="panel account-cancel-card"><div><span>SUBSCRIPTION CONTROL</span><h3>Cancel subscription</h3><p>Cancellation stops automatic renewal. Pro access normally remains available through the end of the paid or trial period shown by your billing provider.</p></div>{!confirmCancel ? <button onClick={() => setConfirmCancel(true)}>Review cancellation</button> : <div className="cancel-confirm"><strong>Are you sure you want to continue to subscription cancellation?</strong><small>You will leave Fantasy Hub to confirm the cancellation with {billingProvider === "stripe" ? "our secure billing portal" : "Apple"}. Your subscription is not canceled until you finish there.</small><div><button onClick={() => setConfirmCancel(false)}>Keep subscription</button><button className="danger" disabled={billingBusy} onClick={() => void openSubscriptionManagement()}>{billingBusy ? "Opening…" : "Continue to cancel"}</button></div></div>}</section>}
    <section className="panel account-security-card"><div><span>SECURE ACCESS</span><h3>Sign out of Fantasy Hub</h3><p>End this session on the current device. Your connected leagues and saved account preferences remain available the next time you sign in.</p><nav className="account-legal-links" aria-label="Legal information"><a href="/privacy">Privacy Policy</a><a href="/terms">Terms of Use</a></nav></div><a href={accountUser.signOutPath}>Sign out</a></section>
    <section className="account-danger-zone panel">
      <div>
        <span>ACCOUNT &amp; PRIVACY</span>
        <h3>Delete Fantasy Hub account</h3>
        <p>Permanently removes saved connections, league snapshots, preferences, narratives, and decision history. This does not delete your Sleeper or ESPN account.</p>
      </div>
      <label>
        Type DELETE to confirm
        <input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} autoComplete="off" aria-describedby="delete-account-error" />
      </label>
      <button type="button" disabled={deleteConfirmation !== "DELETE" || deletingAccount} onClick={() => void deleteAccount()}>
        {deletingAccount ? "Deleting…" : "Delete account"}
      </button>
      {deleteError && <p id="delete-account-error" className="billing-error" role="alert">{deleteError}</p>}
      <nav className="account-legal-links" aria-label="Legal information"><a href="/privacy">Review Privacy Policy</a><a href="/terms">Review Terms of Use</a></nav>
    </section>
  </div>;
}

function ProPlans({ entitlement }: { entitlement: AccountEntitlement }) {
  type BillingPlan = "monthly" | "season" | "annual" | "elite_monthly" | "elite_season" | "elite_annual";
  const nativeIos = useSyncExternalStore(
    () => () => undefined,
    isNativeIosApp,
    () => false,
  );
  const [billingBusy, setBillingBusy] = useState<BillingPlan | "portal" | "">("");
  const [billingError, setBillingError] = useState("");
  const [pendingPlan, setPendingPlan] = useState<BillingPlan | "">("");
  const [nativePrices, setNativePrices] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!nativeIos) return;
    void nativeStoreProducts().then((products) => setNativePrices(Object.fromEntries(products.map((product) => [product.id, product.displayPrice])))).catch(() => undefined);
  }, [nativeIos]);
  useEffect(() => {
    if (!nativeIos || !pendingPlan) return;
    let checking = false;
    const checkPendingPurchase = async () => {
      if (checking) return;
      checking = true;
      try {
        if (await nativeRefreshPurchases()) window.location.reload();
      } catch {
        // Keep the pending state visible while StoreKit finishes processing.
      } finally {
        checking = false;
      }
    };
    const timer = window.setInterval(() => void checkPendingPurchase(), 5_000);
    const refreshOnFocus = () => {
      if (document.visibilityState === "visible") void checkPendingPurchase();
    };
    document.addEventListener("visibilitychange", refreshOnFocus);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshOnFocus);
    };
  }, [nativeIos, pendingPlan]);
  async function openBilling(path: "/api/billing/checkout" | "/api/billing/portal", plan?: BillingPlan) {
    if (nativeIos) {
      setBillingBusy(plan ?? "portal");
      setBillingError("");
      try {
        if (!plan) await nativeManageSubscriptions();
        else {
          const productId = plan.startsWith("elite_")
            ? `com.fantasyhubapp.elite.${plan.replace("elite_", "")}`
            : `com.fantasyhubapp.pro.${plan}`;
          const status = await nativePurchase(productId);
          if (status === "active") window.location.reload();
          else if (status === "pending") {
            setPendingPlan(plan);
            setBillingError("Your purchase is pending App Store approval. Other plans are locked while Apple finishes processing.");
          } else if (status === "cancelled") {
            setBillingError("App Store purchase was cancelled.");
          } else if (status === "inactive") {
            setBillingError("No active subscription was created yet. Complete the Apple confirmation to continue.");
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "App Store billing is temporarily unavailable";
        if (
          /already (?:have|have.*an active|hold).*subscription|already subscribed|already active|already purchased/i.test(message)
        ) {
          try {
            const isActive = await nativeRefreshPurchases();
            if (isActive) {
              setBillingError("This Apple ID already has an active subscription. Reloading your membership.");
              window.location.reload();
            } else {
              setBillingError("This Apple ID already has a subscription record, but we could not confirm it yet.");
            }
          } catch {
            setBillingError("This Apple ID already has an active subscription. Reload the app to refresh your membership.");
          }
        } else {
          setBillingError(message);
        }
      } finally {
        setBillingBusy("");
      }
      return;
    }
    setBillingBusy(plan ?? "portal");
    setBillingError("");
    try {
      const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: plan ? JSON.stringify({ plan }) : undefined });
      const data = await response.json() as { url?: string; error?: string };
      if (!response.ok || !data.url) throw new Error(data.error ?? "Billing is temporarily unavailable");
      window.location.assign(data.url);
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : "Billing is temporarily unavailable");
      setBillingBusy("");
    }
  }
  const freeFeatures = [
    "Unlimited Sleeper and ESPN league connections",
    "Mission Hub portfolio overview with prioritized actions across leagues",
    "Fantasy Scoreboard, Fantasy Matchups, Game Day Live, and Sunday Pulse",
    "My Team roster view with projections, player health, weather, and opponent strength",
    "Core Start/Sit recommendations, Waiver Wire tools, and the manual Trade Lab calculator",
    "Player Rankings, Team Rankings, blended ADP, and Draft HQ mocks with adjustable teams and draft slot",
    "League management, account controls, light and dark mode, and the Fantasy Hub glossary",
  ];
  const proFeatures = [
    "Everything included in Free",
    "Command Center planning with roster readiness, alerts, injuries, weather, and weekly priorities",
    "Advanced Start/Sit controls with floor-to-ceiling strategy and saved decision memory",
    "Advanced Trade Lab scans, partner fit, negotiation profiles, suggested packages, and acceptance estimates",
    "Season Simulator playoff odds, roster-move scenarios, injuries, and outcome drivers",
    "League Analytics for positional strength, dynasty windows, roster construction, and competitive outlook",
    "Custom Draft HQ format, scoring, roster size, Superflex settings, and player-board options",
    "Weekly ranking intelligence with projections, ceilings, matchup strength, and weather context",
    "The complete Team-Inspired Theme Collection and all 16 original Fantasy Hub badge packs",
  ];
  const eliteFeatures = [
    "Everything included in Pro",
    "League Stories with rivalry reports, weekly narratives, manager moments, and live win-path history",
    "Manager Reports with decision ledgers, accountability trends, waiver and trade efficiency, and shareable grades",
    "Elite Pick Intelligence using roster need, scarcity, scoring, ADP value, format, and next-pick availability",
    "Sharper CPU draft personalities, competitive behavior, and format-aware QB and Superflex strategy",
    "Draft grades, roster-construction review, value reports, and next-mock recommendations",
    "Every current and future premium Fantasy Hub theme and matching badge release",
    "Automatic access to future Elite tools and premium intelligence as they launch",
  ];
  const appStorePrice = (tier: "pro" | "elite", plan: "monthly" | "season" | "annual", webPrice: string) =>
    nativeIos ? nativePrices[`com.fantasyhubapp.${tier}.${plan}`] ?? webPrice : webPrice;
  const monthlyPrice = appStorePrice("pro", "monthly", "$4.99");
  const seasonPrice = appStorePrice("pro", "season", "$24.99");
  const annualPrice = appStorePrice("pro", "annual", "$39.99");
  const eliteMonthlyPrice = "$7.99";
  const eliteSeasonPrice = "$34.99";
  const eliteAnnualPrice = "$59.99";
  const billingProvider = entitlement.provider;
  const canManageBilling = entitlement.pro && (nativeIos ? billingProvider === "apple" : billingProvider === "stripe");
  const purchaseButton = (plan: "monthly" | "season" | "annual", label: string) => entitlement.pro
    ? <strong>PRO IS ACTIVE</strong>
    : <button disabled={Boolean(billingBusy || pendingPlan)} onClick={() => void openBilling("/api/billing/checkout", plan)}>{pendingPlan ? (pendingPlan === plan ? "Purchase pending…" : "Another purchase is pending") : billingBusy === plan ? "Opening secure checkout…" : label}</button>;
  const elitePurchaseButton = (plan: "elite_monthly" | "elite_season" | "elite_annual", label: string) => entitlement.elite
    ? <strong>ELITE IS ACTIVE</strong>
    : <button disabled={Boolean(billingBusy)} onClick={() => void openBilling("/api/billing/checkout", plan)}>{billingBusy === plan ? "Opening secure checkout…" : entitlement.pro ? `Upgrade · ${label}` : label}</button>;
  return <div className="page-content pro-plans-page">
    <section className="pro-plans-hero"><div className="pro-hero-copy"><span>FANTASY HUB PLANS</span><h2>Turn every league into<br/><em>a better Sunday.</em></h2><p>Live game-day energy meets original strategy tools, simulations, storytelling, and accountability—built around every team you manage.</p><div className="pro-hero-pills"><b>∞ LEAGUES</b><b>LIVE GAME DAY</b><b>SMARTER DECISIONS</b></div></div><div className="pro-hero-mark"><FHLogo label="Fantasy Hub plans"/><strong>PRO</strong></div><b className="pro-status-badge">{entitlement.pro ? "PRO ACTIVE" : `7 DAYS FREE · THEN ${monthlyPrice}/MO`}</b>{canManageBilling && <button className="billing-manage" disabled={billingBusy === "portal"} onClick={() => void openBilling("/api/billing/portal")}>{billingBusy === "portal" ? "Opening billing…" : nativeIos ? "Manage in App Store" : "Manage billing"}</button>}{entitlement.pro && billingProvider === "manual" && <p className="billing-access-note">Owner access is active. There is no recurring subscription or billing account to manage.</p>}{entitlement.pro && billingProvider === "apple" && !nativeIos && <p className="billing-access-note">This membership is billed through Apple. Manage it from Subscriptions on your Apple device.</p>}</section>
    <section className="pro-theme-gallery panel"><header><div><span>THEME LOCKER</span><h3>Your leagues. Your Sunday look.</h3></div><p>Pro includes every current team-inspired palette and icon pack.</p></header><div>{[{name:"Midway Night",colors:["#0b162a","#c83803"]},{name:"South Beach",colors:["#008e97","#fc4c02"]},{name:"Purple Reign",colors:["#241773","#9e7c0c"]},{name:"Gold Rush",colors:["#aa0000","#b3995d"]}].map((theme) => <article key={theme.name} style={{"--preview-primary":theme.colors[0],"--preview-secondary":theme.colors[1]} as CSSProperties}><i/><b>{theme.name}</b><small>Dashboard + badge pack</small></article>)}</div></section>
    {billingError && <p className="billing-error" role="alert">{billingError}</p>}
    <section className="free-plan-summary panel"><header><div><span>FANTASY HUB FREE</span><h3>The essentials stay free.</h3><p>Connect leagues, follow game day, and manage the weekly decisions that matter.</p></div>{!entitlement.pro && <b>CURRENT PLAN</b>}</header><ul>{freeFeatures.map((feature) => <li key={feature}>{feature}</li>)}</ul></section>
    <div className="membership-tier-compare">
      <section className="tier-plans pro-tier-plans panel"><header><div><span>FANTASY HUB PRO</span><h3>Advanced intelligence for every league.</h3><p>Build better weekly decisions with personalized strategy, simulations, analytics, draft controls, and customization.</p></div><b>{entitlement.pro ? "ACTIVE" : "FULL TOOLKIT"}</b></header><ul>{proFeatures.map((feature) => <li key={feature}>{feature}</li>)}</ul><div className="tier-price-grid"><article><span>MONTHLY</span><h4>{monthlyPrice} <small>/ month</small></h4><b>7-day free trial</b>{purchaseButton("monthly", "Start 7-day trial →")}<small>After the trial, {monthlyPrice} is billed monthly until canceled.</small></article><article className="recommended"><span>6 MONTHS</span><h4>{seasonPrice} <small>/ 6 months</small></h4><b>Season access</b>{purchaseButton("season", "Choose six months →")}<small>{seasonPrice} billed every six months until canceled.</small></article><article><span>YEARLY</span><h4>{annualPrice} <small>/ year</small></h4><b>{nativeIos ? "Best year-round value" : "Save $19.89"}</b>{purchaseButton("annual", "Choose Pro yearly →")}<small>{annualPrice} billed annually until canceled.</small></article></div></section>
      <section className="tier-plans elite-plans panel"><header><div><span>FANTASY HUB ELITE</span><h3>Your complete competitive command center.</h3><p>Add premium Draft HQ intelligence, League Stories, Manager Reports, every premium theme, and all future Elite releases.</p></div><b>{entitlement.elite ? "ACTIVE" : "BEST EXPERIENCE"}</b></header><ul>{eliteFeatures.map((feature) => <li key={feature}>{feature}</li>)}</ul><div className="tier-price-grid"><article><span>MONTHLY</span><h4>{appStorePrice("elite", "monthly", eliteMonthlyPrice)} <small>/ month</small></h4><b>Maximum flexibility</b>{elitePurchaseButton("elite_monthly", "Choose Elite monthly →")}<small>{appStorePrice("elite", "monthly", eliteMonthlyPrice)} billed monthly until canceled.</small></article><article className="recommended"><span>6 MONTHS</span><h4>{appStorePrice("elite", "season", eliteSeasonPrice)} <small>/ 6 months</small></h4><b>Built for draft through playoffs</b>{elitePurchaseButton("elite_season", "Choose Elite six months →")}<small>{appStorePrice("elite", "season", eliteSeasonPrice)} billed every six months until canceled.</small></article><article><span>YEARLY</span><h4>{appStorePrice("elite", "annual", eliteAnnualPrice)} <small>/ year</small></h4><b>Best Elite value</b>{elitePurchaseButton("elite_annual", "Choose Elite yearly →")}<small>{appStorePrice("elite", "annual", eliteAnnualPrice)} billed annually until canceled.</small></article></div></section>
    </div>
    <section className="pro-principle panel"><b>OUR FREEMIUM PROMISE</b><p>Fantasy Hub will not charge merely to display a connected league. Paid access is reserved for original Fantasy Hub analysis and experiences. Payments and subscription management are securely handled by {nativeIos ? "Apple" : "Stripe"}.</p><nav className="subscription-legal-links" aria-label="Subscription legal information"><a href="/privacy">Privacy Policy</a><a href="/terms">Terms of Use</a></nav></section>
  </div>;
}

function ThemeStore({
  teamTheme,
  onTeamThemeChange,
  badgeTheme,
  onBadgeThemeChange,
  isPro,
  isElite,
  isOwner,
  ownedTeamThemes,
  ownedBadgeThemes,
  onPurchaseConfirmed,
  onUpgrade,
}: {
  teamTheme: string;
  onTeamThemeChange: (team: string) => void;
  badgeTheme: BadgeTheme;
  onBadgeThemeChange: (theme: BadgeTheme) => void;
  isPro: boolean;
  isElite: boolean;
  isOwner: boolean;
  ownedTeamThemes: string[];
  ownedBadgeThemes: string[];
  onPurchaseConfirmed: (themeId: string, badgeId: string) => void;
  onUpgrade: () => void;
}) {
  const [tab, setTab] = useState<"library" | "store">("store");
  const nativeIos = useSyncExternalStore(() => () => undefined, isNativeIosApp, () => false);
  const [packPrices, setPackPrices] = useState<Record<string, string>>({});
  const [packBusy, setPackBusy] = useState("");
  const [packError, setPackError] = useState("");
  useEffect(() => {
    if (!nativeIos) return;
    void nativeStoreProducts().then((products) => setPackPrices(Object.fromEntries(products.map((product) => [product.id, product.displayPrice])))).catch(() => undefined);
  }, [nativeIos]);
  const selectedNflTheme = nflThemes.find((team) => team.id === teamTheme) ?? nflThemes[0];
  const proNflThemes = nflThemes.filter((team) => !team.premium);
  const proBadgePacks = badgeThemeOptions.filter((pack) => !premiumBadgeThemeIds.has(pack.id));
  const libraryTeams = nflThemes.filter((team) => ownedTeamThemes.includes(team.id) || (isPro && !team.premium) || (isOwner && Boolean(team.premium)));
  const libraryBadges = badgeThemeOptions.filter((pack) => ownedBadgeThemes.includes(pack.id) || (isPro && !premiumBadgeThemeIds.has(pack.id)) || (isOwner && premiumBadgeThemeIds.has(pack.id)));
  const premiumLibraryThemes = libraryTeams.filter((team) => team.premium);
  const nflLibraryThemes = libraryTeams.filter((team) => !team.premium);
  const premiumLibraryBadges = libraryBadges.filter((pack) => premiumBadgeThemeIds.has(pack.id));
  const proLibraryBadges = libraryBadges.filter((pack) => !premiumBadgeThemeIds.has(pack.id));
  const renderThemeButtons = (themes: typeof nflThemes, label: string) => <div className="team-theme-grid" role="group" aria-label={label}>{themes.map((team) => <button type="button" key={team.id} className={team.id === teamTheme ? "active" : ""} onClick={() => onTeamThemeChange(team.id)} aria-pressed={team.id === teamTheme}><i style={{background:`linear-gradient(135deg, ${team.primary} 0 50%, ${team.secondary} 50%)`}}/><span>{team.shortCode ?? team.id}</span><small>{team.name}</small></button>)}</div>;
  const renderBadgeButtons = (packs: typeof badgeThemeOptions, label: string) => <div className="badge-theme-grid" role="radiogroup" aria-label={label}>{packs.map((pack)=><button type="button" role="radio" aria-checked={badgeTheme === pack.id} className={`${pack.id} ${badgeTheme === pack.id ? "active" : ""}`} key={pack.id} onClick={()=>onBadgeThemeChange(pack.id)}><span>{pack.preview.map((icon,index)=><i key={`${icon}-${index}`}>{icon}</i>)}</span><strong>{pack.name}</strong><small>{pack.detail}</small></button>)}</div>;
  const premiumBundles = [
    { theme: nflThemes.find((theme) => theme.id === "CROWN")!, badge: badgeThemeOptions.find((pack) => pack.id === "crown-chrome")!, label: "THE AURORA SUITE", productId: "com.fantasyhubapp.theme.aurora" },
    { theme: nflThemes.find((theme) => theme.id === "NEONX")!, badge: badgeThemeOptions.find((pack) => pack.id === "neon-endzone")!, label: "THE PRIME-TIME SUITE", productId: "com.fantasyhubapp.theme.primetime" },
    { theme: nflThemes.find((theme) => theme.id === "HERITAGE")!, badge: badgeThemeOptions.find((pack) => pack.id === "heritage-gridiron")!, label: "THE SUNSET SUITE", productId: "com.fantasyhubapp.theme.sunset" },
  ];
  const hasNewStoreItems = !isOwner && (
    !isPro || premiumBundles.some(({ theme, badge }) => !ownedTeamThemes.includes(theme.id) || !ownedBadgeThemes.includes(badge.id))
  );
  async function addPremiumBundle(themeId: string, badgeId: string, productId: string) {
    setPackBusy(productId);
    setPackError("");
    try {
      if (isElite || isOwner) {
        const response = await fetch("/api/account/preferences", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acquireTeamTheme: themeId, acquireBadgeTheme: badgeId }) });
        const data = await response.json() as { error?: string };
        if (!response.ok) throw new Error(data.error ?? "Unable to add this pack");
      } else if (nativeIos) {
        const status = await nativePurchase(productId);
        if (status === "cancelled") throw new Error("App Store purchase was cancelled.");
        if (status === "pending") throw new Error("Your purchase is pending App Store approval.");
        if (status !== "active") throw new Error("The App Store purchase was not completed.");
      } else {
        throw new Error("Theme-pack checkout is currently available in the iOS app.");
      }
      onPurchaseConfirmed(themeId, badgeId);
    } catch (error) {
      setPackError(error instanceof Error ? error.message : "Unable to add this pack");
    } finally {
      setPackBusy("");
    }
  }
  return <div className="page-content theme-store-page">
    <section className="theme-store-hero">
      <div><span>FANTASY HUB THEME LOCKER</span><h2>Your leagues.<br/><em>Your Sunday look.</em></h2><p>Collect a complete Fantasy Hub identity, then mix and match your colors and badges. One selection carries across the entire Hub.</p></div>
      <div className="theme-store-counts"><article><strong>{libraryTeams.length}</strong><span>THEMES OWNED</span></article><article><strong>{libraryBadges.length}</strong><span>BADGES OWNED</span></article><small>Build your personal Fantasy Hub collection</small></div>
    </section>
    <nav className="theme-store-tabs" role="tablist" aria-label="Theme Locker sections"><button role="tab" aria-selected={tab === "store"} className={tab === "store" ? "active" : ""} onClick={()=>setTab("store")}><span>STORE {hasNewStoreItems && <em className="theme-tab-new">NEW</em>}</span><small>Discover new looks</small></button><button role="tab" aria-selected={tab === "library"} className={tab === "library" ? "active" : ""} onClick={()=>setTab("library")}><span>MY LIBRARY</span><small>Apply themes you own</small></button></nav>
    {tab === "library" ? <section className="appearance-panel theme-store-catalog panel" role="tabpanel">
      <div className="panel-header"><div><span>MY THEME LIBRARY</span><h3>Choose an owned team palette</h3></div><label>Team<select value={teamTheme} onChange={(event) => onTeamThemeChange(event.target.value)}>{libraryTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label></div>
      <div className="selected-team-theme"><i style={{background:`linear-gradient(135deg, ${selectedNflTheme.primary} 0 50%, ${selectedNflTheme.secondary} 50%)`}}/><span><strong>{selectedNflTheme.name}</strong><small>{selectedNflTheme.primary} · {selectedNflTheme.secondary}</small></span><b>ACTIVE THEME</b></div>
      {premiumLibraryThemes.length > 0 && <section className="library-standalone"><header><span>PREMIUM THEMES</span><strong>Your standalone theme releases</strong></header>{renderThemeButtons(premiumLibraryThemes, "Owned premium themes")}</section>}
      {nflLibraryThemes.length > 0 && <details className="library-collection" open={nflLibraryThemes.some((team) => team.id === teamTheme)}><summary><span><b>TEAM-INSPIRED THEME COLLECTION</b><small>All team-inspired color themes</small></span><em>{nflLibraryThemes.length} themes</em></summary>{renderThemeButtons(nflLibraryThemes, "Owned team-inspired theme collection")}</details>}
      <div className="badge-theme-builder"><header><div><span>MY BADGE LIBRARY</span><h4>Choose an owned navigation style</h4></div><small>{libraryBadges.length} packs</small></header>{premiumLibraryBadges.length > 0 && <section className="library-standalone"><header><span>PREMIUM BADGES</span><strong>Your standalone badge releases</strong></header>{renderBadgeButtons(premiumLibraryBadges, "Owned premium badge packs")}</section>}{proLibraryBadges.length > 0 && <details className="library-collection badge-library-collection" open={proLibraryBadges.some((pack) => pack.id === badgeTheme)}><summary><span><b>PRO BADGE COLLECTION</b><small>The original Fantasy Hub badge pack</small></span><em>{proLibraryBadges.length} badges</em></summary>{renderBadgeButtons(proLibraryBadges, "Owned Pro badge collection")}</details>}</div>
      <aside className="theme-store-future"><span>BUILD YOUR LIBRARY</span><strong>Looking for another Sunday look?</strong><p>Open the Store tab to add more palettes and badge packs to your account.</p></aside>
    </section> : <section className="appearance-panel theme-store-catalog theme-market panel" role="tabpanel">
      <div className="panel-header"><div><span>THEME STORE</span><h3>Add themes to your library</h3></div><b className="theme-membership-price">{isElite ? "ELITE · FREE" : isPro ? "PRO COLLECTION" : "MEMBERSHIP REQUIRED"}</b></div>
      <p>The Team-Inspired Theme Collection and Starter Badge Collection are automatically added to your library with an active Pro membership.</p>
      <aside className="elite-theme-promise"><span>FANTASY HUB ELITE</span><strong>Every current and future theme. Included.</strong><p>Elite members can claim every eligible release from the Store for free and keep it organized in My Library.</p><button onClick={onUpgrade}>{isElite ? "View Elite membership →" : "Explore Elite →"}</button></aside>
      <section className="pro-theme-collections"><header><span>INCLUDED WITH PRO</span><h4>Two complete starter collections.</h4><p>Upgrade once and both packs appear automatically in My Library.</p></header><div>
        <article className="pro-collection-card nfl-collection"><div className="pro-collection-art" aria-hidden="true">{proNflThemes.slice(0,8).map((theme)=><i key={theme.id} style={{background:`linear-gradient(135deg,${theme.primary} 0 50%,${theme.secondary} 50%)`}}><b>{theme.shortCode ?? theme.id}</b></i>)}</div><em>32 TEAM-INSPIRED THEMES</em><h5>Team-Inspired Theme Collection</h5><p>Every current team-inspired dashboard palette, packaged together and ready to use across Fantasy Hub.</p><button disabled={isPro} onClick={onUpgrade}>{isPro ? "PRO · IN YOUR LIBRARY" : "GET PRO ACCESS →"}</button></article>
        <article className="pro-collection-card badge-collection"><div className="pro-collection-art badge-collection-art" aria-hidden="true">{proBadgePacks.slice(0,6).map((pack)=><span className={`badge-pack-preview ${pack.id}`} key={pack.id}>{pack.preview.slice(0,2).map((icon,index)=><i key={`${icon}-${index}`}>{icon}</i>)}</span>)}</div><em>16 NAVIGATION STYLES</em><h5>Starter Badge Collection</h5><p>All 16 original Fantasy Hub badge packs in one Pro collection, from Arcade and Team Colors to Helmet and Trading Cards.</p><button disabled={isPro} onClick={onUpgrade}>{isPro ? "PRO · IN YOUR LIBRARY" : "GET PRO ACCESS →"}</button></article>
      </div></section>
      <section className="premium-theme-releases"><header><span>PREMIUM PACKS</span><h4>Unlock a complete new game-day identity.</h4><p>{isOwner ? "Owner access is active. Each color theme and matching badge design is available separately in My Library." : "Every pack pairs a cinematic color system with matching handcrafted badges. Buy it once and keep it in your Locker."}</p></header>{packError && <p className="billing-error" role="alert">{packError}</p>}<div>{premiumBundles.map(({theme,badge,label,productId})=>{const owned=ownedTeamThemes.includes(theme.id)&&ownedBadgeThemes.includes(badge.id);const labelText=owned?"IN YOUR LIBRARY ✓":isElite?"CLAIM FREE WITH ELITE →":nativeIos?`UNLOCK FOR ${packPrices[productId]??"$1.99"} →`:"$1.99 · IOS PURCHASE";return <article key={theme.id} className={`premium-pack-card premium-bundle premium-${theme.id.toLowerCase()}`}><div className="premium-bundle-art" style={{background:`radial-gradient(circle at 78% 18%,${theme.secondary}aa,transparent 32%),radial-gradient(circle at 15% 86%,${theme.secondary}55,transparent 38%),linear-gradient(135deg,${theme.primary},color-mix(in srgb,${theme.primary} 55%,#000))`}}><span className="premium-pack-kicker">LIMITED RELEASE</span><span className={`badge-pack-preview ${badge.id}`}>{badge.preview.map((icon,index)=><i key={`${icon}-${index}`}>{icon}</i>)}</span></div><em>{label}</em><h5>{theme.name}</h5><p>{theme.detail}</p><small>FULL PACK · {theme.name} colors + {badge.name} badges</small><button disabled={owned||packBusy===productId||(!nativeIos&&!isElite&&!isOwner)} onClick={()=>void addPremiumBundle(theme.id,badge.id,productId)}>{packBusy===productId?"PROCESSING…":labelText}</button></article>})}</div></section>
      {!isPro && <div className="appearance-pro-callout"><span>FANTASY HUB MEMBERSHIP</span><strong>Unlock theme collections.</strong><p>Upgrade to add premium themes and badge packs to your personal library.</p><button onClick={onUpgrade}>Explore plans →</button></div>}
    </section>}
  </div>;
}

function ManageLeagues({
  connectedLeagues,
  hiddenLeagueIds,
  managedLeagues,
  accountError,
  onOpen,
  onAdd,
  onRemove,
  onRefresh,
  onMove,
  onReorder,
  onToggleVisibility,
}: {
  connectedLeagues: ConnectedLeague[];
  hiddenLeagueIds: string[];
  managedLeagues: ManagedLeague[];
  accountError: string;
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
  onToggleVisibility: (id: string) => void;
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
          <b>VERIFIED CONNECTIONS</b>
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
              : "For automatic live score refreshes, make the league publicly viewable in ESPN before connecting by league ID. Private leagues can use the browser extension, but update only when synced again."}
          </p>
        </div>
        {provider === "espn" && (
          <section className="espn-private-sync">
            <div className="espn-private-heading">
              <div><span>PRIVATE ESPN LEAGUES</span><h4>Sync through your signed-in browser</h4></div>
              <b>NO PASSWORD SHARING</b>
            </div>
            <p>The extension reads your league while you are signed into ESPN and sends league data—not your password or ESPN cookies—to Fantasy Hub.</p>
            <aside className="espn-live-refresh-note">
              <b>WANT LIVE GAME-DAY REFRESHES?</b>
              <p>Make the league public in ESPN and connect it by league ID. Private leagues connected through the extension use saved snapshots and must be synced again to update.</p>
            </aside>
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
            className={`connected-league-row ${hiddenLeagueIds.includes(league.id) ? "hidden-league" : ""} ${draggedLeagueId === league.id ? "dragging" : ""} ${dropTarget?.id === league.id && draggedLeagueId !== league.id ? `drop-${dropTarget.position}` : ""}`}
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
            <div className="league-provider-stack">
              <i className={`provider-badge ${league.provider ?? "sleeper"}`}>{league.provider === "espn" ? "E" : "S"}</i>
              <span className={`connection-status ${hiddenLeagueIds.includes(league.id) ? "saved" : "live"}`}>
                {hiddenLeagueIds.includes(league.id) ? "HIDDEN" : "● LIVE"}
              </span>
            </div>
            <p>
              <strong>{league.name}</strong>
              <small>
                {league.provider === "espn" ? "ESPN" : "Sleeper"} · {league.season} · {league.teams} teams ·{" "}
                {league.format} · {league.scoring}
              </small>
            </p>
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
              <button
                className="visibility-league"
                onClick={() => onToggleVisibility(league.id)}
                aria-pressed={hiddenLeagueIds.includes(league.id)}
                aria-label={`${hiddenLeagueIds.includes(league.id) ? "Show" : "Hide"} ${league.name} in Fantasy Hub`}
              >
                {hiddenLeagueIds.includes(league.id) ? "Show" : "Hide"}
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
  cachedScansSavedAt,
  isPro,
  onOpen,
  onManage,
  onPersonalize,
  onScansChange,
}: {
  leagues: ConnectedLeague[];
  cachedScans: LeagueScan[];
  cachedScansSavedAt: number;
  isPro: boolean;
  onOpen: (league: ConnectedLeague, destination?: View) => Promise<void>;
  onManage: () => void;
  onPersonalize: () => void;
  onScansChange: (scans: LeagueScan[]) => void;
}) {
  const openPlayer = useContext(PlayerOpenContext);
  const [scans, setScans] = useState<LeagueScan[]>(cachedScans);
  const [loading, setLoading] = useState(
    leagues.length > 0 && cachedScans.length === 0,
  );
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [scanCompleted, setScanCompleted] = useState(0);
  const lastAutomaticScan = useRef("");
  const cachedScansRef = useRef(cachedScans);
  const leagueScanSignature = leagues.map((league) => league.id).sort().join(":");
  const scanIsActive = refreshing || loading || (leagues.length > 0 && scans.length < leagues.length);
  const completedScanProgress =
    (scanCompleted / Math.max(1, leagues.length)) * 100;
  const visibleScanProgress = Math.round(Math.min(100, completedScanProgress));
  const visibleScanCount = Math.min(
    leagues.length,
    Math.max(0, scanCompleted),
  );

  useEffect(() => {
    cachedScansRef.current = cachedScans;
  }, [cachedScans]);

  useEffect(() => {
    if (!leagues.length || !cachedScans.length) return;
    const leagueIds = new Set(leagues.map((league) => league.id));
    const cacheMatches =
      cachedScans.length === leagues.length &&
      cachedScans.every((scan) => leagueIds.has(scan.league.id));
    if (!cacheMatches) return;
    const cachedStateTimer = window.setTimeout(() => {
      setScans(cachedScans);
      setScanCompleted(leagues.length);
      setLoading(false);
    }, 0);
    return () => window.clearTimeout(cachedStateTimer);
  }, [leagueScanSignature, cachedScans, leagues]);

  useEffect(() => {
    if (!leagues.length) return;
    if (refreshKey === 0 && lastAutomaticScan.current === leagueScanSignature) return;
    lastAutomaticScan.current = leagueScanSignature;
    const leagueIds = new Set(leagues.map((league) => league.id));
    const cachedAtScanStart = cachedScansRef.current;
    const cacheMatches =
      cachedAtScanStart.length === leagues.length &&
      cachedAtScanStart.every((scan) => leagueIds.has(scan.league.id));
    const cacheIsFresh =
      cacheMatches &&
      cachedScansSavedAt > 0 &&
      Date.now() - cachedScansSavedAt < PORTFOLIO_SCAN_TTL_MS;
    // A complete recent portfolio snapshot is the Mission Hub's immediate
    // source of truth. Avoid re-fetching every league merely because the page
    // was revisited; the refresh control below remains an explicit override.
    if (refreshKey === 0 && cacheIsFresh) {
      setScans(cachedAtScanStart);
      setScanCompleted(leagues.length);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const controller = new AbortController();
    setRefreshing(true);
    const loadingTimer = cacheMatches && refreshKey === 0
      ? undefined
      : window.setTimeout(() => {
          setScanCompleted(0);
          setLoading(true);
        }, 0);
    void mapWithConcurrency(
      leagues,
      3,
      async (league): Promise<LeagueScan> => {
        try {
          let leagueResponse: Response | null = null;
          for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
              leagueResponse = await fetchWithTimeout(
                `/api/league?id=${encodeURIComponent(league.id)}${refreshKey > 0 ? "&refresh=1" : ""}`,
                { signal: controller.signal },
                15_000,
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
          const weather = await settleWithin(
            loadWeatherData(
              league.season ?? String(new Date().getUTCFullYear()),
              week,
            ),
            8_000,
            null,
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
                  `${player.name} is currently in ${formatRosterSlot(player.role)}, but ${player.team} is not on the Week ${week} pro football slate.`,
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
                `A single low-scoring pro football game could affect ${group.map((player) => player.name).join(", ")}.`,
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
      },
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
        if (!controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      });
    return () => {
      controller.abort();
      if (loadingTimer != null) window.clearTimeout(loadingTimer);
    };
    // League objects can be re-created during unrelated account renders. The
    // stable ID signature prevents those renders from aborting an active scan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueScanSignature, refreshKey, onScansChange, cachedScansSavedAt]);

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
          kicker="MISSION HUB"
          title="Connect your leagues to build your Mission Hub"
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
          <span>MISSION HUB</span>
          <div className="mission-title-row">
            <h2>
              One checklist.
              <br />
              <em>Every league covered.</em>
            </h2>
            <button className="personalize-hub" onClick={onPersonalize}>
              <i className="personalize-artwork" aria-hidden="true">
                <span />
                <span />
                <span />
              </i>
              <span>Personalize Your Hub</span>
              {!isPro && <b>PRO</b>}
            </button>
          </div>
          <p>
            Fantasy Hub scans your real rosters and moves the most urgent
            decisions to the top.
          </p>
        </div>
        <div className="mission-hero-actions">
          <button
            onClick={() => setRefreshKey((value) => value + 1)}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing…" : "Refresh all leagues"}
          </button>
        </div>
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
              <div><span>PRIORITIZED INBOX</span><h3>The decisions that matter most</h3></div>
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
                    <a className="platform-link" href={platformLeagueUrl(scan.league)} onClick={(event) => openPlatformLeagueOnMobile(event, scan.league)} target="_blank" rel="noopener noreferrer" aria-label={`Open league in ${scan.league.provider === "espn" ? "ESPN" : "Sleeper"} (opens in a new tab)`}><PlatformLogo provider={scan.league.provider === "espn" ? "ESPN" : "Sleeper"} /><span>{scan.league.provider === "espn" ? "Open ESPN" : "Open Sleeper"}</span><b aria-hidden="true">↗</b></a>
                  </div>
                </article>
              ))}
              {!topActions.length && <div className="portfolio-clear"><i>✓</i><p><strong>No action required right now</strong><small>Every connected lineup passed the current availability, projection, bye, weather, and waiver scan.</small></p></div>}
            </div>
          </section>
          <details className="mission-deep-dive">
            <summary><span><b>Explore the full portfolio</b><small>Action queue, matchup board, roster exposure, waivers, and weekly recap</small></span><i aria-hidden="true">⌄</i></summary>
            <div className="mission-deep-dive-content">
          <section className="portfolio-section action-queue panel">
            <div className="portfolio-heading"><div><span>FULL ACTION QUEUE</span><h3>Everything else, organized by deadline</h3></div><b>{remainingActions.length} QUEUED</b></div>
            {remainingActions.length > 0 && <div className="action-queue-scroll-preview" aria-hidden="true"><span>Swipe for more</span><i>→</i></div>}
            <div className="action-queue-groups">{(["Act now", "Before kickoff", "Tonight", "This week", "Monitor"] as QueuePriority[]).map((priority) => { const actions = remainingActions.filter((item) => item.priority === priority); if (!actions.length) return null; const priorityClass = `action-priority-${priority.toLowerCase().replaceAll(" ", "-")}`; return <section className={priorityClass} key={priority}><header><span>{priority}</span><b>{actions.length}</b></header>{actions.map(({ scan, issue }) => <button key={`queue-${issue.id}`} onClick={() => void onOpen(scan.league, actionView(issue.category))}><i aria-hidden="true">{leagueIssueIcon(issue.category, issue.title)}</i><p><strong>{issue.title}</strong><small>{scan.league.name} · {issue.category}</small></p><em>Review →</em></button>)}</section>; })}<section className="no-action-group"><header><span>No action</span><b>{healthyLeagues.length}</b></header>{healthyLeagues.length ? healthyLeagues.map((scan) => <button key={`healthy-${scan.league.id}`} onClick={() => void onOpen(scan.league)}><i>✓</i><p><strong>{scan.league.name} is healthy</strong><small>{scan.teamName} · lineup and availability checks are clear</small></p><em>Open →</em></button>) : <p>Every league with data has at least one item to monitor.</p>}</section></div>
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
            <div><article><i>🏆</i><span><small>BEST PREPARED</small><strong>{healthiest?.league.name}</strong><em>{healthiest?.health}/100 weekly readiness</em></span></article><article><i>🚀</i><span><small>BIGGEST LINEUP</small><strong>{biggestProjection?.teamName}</strong><em>{biggestProjection ? `${biggestProjection.league.name} · ${biggestProjection.projection.toFixed(1)} projected points` : "Projection unavailable"}</em></span></article><article><i>🎯</i><span><small>PORTFOLIO ANCHOR</small><strong>{playerExposure[0]?.player.name ?? "No repeat player"}</strong><em>{playerExposure[0] ? `Rostered in ${playerExposure[0].leagues.length} leagues` : "Diversified rosters"}</em></span></article></div>
          </section>
            </div>
          </details>
        </>
      )}
      {scanIsActive ? (
        <section className={`all-leagues-loading panel ${scans.length ? "background-refresh" : ""}`} aria-live="polite">
          <strong>{scans.length ? "Your saved Mission Hub is ready" : "Scanning your league portfolio…"}</strong>
          <p>{scans.length ? "Refreshing league changes quietly in the background." : "Checking settings, starters, injuries, waivers, schedule, and weather."}</p>
          <div
            className="load-progress"
            role={scans.length ? "presentation" : "progressbar"}
            aria-label="Scanning connected leagues"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={scans.length ? undefined : visibleScanProgress}
          >
            <span style={{ width: scans.length ? "100%" : `${visibleScanProgress}%` }} />
          </div>
          <small>{scans.length ? `Showing saved results · ${visibleScanCount} refreshed` : `${visibleScanCount} of ${leagues.length} leagues scanned`}</small>
        </section>
      ) : (
        <section className="league-scan-list">
          {scans.map((scan) => (
            <details
              className={`league-scan-card ${scan.status}`}
              key={scan.league.id}
            >
              <summary className="league-scan-summary">
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
                <i aria-hidden="true">⌄</i>
              </summary>
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
                  <a className="platform-link" href={platformLeagueUrl(scan.league)} onClick={(event) => openPlatformLeagueOnMobile(event, scan.league)} target="_blank" rel="noopener noreferrer" aria-label={`Open league in ${scan.league.provider === "espn" ? "ESPN" : "Sleeper"} (opens in a new tab)`}><PlatformLogo provider={scan.league.provider === "espn" ? "ESPN" : "Sleeper"} /><b aria-hidden="true">↗</b></a>
                </div>
              </footer>
            </details>
          ))}
        </section>
      )}
    </div>
  );
}

export type LeagueStoryData = {
  league: { name: string; season: string; currentWeek: number; completedWeek: number; provider: string };
  updatedAt: string;
  recap: { available: boolean; week: number; highScore: { teamName: string; points: number } | null; closestGame: { teams: { teamName: string; points: number }[] } | null; biggestWin: { teams: { teamName: string; points: number }[] } | null; biggestUpset: { winner: { teamName: string; points: number }; loser: { teamName: string; points: number }; seedGap: number } | null; lineupOutcomes: { teamName: string; benchPoints: number; topBenchPlayer: string | null; topBenchPoints: number }[] };
  preview: { week: number; games: { matchupId: number; teams: { rosterId: number; teamName: string; managerName: string; points: number; isMine: boolean }[] }[] };
  powerRankings: { rosterId: number; teamName: string; managerName: string; wins: number; losses: number; points: number; rank: number; movement: number; isMine: boolean }[];
  rivalry: { opponentName: string; meetings: number; wins: number; losses: number } | null;
  rivalries: {
    selectedRosterIds: number[];
    candidates: { rosterId: number; teamName: string; managerName: string }[];
    reports: { rosterId: number; teamName: string; managerName: string; meetings: number; wins: number; losses: number; ties: number; pointsFor: number; pointsAgainst: number; latest: { week: number; yourPoints: number; rivalPoints: number; margin: number; result: string } | null; event: "beat-rival" | "rival-lost" | "none"; weeklyNote: string; smackTalk: string }[];
  };
  trades: { id: string; week: number; timestamp: number | null; teams: string[]; adds: { player: string; team: string }[]; drops: { player: string; team: string }[] }[];
  playoff: {
    teams: number; startsWeek: number; weeksRemaining: number; yourRank: number | null; yourWins: number | null; lineWins: number | null; summary: string;
    bracket: {
      status: string;
      seeds: { seed: number; rosterId: number; teamName: string; managerName: string; record: string; points: number; playoffOdds: number; isMine: boolean }[];
      rounds: { name: string; matchups: { id: string; label: string; teams: ({ seed: number; rosterId: number; teamName: string; managerName: string; record: string; points: number; playoffOdds: number; isMine: boolean } | null)[]; bye: boolean }[] }[];
    };
  };
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

type DecisionReportData = {
  league: { name: string; week: number };
  observed: {
    startSit: { id: string; actual: string; recommended: string; position: string; actualPoints: number; recommendedPoints: number; followedRecommendation: boolean; confidence: number }[];
    waiverMoves: { id: string; type: string; added: string[]; dropped: string[]; faab: number; timestamp: number | null }[];
    trades: { id: string; received: string[]; sent: string[]; picksReceived: string[]; picksSent: string[]; timestamp: number | null }[];
  };
  winPathReports: { id: string; week: number; result: { players?: { id: string; name: string; actualPoints: number; targetTotal: number; difference: number; outcome: "short" | "met" | "over" }[] } | null }[];
  summary: { total: number; startSit: number; waiverMoves: number; trades: number; source: string };
};

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
  const activityTime = (timestamp: number | null) => timestamp ? new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(timestamp)) : "Completed this week";
  const assetList = (players: string[], picks: string[]) => [...players, ...picks].join(" · ") || "No assets recorded";
  return <div className="page-content manager-report-page">
    <section className="manager-report-hero"><div><span>MANAGER REPORT · WEEK {data.league.week}</span><h2>Your actual week in review.</h2><p>Lineup choices and completed roster moves are verified against {data.summary.source}, not inferred from buttons viewed inside Fantasy Hub.</p></div></section>
    <section className="decision-scorecards">
      <article className="panel"><span>START / SIT</span><strong>{data.summary.startSit || "—"}</strong><small>Actual submitted lineup choices</small><em>Sleeper matchup lineup</em></article>
      <article className="panel"><span>ADDS / DROPS</span><strong>{data.summary.waiverMoves || "—"}</strong><small>Completed waiver and free-agent moves</small><em>Sleeper transactions</em></article>
      <article className="panel"><span>TRADES</span><strong>{data.summary.trades || "—"}</strong><small>Completed trades involving your roster</small><em>Sleeper transactions</em></article>
    </section>
    <section className="manager-weekly-grid">
      <section className="manager-activity panel"><header><div><span>START / SIT DECISIONS</span><h3>What you actually started</h3></div><small>Compared with Fantasy Hub’s model call</small></header><div className="manager-activity-scroll">{data.observed.startSit.length ? data.observed.startSit.map((decision) => <article key={decision.id}><b className={`pos pos-${decision.position.toLowerCase()}`}>{decision.position}</b><div><strong>{decision.actual}</strong><small>{decision.followedRecommendation ? "Matched the model recommendation" : `Model preferred ${decision.recommended}`}</small></div><em>{decision.actualPoints.toFixed(1)} pts<small>{decision.confidence}% model confidence</small></em></article>) : <p className="story-empty">No comparable Start/Sit call is available yet. Open Start/Sit during the week so Fantasy Hub can preserve its recommendation, then this report will match it to your submitted Sleeper lineup.</p>}</div></section>
      <section className="manager-activity panel"><header><div><span>WAIVER WIRE</span><h3>Completed adds and drops</h3></div><small>Week {data.league.week}</small></header><div className="manager-activity-scroll">{data.observed.waiverMoves.length ? data.observed.waiverMoves.map((move) => <article key={move.id}><b>+</b><div><strong>{move.added.join(" · ") || "No add recorded"}</strong><small>{move.dropped.length ? `Dropped ${move.dropped.join(" · ")}` : "No corresponding drop"}</small></div><em>{move.faab ? `${move.faab} FAAB` : move.type}</em></article>) : <p className="story-empty">No completed waiver or free-agent moves involving your roster this week.</p>}</div></section>
      <section className="completed-trades-card panel"><header><div><span>COMPLETED TRADES</span><h3>Deals that actually processed</h3></div><small>Week {data.league.week}</small></header><div className="completed-trades-list">{data.observed.trades.length ? data.observed.trades.map((trade) => <article key={trade.id}><b>↔</b><div><strong>Received: {assetList(trade.received, trade.picksReceived)}</strong><small>Sent: {assetList(trade.sent, trade.picksSent)}</small></div><em>Completed<small>{activityTime(trade.timestamp)}</small></em></article>) : <p className="story-empty">No completed Sleeper trades involving your roster this week.</p>}</div></section>
    </section>
    <section className="win-path-report panel"><header><div><span>WHAT DO I NEED? RESULTS</span><h3>Who reached the live win-path target</h3></div></header><p className="win-path-description">Each result compares the player’s final score with the last live target Fantasy Hub saved before the matchup ended.</p>{data.winPathReports.length ? data.winPathReports.map((report) => <article key={report.id}><b>WEEK {report.week}</b>{report.result?.players?.length ? <div>{report.result.players.map((player) => <p className={player.outcome} key={player.id}><strong>{player.name}</strong><span><i style={{ width: `${Math.min(100, Math.round(player.actualPoints / Math.max(.1, player.targetTotal) * 100))}%` }} /></span><em>{player.actualPoints.toFixed(1)} / {player.targetTotal.toFixed(1)}</em><small>{player.outcome === "over" ? `Overperformed by ${player.difference.toFixed(1)}` : player.outcome === "met" ? "Hit the target" : `Came up ${Math.abs(player.difference).toFixed(1)} short`}</small></p>)}</div> : <small>Awaiting the final score.</small>}</article>) : <p className="story-empty">Live win-path results will appear after Fantasy Hub observes a matchup and its final scoring is available.</p>}</section>
  </div>;
}

function LeagueStories({ leagueId, setView }: { leagueId: string; setView: (view: View) => void }) {
  const [story, setStory] = useState<LeagueStoryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [shared, setShared] = useState("");
  const [draftOpen, setDraftOpen] = useState(false);
  const [rivalPickerOpen, setRivalPickerOpen] = useState(false);
  const [savingRivals, setSavingRivals] = useState(false);
  useEffect(() => {
    if (!draftOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setDraftOpen(false); };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [draftOpen]);
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
  const shareStory = async (requestOrId: import("./league-story-pdf").LeagueStoryReportRequest | string, legacyText = "") => {
    try {
      if (!story) return;
      const request: import("./league-story-pdf").LeagueStoryReportRequest = typeof requestOrId === "string"
        ? { id: requestOrId, shareText: legacyText, kind: requestOrId === "recap" ? "recap" : requestOrId === "wrapped" ? "wrapped" : "trade", tradeId: requestOrId }
        : requestOrId;
      const { generateLeagueStoryPdf } = await import("./league-story-pdf");
      const report = await generateLeagueStoryPdf(story, request);
      const file = new File([report.blob], report.fileName, { type: "application/pdf" });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ title: report.title, text: request.shareText, files: [file] });
      } else {
        const url = URL.createObjectURL(report.blob);
        const link = document.createElement("a");
        link.href = url; link.download = report.fileName; link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
      }
      setShared(request.id); window.setTimeout(() => setShared(""), 1800);
    } catch { /* A canceled share sheet should leave the page unchanged. */ }
  };
  const saveRivals = async (rosterIds: number[]) => {
    if (rosterIds.length > 3 || savingRivals) return;
    setSavingRivals(true);
    try {
      const response = await fetch("/api/league-story", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leagueId, rosterIds }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to save rivals");
      window.dispatchEvent(new CustomEvent("fantasy-hub:rivals-updated", { detail: { leagueId } }));
      const refreshed = await fetch(`/api/league-story?leagueId=${encodeURIComponent(leagueId)}`);
      const nextStory = await refreshed.json() as LeagueStoryData & { error?: string };
      if (!refreshed.ok) throw new Error(nextStory.error ?? "Unable to refresh rivalry reports");
      setStory(nextStory);
      setError("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save rivals");
    } finally {
      setSavingRivals(false);
    }
  };
  if (!leagueId) return <div className="page-content"><SectionIntro kicker="LEAGUE STORIES" title="Choose a league to open its story" text="Weekly recaps, rivalries, awards and playoff context are created from connected league history." /><section className="panel scoreboard-empty">No league selected.</section></div>;
  if (loading && !story) return <div className="page-content"><SectionIntro kicker="LEAGUE STORIES" title="Writing this week’s chapter…" text="Fantasy Hub is reading observed matchup and transaction history." /></div>;
  if (error && !story) return <div className="page-content"><SectionIntro kicker="LEAGUE STORIES" title="The league story is temporarily unavailable" text={error} /></div>;
  if (!story) return null;
  const highScoreText = story.recap.highScore ? `${story.recap.highScore.teamName} led ${story.league.name} in Week ${story.recap.week} with ${story.recap.highScore.points.toFixed(1)} points.` : "";
  const biggestMargin = story.recap.biggestWin ? Math.abs(story.recap.biggestWin.teams[0].points - story.recap.biggestWin.teams[1].points) : 0;
  return <><div className="page-content league-stories-page">
    <section className="league-stories-hero"><div><span>THE {story.league.season} LEAGUE STORY</span><h2>{story.league.name}</h2><p>Recaps, rivalries and the moments your group will actually talk about.</p></div><button onClick={() => void shareStory({ id: "league", kind: "league", shareText: `${story.league.name}: ${story.playoff.summary} ${highScoreText}` })}>{shared === "league" ? "PDF ready!" : "Share league report"}</button></section>
    <section className="story-ticker panel"><span>WEEK {story.league.currentWeek}</span><strong>{story.playoff.summary}</strong><small>Updated {new Date(story.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small></section>
    <section className="panel rivalry-reports">
      <header><div><span>RIVALRY REPORTS</span><h3>Your league. Your grudges.</h3><p>Track up to three rivals and unlock a share-ready reaction when you beat them or they lose.</p></div><button type="button" aria-expanded={rivalPickerOpen} onClick={() => setRivalPickerOpen((open) => !open)}>{rivalPickerOpen ? "Done" : story.rivalries.selectedRosterIds.length ? "Edit rivals" : "Choose rivals"}</button></header>
      {rivalPickerOpen && <div className="rival-picker" aria-label="Choose up to three league rivals"><div><strong>{story.rivalries.selectedRosterIds.length}/3 selected</strong><small>Selections are saved to this league.</small></div><div>{story.rivalries.candidates.map((candidate) => { const selected = story.rivalries.selectedRosterIds.includes(candidate.rosterId); const disabled = savingRivals || (!selected && story.rivalries.selectedRosterIds.length >= 3); return <button type="button" key={candidate.rosterId} className={selected ? "selected" : ""} aria-pressed={selected} disabled={disabled} onClick={() => void saveRivals(selected ? story.rivalries.selectedRosterIds.filter((id) => id !== candidate.rosterId) : [...story.rivalries.selectedRosterIds, candidate.rosterId])}><i aria-hidden="true">{selected ? "✓" : "+"}</i><span><b>{candidate.teamName}</b><small>{candidate.managerName}</small></span></button>; })}</div></div>}
      {story.rivalries.reports.length ? <div className="rival-report-grid">{story.rivalries.reports.map((report) => <article className={report.event} key={report.rosterId}><div className="rival-report-head"><span><small>RIVAL #{story.rivalries.selectedRosterIds.indexOf(report.rosterId) + 1}</small><strong>{report.teamName}</strong><em>{report.managerName}</em></span><b>{report.wins}–{report.losses}{report.ties ? `–${report.ties}` : ""}</b></div><div className="rival-report-stats"><span><b>{report.meetings}</b><small>MEETINGS</small></span><span><b>{report.pointsFor.toFixed(1)}</b><small>YOUR PTS</small></span><span><b>{report.pointsAgainst.toFixed(1)}</b><small>THEIR PTS</small></span></div><p>{report.weeklyNote}</p>{report.latest && <small className="rival-latest">Latest H2H: Week {report.latest.week} · {report.latest.yourPoints.toFixed(1)}–{report.latest.rivalPoints.toFixed(1)}</small>}<blockquote>{report.smackTalk}</blockquote><button type="button" onClick={() => void shareStory({ id: `rival-${report.rosterId}`, kind: "rivalry", rivalryRosterId: report.rosterId, shareText: report.smackTalk })}>{shared === `rival-${report.rosterId}` ? "PDF ready!" : report.event === "beat-rival" ? "Share victory report" : report.event === "rival-lost" ? "Share the receipts" : "Share rivalry report"}</button></article>)}</div> : <p className="story-empty rivalry-empty">Choose your biggest rivals to start building their reports.</p>}
    </section>
    <div className="story-feature-grid">
      <section className="panel weekly-recap"><header><div><span>WEEK {story.recap.week} RECAP</span><h3>The week that was</h3></div><button disabled={!story.recap.available} onClick={() => void shareStory("recap", highScoreText)}>{shared === "recap" ? "Copied!" : "Share recap"}</button></header>{story.recap.available ? <><article className="story-lead"><b>🏆 HIGH SCORE</b><strong>{story.recap.highScore?.teamName}</strong><em>{story.recap.highScore?.points.toFixed(1)} PTS</em></article><div className="story-awards"><article><span>PHOTO FINISH</span><strong>{story.recap.closestGame?.teams.map((team) => team.teamName).join(" vs ")}</strong><small>{story.recap.closestGame ? Math.abs(story.recap.closestGame.teams[0].points - story.recap.closestGame.teams[1].points).toFixed(1) : "—"}-point margin</small></article><article><span>STATEMENT WIN</span><strong>{story.recap.biggestWin?.teams.sort((a, b) => b.points - a.points)[0]?.teamName}</strong><small>{biggestMargin.toFixed(1)}-point margin</small></article>{story.recap.biggestUpset && <article><span>BIGGEST UPSET</span><strong>{story.recap.biggestUpset.winner.teamName}</strong><small>Beat a team ranked {story.recap.biggestUpset.seedGap} spot{story.recap.biggestUpset.seedGap === 1 ? "" : "s"} higher entering the week</small></article>}</div></> : <p className="story-empty">A recap will appear after the league records completed matchup scoring.</p>}</section>
      <section className="panel matchup-preview"><header><div><span>WEEK {story.preview.week} PREVIEW</span><h3>Next on the schedule</h3></div><button onClick={() => setView("Matchups")}>Open matchup →</button></header>{story.preview.games.map((game) => <article className={game.teams.some((team) => team.isMine) ? "mine" : ""} key={game.matchupId}><span>{game.teams[0]?.teamName}<small>{game.teams[0]?.managerName}</small></span><b>VS</b><span>{game.teams[1]?.teamName}<small>{game.teams[1]?.managerName}</small></span></article>)}</section>
    </div>
    <div className="story-dashboard-grid">
      <section className="panel power-story"><header><span>POWER RANKINGS</span><h3>Who’s moving?</h3></header>{story.powerRankings.map((team) => <article className={team.isMine ? "mine" : ""} key={team.rosterId}><b>{team.rank}</b><p><strong>{team.teamName}</strong><small>{team.wins}–{team.losses} · {team.points.toFixed(1)} PF</small></p><em className={team.movement > 0 ? "up" : team.movement < 0 ? "down" : "flat"}>{team.movement > 0 ? `↑ ${team.movement}` : team.movement < 0 ? `↓ ${Math.abs(team.movement)}` : "—"}</em></article>)}</section>
      <section className="panel league-lore"><header><span>LEAGUE LORE</span><h3>Rivalries & playoff race</h3></header>{story.rivalry ? <article className="rivalry-card"><b>HEAD TO HEAD</b><strong>You vs {story.rivalry.opponentName}</strong><span>{story.rivalry.wins}–{story.rivalry.losses}</span><small>{story.rivalry.meetings ? `${story.rivalry.meetings} observed meeting${story.rivalry.meetings === 1 ? "" : "s"} this season` : "First observed meeting this season"}</small></article> : <p className="story-empty">A rivalry record appears when the current matchup is posted.</p>}<article className="playoff-story"><b>PLAYOFF PICTURE</b><strong>{story.playoff.yourRank ? `You are currently #${story.playoff.yourRank}` : "Standings pending"}</strong><small>{story.playoff.summary} Playoffs begin Week {story.playoff.startsWeek}.</small></article></section>
      <section className="panel manager-moments"><header><span>MANAGER MOMENTS</span><h3>Outcome, not hindsight</h3></header>{story.recap.lineupOutcomes.map((outcome, index) => <article key={outcome.teamName}><b>{index === 0 ? "TOUGHEST BENCH" : "BENCH SPARK"}</b><p><strong>{outcome.teamName}</strong><small>{outcome.topBenchPlayer ? `${outcome.topBenchPlayer} scored ${outcome.topBenchPoints.toFixed(1)} on the bench.` : "No material bench scoring was recorded."}</small></p><em>{outcome.benchPoints.toFixed(1)}</em></article>)}<small className="decision-note">These are observed lineup outcomes. A lower-projected starter being outscored does not make the original decision wrong.</small></section>
      <section className="panel trade-reactions"><header><span>TRADE WIRE</span><h3>Completed deals</h3></header>{story.trades.length ? story.trades.map((trade) => { const text = `Week ${trade.week} trade in ${story.league.name}: ${trade.adds.map((item) => `${item.player} to ${item.team}`).join(", ")}.`; const tradeTeams = trade.teams.slice(0, 2); return <article key={trade.id}><div className="trade-wire-top"><b>WEEK {trade.week}</b><button onClick={() => void shareStory(trade.id, text)}>{shared === trade.id ? "Copied!" : "Share"}</button></div><div className="trade-wire-columns">{tradeTeams.map((team) => { const received = trade.adds.filter((item) => item.team === team); return <section key={`${trade.id}-${team}`}><header><strong>{team}</strong><small>RECEIVED</small></header><div>{received.length ? received.map((item) => <span key={`${trade.id}-${team}-${item.player}`}>{item.player}</span>) : <span className="empty">No player assets recorded</span>}</div></section>; })}</div></article>; }) : <p className="story-empty">No completed trades were observed in the current recap window.</p>}</section>
    </div>
    <section className="season-narrative panel"><header><div><span>YOUR SEASON NARRATIVE</span><h3>How this team’s story is changing</h3></div><b>{story.seasonNarrative.results.length} CHAPTERS</b></header><div className="narrative-origin"><article className="draft-day-card"><button type="button" disabled={!story.seasonNarrative.draftDay?.picks.length} aria-haspopup="dialog" aria-expanded={draftOpen} onClick={() => setDraftOpen(true)}><span>DRAFT-DAY EXPECTATIONS</span><strong>{story.seasonNarrative.draftDay?.summary ?? "Draft history was not returned for this league."}</strong>{story.seasonNarrative.draftDay && <small>{story.seasonNarrative.draftDay.picks.slice(0, 3).map((pick) => `R${pick.round}: ${pick.player}`).join(" · ")}</small>}{story.seasonNarrative.draftDay?.picks.length ? <em>View all {story.seasonNarrative.draftDay.picks.length} selections →</em> : null}</button></article><article><span>CHAMPIONSHIP PATH</span><strong>{story.seasonNarrative.championshipPath}</strong></article></div><div className="narrative-timeline">{story.seasonNarrative.results.map((result) => <article className={result.result === "W" ? "win" : result.result === "L" ? "loss" : "tie"} key={result.week}><b>W{result.week}</b><i>{result.result}</i><p><strong>{result.opponent}</strong><small>{result.yourPoints.toFixed(1)}–{result.opponentPoints.toFixed(1)} · {Math.abs(result.margin).toFixed(1)}-point {Math.abs(result.margin) <= 5 ? "close " : ""}{result.result === "W" ? "win" : result.result === "L" ? "loss" : "tie"}</small></p></article>)}</div><div className="narrative-moments"><article><span>MAJOR ACQUISITION</span><strong>{story.seasonNarrative.acquisitions[0]?.player ?? "No observed acquisition yet"}</strong><small>{story.seasonNarrative.acquisitions[0] ? `Added Week ${story.seasonNarrative.acquisitions[0].week} · ${story.seasonNarrative.acquisitions[0].pointsAfter.toFixed(1)} subsequent observed points` : "Waiver and trade additions will appear here."}</small></article><article><span>TURNING POINT</span><strong>{story.seasonNarrative.turningPoint ? `Week ${story.seasonNarrative.turningPoint.week} vs ${story.seasonNarrative.turningPoint.opponent}` : "Still being written"}</strong><small>{story.seasonNarrative.turningPoint ? `${story.seasonNarrative.turningPoint.result === "W" ? "Won" : "Lost"} by ${Math.abs(story.seasonNarrative.turningPoint.margin).toFixed(1)}` : "A defining result will emerge from observed games."}</small></article><article><span>INJURIES OVERCOME</span><strong>{story.seasonNarrative.injuryRecoveries.reduce((sum, item) => sum + item.recovered, 0)} recoveries observed</strong><small>{story.seasonNarrative.snapshots.length < 2 ? "Tracking begins with this week’s saved snapshot." : "Counted only when the saved weekly injury burden declines."}</small></article><article><span>BEST ACQUISITION OUTCOME</span><strong>{story.seasonNarrative.bestDecision?.player ?? "No move graded yet"}</strong><small>{story.seasonNarrative.bestDecision ? `${story.seasonNarrative.bestDecision.pointsAfter.toFixed(1)} subsequent points after the move` : "This avoids labeling a decision before results exist."}</small></article></div></section>
    <section className="narrative-trends panel"><header><div><span>STORYLINES OVER TIME</span><h3>Fantasy Hub’s observed history</h3></div><small>Saved weekly · no reconstructed snapshots</small></header>{story.seasonNarrative.snapshots.length ? <div className="trend-grid"><article><strong>PLAYOFF OUTLOOK</strong>{story.seasonNarrative.snapshots.map((snapshot) => <div key={`odds-${snapshot.week}`}><span>W{snapshot.week}</span><i><b style={{ width: `${snapshot.playoffProbability ?? 0}%` }} /></i><em>{snapshot.playoffProbability ?? "—"}%</em></div>)}</article><article><strong>ROSTER VALUE INDEX</strong>{story.seasonNarrative.snapshots.map((snapshot) => <div key={`value-${snapshot.week}`}><span>W{snapshot.week}</span><i><b style={{ width: `${Math.min(100, Math.max(0, snapshot.rosterValueIndex ?? 0) / 1.3)}%` }} /></i><em>{snapshot.rosterValueIndex ?? "—"}</em></div>)}</article></div> : <p className="story-empty">The first weekly history point will appear after Fantasy Hub records this league.</p>}<p className="trend-note">Roster Value Index compares your average points to the league average (100 = league average). Estimated playoff outlook is a transparent standings-based indicator, not a Sleeper probability.</p></section>
    <section className={`fantasy-wrapped ${story.seasonNarrative.wrapped.ready ? "ready" : "preview"}`}><div><span>{story.seasonNarrative.wrapped.ready ? "FANTASY WRAPPED" : "SEASON STORY SO FAR"}</span><h3>{story.seasonNarrative.wrapped.headline}</h3><p>{story.seasonNarrative.wrapped.ready ? "Your year, distilled into the moments worth sharing." : "This card becomes your full Fantasy Wrapped as the playoffs arrive."}</p></div><div className="wrapped-stats"><article><strong>{story.seasonNarrative.wrapped.record}</strong><small>RECORD</small></article><article><strong>{story.seasonNarrative.wrapped.points.toFixed(1)}</strong><small>POINTS</small></article><article><strong>{story.seasonNarrative.wrapped.closeWins}</strong><small>CLOSE WINS</small></article><article><strong>{story.seasonNarrative.wrapped.bestWeek ? `W${story.seasonNarrative.wrapped.bestWeek.week}` : "—"}</strong><small>BEST WEEK</small></article></div><button onClick={() => void shareStory("wrapped", story.seasonNarrative.wrapped.shareText)}>{shared === "wrapped" ? "Copied!" : story.seasonNarrative.wrapped.ready ? "Share my Wrapped" : "Share season story"}</button></section>
    <section className="playoff-bracket panel">
      <header><div><span>PLAYOFF BRACKET</span><h3>The road to the title</h3><p>Seeds update with current standings. Percentages are Fantasy Hub’s standings-based playoff outlook.</p></div><div><b>{story.playoff.bracket.status}</b><small>{story.playoff.teams} teams · starts Week {story.playoff.startsWeek}</small></div></header>
      <div className="playoff-seed-strip" aria-label="Current projected playoff seeds">{story.playoff.bracket.seeds.map((team) => <article className={team.isMine ? "mine" : ""} key={team.rosterId}><b>#{team.seed}</b><span><strong>{team.teamName}</strong><small>{team.record} · {team.points.toFixed(1)} PF</small></span><em>{team.playoffOdds}%<small>odds</small></em></article>)}</div>
      <div className="bracket-scroll"><div className="bracket-rounds">{story.playoff.bracket.rounds.map((round, roundIndex) => <section key={round.name}><h4>{round.name}</h4><div>{round.matchups.map((matchup, matchupIndex) => <article className={matchup.teams.some((team) => team?.isMine) ? "mine" : ""} key={matchup.id}>{matchup.teams.map((team, teamIndex) => <div key={`${matchup.id}-${teamIndex}`} className={team ? "seeded" : "pending"}>{team ? <><b>{team.seed}</b><span>{team.teamName}</span><em>{team.playoffOdds}%</em></> : <><b>—</b><span>{matchup.bye && teamIndex === 1 ? "BYE" : roundIndex ? `Winner ${Math.min(story.playoff.bracket.rounds[roundIndex - 1]?.matchups.length ?? 1, matchupIndex * 2 + teamIndex + 1)}` : "TBD"}</span></>}</div>)}</article>)}</div></section>)}</div></div>
      <footer><span><i /> Current projected field</span><small>Projected bracket only. Official seeding and tiebreakers remain controlled by {story.league.provider}.</small></footer>
    </section>
    <p className="story-methodology">{story.methodology}</p>
  </div>{draftOpen && story.seasonNarrative.draftDay && createPortal(<div className="draft-history-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDraftOpen(false); }}><section className="draft-history-dialog" role="dialog" aria-modal="true" aria-label="All draft selections"><header><div><span>DRAFT-DAY EXPECTATIONS</span><h3>All draft selections</h3><small>{story.league.name}{story.seasonNarrative.draftDay.slot ? ` · Draft slot ${story.seasonNarrative.draftDay.slot}` : ""}</small></div><button type="button" aria-label="Close draft selections" onClick={() => setDraftOpen(false)}>×</button></header><div className="draft-history-list">{[...story.seasonNarrative.draftDay.picks].sort((a, b) => (a.round ?? 999) - (b.round ?? 999) || (a.pick ?? 999) - (b.pick ?? 999)).map((pick, index) => <article key={`${pick.round}-${pick.pick}-${pick.player}-${index}`}><b>{pick.round ? `R${pick.round}` : `#${index + 1}`}</b><p><strong>{pick.player}</strong><small>{pick.pick ? `Overall pick ${pick.pick}` : "Pick number unavailable"}</small></p></article>)}</div></section></div>, document.body)}</>;
}

function AllLeagueScoreboard({
  leagues,
  defaultWeek,
  onOpenLeague,
  onOpenMatchups,
}: {
  leagues: ConnectedLeague[];
  defaultWeek: number;
  onOpenLeague: (league: ConnectedLeague) => Promise<void>;
  onOpenMatchups: (league: ConnectedLeague, matchupId: number) => Promise<void>;
}) {
  const openPlayer = useContext(PlayerOpenContext);
  const [week, setWeek] = useState(defaultWeek >= 1 && defaultWeek <= 18 ? defaultWeek : 1);
  const portfolioCacheKey = useMemo(
    () => `fantasy-hub:scoreboard:${week}:${leagues.map((league) => league.id).sort().join(",")}`,
    [leagues, week],
  );
  const initialPortfolioSnapshot = useMemo(() => {
    if (typeof window === "undefined") return null;
    try {
      const cached = window.localStorage.getItem(portfolioCacheKey);
      if (!cached) return null;
      const snapshot = JSON.parse(cached) as {
        scores?: Record<string, ScoreboardData | null>;
        updatedAt?: string;
      };
      return snapshot.scores && typeof snapshot.scores === "object" ? snapshot : null;
    } catch {
      return null;
    }
  }, [portfolioCacheKey]);
  const [scores, setScores] = useState<Record<string, ScoreboardData | null>>(() => initialPortfolioSnapshot?.scores ?? {});
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(() => initialPortfolioSnapshot?.updatedAt ?? "");
  const [expandedNeeds, setExpandedNeeds] = useState<Set<string>>(new Set());
  const [swingFeed, setSwingFeed] = useState<{ id: string; league: string; text: string; previous: number; current: number; at: string }[]>([]);
  const [pulseEvents, setPulseEvents] = useState<{ id: string; text: string; impact: "helps" | "hurts"; at: string }[]>([]);
  const previousOdds = useRef<Record<string, number>>({});
  const previousPulseSnapshot = useRef<Record<string, { points: number; yards: number; touchdowns: number; receptions: number; offensiveTurnovers: number; defensiveTurnovers: number; returnTouchdowns: number; fieldGoals: number }>>({});
  const previousPulseOdds = useRef<Record<string, number | null>>({});
  const savedWinPathPayloads = useRef<Record<string, string>>({});
  const matchupJumpTimers = useRef<number[]>([]);
  useEffect(() => () => {
    matchupJumpTimers.current.forEach((timer) => window.clearTimeout(timer));
  }, []);
  useEffect(() => {
    if (!leagues.length) return;
    let active = true;
    let hydrationTimer: number | undefined;
    previousPulseSnapshot.current = {};
    previousPulseOdds.current = {};
    let hasCachedScores = Boolean(initialPortfolioSnapshot?.scores);
    if (initialPortfolioSnapshot?.scores) {
      hydrationTimer = window.setTimeout(() => {
        if (!active) return;
        setScores(initialPortfolioSnapshot.scores ?? {});
        setUpdatedAt(initialPortfolioSnapshot.updatedAt ?? "");
      }, 0);
    }
    try {
      const cached = window.localStorage.getItem(portfolioCacheKey);
      if (cached) {
        const snapshot = JSON.parse(cached) as {
          scores?: Record<string, ScoreboardData | null>;
          updatedAt?: string;
        };
        if (snapshot.scores && typeof snapshot.scores === "object") {
          hasCachedScores = true;
        }
      }
    } catch {
      // A corrupt or unavailable browser cache should never block live scoring.
    }
    const refresh = async () => {
      if (!hasCachedScores) setLoading(true);
      const [results, livePlays] = await Promise.all([
        mapWithConcurrency(
          leagues,
          3,
          async (league) => {
            try {
              const response = await fetch(`/api/scoreboard?leagueId=${encodeURIComponent(league.id)}&week=${week}&scope=mine`);
              if (!response.ok) return [league.id, null] as const;
              return [league.id, await response.json() as ScoreboardData] as const;
            } catch {
              return [league.id, null] as const;
            }
          },
        ),
        fetch(`/api/nfl-plays?season=${encodeURIComponent(leagues[0]?.season ?? String(new Date().getFullYear()))}&week=${week}`)
          .then(async (response) => response.ok ? (await response.json() as { plays?: LivePlayContext[] }).plays ?? [] : [])
          .catch(() => [] as LivePlayContext[]),
      ]);
      if (!active) return;
      const hadPulseBaseline = Object.keys(previousPulseSnapshot.current).length > 0;
      const nextSnapshot: typeof previousPulseSnapshot.current = {};
      const nextOdds: typeof previousPulseOdds.current = {};
      const scoringEvents: { id: string; text: string; impact: "helps" | "hurts"; at: string; delta: number }[] = [];
      results.forEach(([leagueId, data]) => {
        const league = leagues.find((item) => item.id === leagueId);
        const matchup = data?.matchups.find((item) => item.teams.some((team) => team.isMine));
        const mine = matchup?.teams.find((team) => team.isMine);
        const opponent = matchup?.teams.find((team) => !team.isMine);
        if (!data || !league || !matchup || !mine || !opponent) return;
        const mineStarters = mine.topPlayers.filter((player) => player.isStarter);
        const opponentStarters = opponent.topPlayers.filter((player) => player.isStarter);
        const mineRemaining = mineStarters.reduce((sum, player) => sum + Math.max(0, (player.projection ?? 0) - player.points), 0);
        const opponentRemaining = opponentStarters.reduce((sum, player) => sum + Math.max(0, (player.projection ?? 0) - player.points), 0);
        const status = matchup.status === "Final" ? "final" : matchup.status === "Scheduled" ? "pre" : "live";
        const projectionsAvailable = [...mineStarters, ...opponentStarters].some((player) => player.projection != null);
        const currentOdds = estimatedWinProbability({ yourPoints: mine.points, opponentPoints: opponent.points, yourRemaining: mineRemaining, opponentRemaining, status, projectionsAvailable });
        nextOdds[leagueId] = currentOdds;
        if (status === "live") {
          const need = whatDoINeed({ yourPoints: mine.points, opponentPoints: opponent.points, opponentRemaining, players: mineStarters, scoring: data.league.scoring ?? {} });
          if (need.targets.length) {
            const alternatives = need.targets.slice(0, 8).map((target) => ({ id: target.id, name: target.name, position: target.position, baselinePoints: target.points, pointsNeeded: target.pointsNeeded, targetTotal: target.targetTotal }));
            const payloadKey = `${leagueId}:${week}`;
            const payloadHash = JSON.stringify(alternatives);
            if (savedWinPathPayloads.current[payloadKey] !== payloadHash) {
              savedWinPathPayloads.current[payloadKey] = payloadHash;
              void fetch("/api/decisions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: `win-path:${week}`, leagueId, week, category: "win_path", recommendation: "Live win-path targets", alternatives, information: { teamNeed: need.teamNeed, yourPoints: mine.points, opponentPoints: opponent.points, opponentRemaining, capturedAt: new Date().toISOString() }, confidence: currentOdds == null ? 50 : Math.max(currentOdds, 100 - currentOdds) }) }).catch(() => undefined);
            }
          }
        }
        matchup.teams.forEach((team) => team.topPlayers.filter((player) => player.isStarter).forEach((player) => {
          const key = `${leagueId}:${team.rosterId}:${player.id}`;
          const previous = previousPulseSnapshot.current[key];
          nextSnapshot[key] = { points: player.points, yards: player.yards, touchdowns: player.touchdowns, receptions: player.receptions, offensiveTurnovers: player.offensiveTurnovers ?? 0, defensiveTurnovers: player.defensiveTurnovers ?? 0, returnTouchdowns: player.returnTouchdowns ?? 0, fieldGoals: player.fieldGoals ?? 0 };
          const pointDelta = previous ? player.points - previous.points : 0;
          if (status !== "live" || !previous) return;
          const classified = classifyFantasyPlay(previous, nextSnapshot[key]);
          if (!classified.qualifies) return;
          const impact = team.isMine ? "helps" as const : "hurts" as const;
          const previousOdds = previousPulseOdds.current[leagueId];
          const matchupImpact = matchupImpactText({ isMine: team.isMine, yourPoints: mine.points, opponentPoints: opponent.points, previousOdds, currentOdds });
          const pointsLabel = classified.fantasyPoints === 0 ? "" : ` (${classified.fantasyPoints > 0 ? "+" : ""}${classified.fantasyPoints.toFixed(1)} pts)`;
          const playContext = findConfirmedPlayContext(player, livePlays, classified);
          const playDescription = playContext?.text ?? `${player.name}: ${classified.description}`;
          const gameClock = playContext && playContext.period ? ` Q${playContext.period}${playContext.clock ? ` ${playContext.clock}` : ""}.` : "";
          scoringEvents.push({ id: `${key}:${player.points}:${playContext?.id ?? Date.now()}`, impact, delta: Math.max(Math.abs(pointDelta), classified.kind === "turnover" ? 3 : 0), at: new Date().toISOString(), text: `${impact === "helps" ? "📈" : "📉"} ${playDescription}${pointsLabel} in ${league.name}.${gameClock} ${matchupImpact}` });
        }));
      });
      previousPulseSnapshot.current = nextSnapshot;
      previousPulseOdds.current = nextOdds;
      if (scoringEvents.length) setPulseEvents((current) => [...scoringEvents.sort((a, b) => b.delta - a.delta), ...current].slice(0, 12));
      else if (!hadPulseBaseline) setPulseEvents([]);
      const nextScores = Object.fromEntries(results);
      const nextUpdatedAt = new Date().toISOString();
      setScores(nextScores);
      setUpdatedAt(nextUpdatedAt);
      hasCachedScores = true;
      try {
        safeLocalStorageSet(portfolioCacheKey, JSON.stringify({
          scores: nextScores,
          updatedAt: nextUpdatedAt,
        }));
      } catch {
        // Storage limits and private browsing must not interrupt scoreboard use.
      }
      setLoading(false);
    };
    void refresh();
    const stopPolling = startVisiblePolling(refresh);
    return () => {
      active = false;
      if (hydrationTimer !== undefined) window.clearTimeout(hydrationTimer);
      stopPolling();
    };
  }, [initialPortfolioSnapshot, leagues, portfolioCacheKey, week]);
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
        position: playerExposures[0]?.position ?? "PRO",
        nflTeam: playerExposures[0]?.nflTeam ?? "FA",
        sentiment: helps && hurts ? "mixed" : helps ? "cheer" : "fade",
        affectedLeagues: playerExposures.map((item) => ({
          id: item.leagueId,
          name: item.leagueName,
          impact: item.side === "you" ? "helps" : "hurts",
        })),
      };
    });
    const leveragePlayers = [...playerGroups.entries()].map(([id, items]) => ({ id, name: items[0].playerName, ...playerLeverage(items), exposures: items })).sort((a, b) => b.score - a.score);
    const performerGroups = new Map<string, { player: ScoreboardPlayer; status: string; leagues: { id: string; name: string; side: "helps" | "hurts" }[] }>();
    matchups.forEach((item) => {
      [...item.mineStarters.map((player) => ({ player, side: "helps" as const })), ...item.opponentStarters.map((player) => ({ player, side: "hurts" as const }))].forEach(({ player, side }) => {
        const current = performerGroups.get(player.id);
        performerGroups.set(player.id, {
          player: !current || player.points > current.player.points ? player : current.player,
          status: item.matchup.status,
          leagues: [...(current?.leagues ?? []), { id: item.league.id, name: item.league.name, side }],
        });
      });
    });
    const onFire = [...performerGroups.values()]
      .filter((item) => item.player.points > 0)
      .map((item) => ({ ...item, temperature: playerTemperature(item.player, item.status), performanceScore: item.player.points + Math.max(0, item.player.points - (item.player.projection ?? item.player.points)) * .8 }))
      .sort((a, b) => b.performanceScore - a.performanceScore)
      .slice(0, 5);
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
    return { matchups, interests, leveragePlayers, onFire, activePlayers, completedPlayers, remainingPlayers: Math.max(0, totalStarters - activePlayers - completedPlayers) };
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
  const hasObservedScoring = gameDay.matchups.some((item) => item.status === "live" || item.status === "final" || item.mine.points > 0 || item.opponent.points > 0);
  const usePreKickoffVisuals = PRE_KICKOFF_VISUALS_ENABLED && !hasObservedScoring;
  const preKickoffOnFire = usePreKickoffVisuals
    ? gameDay.matchups
        .flatMap((item) => item.mineStarters.map((player) => ({ player, league: item.league })))
        .filter((item, index, items) => items.findIndex((candidate) => candidate.player.id === item.player.id) === index)
        .filter((item) => (item.player.projection ?? 0) > 0)
        .sort((a, b) => (b.player.projection ?? 0) - (a.player.projection ?? 0))
        .slice(0, 5)
        .map((item, index) => {
          const projectedPoints = item.player.projection ?? 0;
          return {
            player: { ...item.player, points: projectedPoints },
            status: "Projected",
            leagues: [{ id: item.league.id, name: item.league.name, side: "helps" as const }],
            temperature: { value: Math.max(55, 82 - index * 6), label: index < 2 ? "Projected leader" : "Projected impact", state: index < 2 ? "hot" : "warm" },
            performanceScore: projectedPoints,
          };
        })
    : [];
  const displayedOnFire = gameDay.onFire.length ? gameDay.onFire : preKickoffOnFire;
  const dramaScore = (item?: (typeof gameDay.matchups)[number]) => {
    if (!item) return -999;
    const projectedMargin = Math.abs(
      item.mine.points + item.mineRemaining - item.opponent.points - item.opponentRemaining,
    );
    const probabilityDrama = item.winProbability == null ? 0 : 50 - Math.abs(50 - item.winProbability);
    return (item.status === "live" ? 100 : item.status === "pre" ? 20 : -40) + Math.max(0, 40 - projectedMargin) + probabilityDrama;
  };
  const featured = [...gameDay.matchups].sort((a, b) => dramaScore(b) - dramaScore(a))[0];
  const winPathCandidates = gameDay.matchups.flatMap((item) => {
    if (item.status === "final") return [];
    const need = whatDoINeed({ yourPoints: item.mine.points, opponentPoints: item.opponent.points, opponentRemaining: item.opponentRemaining, players: item.mineStarters, scoring: item.data.league.scoring ?? {} });
    const activeTargets = need.targets.filter((target) => target.projection == null || target.projection > target.points);
    return (activeTargets.length ? activeTargets : need.targets).map((target, targetIndex) => ({
      league: item.league,
      target,
      need,
      winProbability: item.winProbability,
      status: item.status,
      importance: (item.status === "live" ? 35 : 10) + (100 - Math.abs((item.winProbability ?? 50) - 50)) + Math.min(35, target.pointsNeeded * 1.5) - targetIndex * 3,
    }));
  }).sort((a, b) => b.importance - a.importance);
  const selectedWinPaths: typeof winPathCandidates = [];
  const selectedPlayerIds = new Set<string>();
  const selectedLeagueIds = new Set<string>();
  for (const candidate of winPathCandidates) {
    if (selectedLeagueIds.has(candidate.league.id) || selectedPlayerIds.has(candidate.target.id)) continue;
    selectedWinPaths.push(candidate);
    selectedLeagueIds.add(candidate.league.id);
    selectedPlayerIds.add(candidate.target.id);
    if (selectedWinPaths.length === 5) break;
  }
  for (const candidate of winPathCandidates) {
    if (selectedWinPaths.length === 5) break;
    if (selectedPlayerIds.has(candidate.target.id) || selectedWinPaths.some((item) => item.league.id === candidate.league.id && item.target.id === candidate.target.id)) continue;
    selectedWinPaths.push(candidate);
    selectedPlayerIds.add(candidate.target.id);
  }
  selectedWinPaths.sort((a, b) => b.importance - a.importance);
  const mostImportantPath = selectedWinPaths[0];
  const mostImportantLeagues = mostImportantPath ? winPathCandidates.filter((item) => item.target.id === mostImportantPath.target.id).filter((item, index, items) => items.findIndex((candidate) => candidate.league.id === item.league.id) === index) : [];
  const secondaryWinPaths = selectedWinPaths.slice(1, 5);
  const matchupByLeague = new Map(gameDay.matchups.map((item) => [item.league.id, item]));
  const orderedLeagues = [...leagues].sort(
    (a, b) => dramaScore(matchupByLeague.get(b.id)) - dramaScore(matchupByLeague.get(a.id)),
  );
  const projectedWins = gameDay.matchups.filter((item) => (item.winProbability ?? 0) >= 50).length;
  const closest = [...gameDay.matchups].sort((a, b) => Math.abs((a.winProbability ?? 50) - 50) - Math.abs((b.winProbability ?? 50) - 50))[0];
  const statusPulseItems = [
    gameDay.matchups.some((item) => item.status === "live")
      ? `${gameDay.matchups.filter((item) => item.status === "live").length} matchups live now`
      : `Week ${week} portfolio is standing by`,
    closest ? `${closest.league.name} is your closest matchup at ${closest.winProbability ?? 50}%` : "Waiting for matchup projections",
    gameDay.leveragePlayers[0] ? `${gameDay.leveragePlayers[0].name} is your highest-leverage player` : "Leverage alerts appear at kickoff",
    featured && featured.status !== "final" ? `${featured.mineRemaining.toFixed(1)} projected points remain for ${featured.mine.teamName}` : "Final scores collapse into postgame reviews",
  ];
  const pulseItems = pulseEvents.length ? pulseEvents.slice(0, 6).map((event) => event.text) : statusPulseItems;
  useEffect(() => {
    const original = document.title;
    document.title = gameDay.matchups.length
      ? `${projectedWins}-${Math.max(0, gameDay.matchups.length - projectedWins)} projected · Fantasy Hub`
      : original;
    return () => { document.title = original; };
  }, [gameDay.matchups.length, projectedWins]);
  const enterTvMode = () => {
    if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.();
    else void document.exitFullscreen?.();
  };
  const scrollToLeagueMatchups = () => {
    matchupJumpTimers.current.forEach((timer) => window.clearTimeout(timer));
    matchupJumpTimers.current = [];
    const scrollToTarget = (behavior: ScrollBehavior) => {
      document.getElementById("league-matchups")?.scrollIntoView({ behavior, block: "start" });
    };
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scrollToTarget(reducedMotion ? "auto" : "smooth");
    // Initial score data and deferred cards can expand above the anchor after
    // the first tap. Re-anchor briefly while that first layout settles.
    matchupJumpTimers.current = [150, 450, 900, 1500].map((delay) =>
      window.setTimeout(() => scrollToTarget("auto"), delay),
    );
  };
  const scrollToLeagueScore = (leagueId: string) => {
    document.getElementById(`portfolio-matchup-${leagueId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  if (!leagues.length)
    return (
      <div className="page-content">
        <SectionIntro kicker="FANTASY SCOREBOARD" title="Connect a league to track your matchups" text="Your matchup from every connected league will appear together here." />
      </div>
    );
  return (
    <div className="page-content portfolio-scoreboard-page">
      <section className="scoreboard-head portfolio-scoreboard-head">
        <div>
          <span>FANTASY SCOREBOARD</span>
          <h2>Your matchups, one live view.</h2>
          <p>Only your matchup from each connected league is shown. Scores refresh every 30 seconds.</p>
        </div>
        <label>
          Week
          <select value={week} onChange={(event) => { setExpandedNeeds(new Set()); setWeek(Number(event.target.value)); }}>
            {Array.from({ length: 18 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>Week {value}</option>)}
          </select>
        </label>
        <div className="live-refresh"><i />{loading ? "Refreshing" : `Updated ${updatedAt ? new Date(updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—"}`}</div>
      </section>
      <button
        className="mobile-matchup-jump"
        type="button"
        onClick={scrollToLeagueMatchups}
      >
        <span>League matchups</span><b aria-hidden="true">↓</b>
      </button>
      <section className="sunday-pulse" aria-label="Sunday Pulse">
        <b><i /> SUNDAY PULSE</b>
        <div><span>{pulseItems.join("  •  ")}</span><span aria-hidden="true">{pulseItems.join("  •  ")}</span></div>
        <button type="button" onClick={enterTvMode}>Full screen</button>
      </section>
      <section className="portfolio-score-rail" aria-label="Quick access to fantasy matchup scores">
        <header><b>YOUR SCORES</b><small>Tap a matchup for the full view</small></header>
        <div>
          {orderedLeagues.map((league) => {
            const matchup = gameDay.matchups.find((item) => item.league.id === league.id);
            if (!matchup) return <button className="pending" type="button" key={league.id} onClick={() => scrollToLeagueScore(league.id)}><span><i /> {league.name}</span><strong>Matchup pending</strong><small>Open details →</small></button>;
            const margin = Math.abs(matchup.mine.points - matchup.opponent.points);
            const urgency = matchup.status === "live" && margin <= 12 ? "urgent" : matchup.status === "live" ? "live" : matchup.status;
            return <button className={urgency} type="button" key={league.id} onClick={() => scrollToLeagueScore(league.id)}>
              <span><i /> {matchup.status === "live" ? "LIVE" : matchup.status === "final" ? "FINAL" : `WEEK ${week}`} · {league.name}</span>
              <p><b>{matchup.mine.teamName}</b><ScoreWithProjection team={matchup.mine} precision={1} /></p>
              <p><b>{matchup.opponent.teamName}</b><ScoreWithProjection team={matchup.opponent} precision={1} /></p>
              <small><em>{matchup.winProbability == null ? "—" : `${matchup.winProbability}%`} WIN</em>{margin <= 12 && matchup.status === "live" ? "One-play range" : "Open details →"}</small>
            </button>;
          })}
        </div>
      </section>
      <section className="game-day-command panel">
        <header><div><span>GAME DAY COMMAND CENTER</span><h3>What matters across your portfolio</h3></div></header>
        <div className="game-day-metrics">
          <article><span>PROJECTED RECORD</span><strong>{gameDay.matchups.filter((item) => (item.winProbability ?? 0) >= 50).length}–{gameDay.matchups.filter((item) => (item.winProbability ?? 100) < 50).length}</strong><small>Based on estimated win probability</small></article>
          <article><span>CLOSE MATCHUPS</span><strong>{gameDay.matchups.filter((item) => Math.abs(item.mine.points + item.mineRemaining - item.opponent.points - item.opponentRemaining) <= 12).length}</strong><small>Projected margin within 12</small></article>
          <article><span>PLAYERS ACTIVE</span><strong>{gameDay.activePlayers}</strong><small>{gameDay.remainingPlayers} remaining · {gameDay.completedPlayers} completed</small></article>
          <article><span>HIGHEST LEVERAGE</span><strong>{gameDay.leveragePlayers[0]?.name ?? "Waiting for lineups"}</strong><small>{gameDay.leveragePlayers[0] ? `${gameDay.leveragePlayers[0].level} · ${gameDay.leveragePlayers[0].score}/100 attention score` : "No direct exposure yet"}</small></article>
        </div>
      </section>
      {featured && <section className="sunday-spotlight panel">
        <div className="spotlight-kicker"><span>{featured.status === "live" ? "● LIVE" : featured.status === "final" ? "FINAL" : "UP NEXT"}</span><small>MOST IMPORTANT MATCHUP</small><b title={featured.league.name}>{featured.league.name}</b></div>
        <div className="spotlight-team"><small>YOU</small><strong>{featured.mine.teamName}</strong><b>{featured.mine.points.toFixed(2)}</b></div>
        <div className="spotlight-versus spotlight-win-scale" aria-label={featured.winProbability == null ? "Estimated win probability unavailable" : `Estimated win probability ${featured.winProbability}%`}>
          <span>WIN PROBABILITY</span>
          <i role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={featured.winProbability ?? undefined}>
            {featured.winProbability != null && <b style={{ left: `${100 - featured.winProbability}%` }} />}
          </i>
          <small><em>YOU</em><strong>{featured.winProbability == null ? "—" : `${featured.winProbability}%`}</strong><em>OPP</em></small>
        </div>
        <div className="spotlight-team opponent"><small>OPPONENT</small><strong>{featured.opponent.teamName}</strong><b>{featured.opponent.points.toFixed(2)}</b></div>
        <div className="spotlight-footer">
          <div className="spotlight-story"><strong>{Math.abs((featured.winProbability ?? 50) - 50) <= 10 ? "One play can swing this matchup." : (featured.winProbability ?? 0) >= 50 ? "Protect the lead as the late window develops." : "Your comeback path is still alive."}</strong><small>{featured.mineRemaining.toFixed(1)} of your projected points and {featured.opponentRemaining.toFixed(1)} opponent points remain.</small></div>
          <button type="button" onClick={() => void onOpenLeague(featured.league)}>Watch matchup →</button>
        </div>
      </section>}
      <section className="portfolio-win-path panel">
        <header><div><span>WHAT DO I NEED?</span><h3>Your most important live win paths</h3><small>One consequential starter per league first, then the next-highest leverage players until five paths are filled.</small></div><b>{selectedWinPaths.length} ACTIVE PATH{selectedWinPaths.length === 1 ? "" : "S"}</b></header>
        {mostImportantPath ? <><div className="primary-win-path"><div className="win-path-player"><PlayerHeadshot id={mostImportantPath.target.id} position={mostImportantPath.target.position} /><i aria-hidden="true">!</i></div><p><span>MOST IMPORTANT RIGHT NOW</span><button className="inline-player-link" onClick={() => openPlayer(playerShell(mostImportantPath.target))}>{mostImportantPath.target.name}</button><small>{mostImportantPath.need.message} {mostImportantPath.target.name} carries the largest current share of the path.</small><span className="win-path-leagues">{mostImportantLeagues.map((item) => <b key={`${item.league.id}-${item.target.id}`}>{item.league.name} · {item.target.pointsNeeded.toFixed(1)} needed</b>)}</span></p><div><strong>{mostImportantPath.target.pointsNeeded.toFixed(1)}</strong><small>MORE PTS</small><span><i style={{ width: `${mostImportantPath.target.progress}%` }} /></span><em>{mostImportantPath.target.statLine}</em></div></div><div className="league-win-paths">{secondaryWinPaths.map((item) => <article key={`${item.league.id}-${item.target.id}`}><span className={item.status === "live" ? "live" : "upcoming"}>{item.status === "live" ? "● LIVE" : "UP NEXT"}</span><PlayerHeadshot id={item.target.id} position={item.target.position} /><p><strong>{item.league.name}</strong><button className="inline-player-link" onClick={() => openPlayer(playerShell(item.target))}>{item.target.name}</button><small>{item.target.pointsNeeded.toFixed(1)} more points · {item.winProbability ?? "—"}% win chance</small><span className="mini-win-progress"><i style={{ width: `${item.target.progress}%` }} /></span></p><b>{item.target.progress}%</b></article>)}</div></> : <p className="game-day-empty">A portfolio-wide win path will appear when connected matchups have remaining projected starters.</p>}
      </section>
      <section className="on-fire-board panel" data-visual-source={displayedOnFire === preKickoffOnFire && displayedOnFire.length ? "pre-kickoff" : "observed"}>
        <header><div><span>🔥 ON FIRE</span><h3>Week {week}&apos;s hottest performers</h3><small>{displayedOnFire === preKickoffOnFire && displayedOnFire.length ? "Projected impact leaders based on your connected lineups. Live scoring replaces this outlook automatically." : "Top production currently affecting your matchups across every connected league."}</small></div><b>{gameDay.onFire.length ? "LIVE LEADERS" : displayedOnFire.length ? "SUNDAY OUTLOOK" : "WAITING FOR KICKOFF"}</b></header>
        {displayedOnFire.length ? <div className="on-fire-grid">{displayedOnFire.map((item, index) => {
          const helps = item.leagues.filter((league) => league.side === "helps").length;
          const hurts = item.leagues.length - helps;
          return <button type="button" key={item.player.id} onClick={() => openPlayer(playerShell(item.player))}>
            <em>#{index + 1}</em><div className="fire-player-visual"><NflTeamLogo team={item.player.nflTeam} /><PlayerHeadshot id={item.player.id} position={item.player.position} /><i aria-hidden="true">🔥</i></div>
            <p><span>{item.temperature.label}</span><strong>{item.player.name}</strong><small>{item.status === "Projected" ? `${item.player.nflTeam} · ${item.player.position} · Live stats available after kickoff` : `${item.player.nflTeam} · ${item.player.position} · ${item.player.yards} YDS${item.player.touchdowns ? ` · ${item.player.touchdowns} TD` : ""}${item.player.targets ? ` · ${item.player.receptions}/${item.player.targets} REC` : ""}`}</small><span className="fire-leagues">{item.leagues.slice(0, 3).map((league) => <b className={league.side} key={`${item.player.id}-${league.id}`}>{league.side === "helps" ? "↑" : "↓"} {league.name}</b>)}</span></p>
            <div className="fire-score"><strong>{item.player.points.toFixed(1)}</strong><small>{item.status === "Projected" ? "PROJ PTS" : "PTS"}</small><span><i style={{ width: `${item.temperature.value}%` }} /></span><em>{helps ? `Helps in ${helps === 1 ? "one" : helps} league${helps === 1 ? "" : "s"}` : ""}{helps && hurts ? " · " : ""}{hurts ? `Hurts in ${hurts === 1 ? "one" : hurts} league${hurts === 1 ? "" : "s"}` : ""}</em></div>
          </button>;
        })}</div> : <p className="game-day-empty">Current weekly leaders will ignite here as players begin scoring.</p>}
      </section>
      <div className="game-day-insights">
        <section className="panel rooting-interests"><header><div><span>ROOTING INTERESTS</span><h3>Who to cheer—and who to stop</h3></div><b>📣 GAME-DAY PULSE</b></header><div className="insight-scroll-window">{gameDay.interests.length ? gameDay.interests.map((interest) => <article className={`rooting-${interest.sentiment}`} key={interest.playerId}><div className="rooting-visual"><NflTeamLogo team={interest.nflTeam} /><PlayerHeadshot id={interest.playerId} position={interest.position} /><i aria-hidden="true">{interest.sentiment === "cheer" ? "📣" : interest.sentiment === "fade" ? "🛑" : "⚖️"}</i></div><p><span>{interest.sentiment === "cheer" ? "ROOT FOR" : interest.sentiment === "fade" ? "ROOT AGAINST" : "MIXED ROOTING INTEREST"}</span><strong>{interest.playerName}</strong><small>{interest.text}</small><span className="rooting-leagues">{interest.affectedLeagues.map((league) => <b className={league.impact} key={`${interest.playerId}-${league.id}`}>{league.impact === "helps" ? "↑" : "↓"} {league.name}</b>)}</span></p><em><small>{interest.level}</small>{interest.score}</em></article>) : <p className="game-day-empty">Rooting interests appear when weekly lineups and projections are available.</p>}</div></section>
        <section className="panel sunday-swing" data-visual-source="observed"><header><div><span>SUNDAY SWING</span><h3>Observed this session</h3></div>{swingFeed.length > 0 && <b>LIVE MOVEMENT</b>}</header><div className="insight-scroll-window">{swingFeed.length ? swingFeed.map((item) => <article key={item.id}><b className={item.current >= item.previous ? "positive" : "negative"}>{item.current >= item.previous ? "↑" : "↓"} {Math.abs(item.current - item.previous)} pts</b><p><strong>{item.league}</strong><small>{item.text}</small></p><time>{item.at ? new Date(item.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "Now"}</time></article>) : <p className="game-day-empty">Waiting for live scoring. Win-probability swings of 5% or more will appear here once pro football games begin.</p>}</div></section>
      </div>
      <div className="portfolio-scoreboard-grid" id="league-matchups">
        {orderedLeagues.map((league) => {
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
            <article id={`portfolio-matchup-${league.id}`} className={`score-game portfolio-score-game ${matchup ? "my-game" : ""}`} key={league.id}>
              <header>
                <span className={matchup?.status === "Live" ? "game-live" : ""}>{matchup?.status === "Live" ? "● LIVE" : matchup?.status ?? `WEEK ${week}`}</span>
                <b>{league.name}</b>
              </header>
              {mine && opponent ? (
                <div className={`score-bug portfolio-score-bug ${winTone}`}>
                  <aside className="scorebug-probability" aria-label={winProbability == null ? "Estimated win probability unavailable" : `Estimated win probability ${winProbability}%`}>
                    <div>
                      <small>WIN PROBABILITY</small>
                      <strong>{winProbability == null ? "—" : `${winProbability}%`}</strong>
                      <span>{winOutlook}</span>
                    </div>
                    <i className="scorebug-probability-track" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={winProbability ?? undefined}>
                      {winProbability != null && <b style={{ left: `${100 - winProbability}%` }} />}
                    </i>
                    <footer><small>{mine.teamName}</small><small>{opponent.teamName}</small></footer>
                  </aside>
                  {[mine, opponent].map((team) => (
                    <div className={team.isMine ? "mine" : ""} key={team.rosterId}>
                      <span>{team.teamName.slice(0, 3).toUpperCase()}</span>
                      <p><strong>{team.teamName}</strong><small>{team.managerName}{team.isMine ? " · YOU" : ""}{leader === team.rosterId && <em className="score-leader"> · LEADING</em>}</small></p>
                      <ScoreWithProjection team={team} />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="portfolio-score-pending">{data ? `Your Week ${week} matchup has not been posted.` : loading ? "Loading your matchup…" : "This league’s scoreboard is unavailable."}</p>
              )}
              <div className="portfolio-score-scroll">
              {consequence?.status !== "final" && need && <section className={`what-needed ${expandedNeeds.has(league.id) ? "expanded" : "collapsed"}`}>
                <button className="need-collapse-toggle" type="button" aria-expanded={expandedNeeds.has(league.id)} onClick={() => setExpandedNeeds((current) => { const next = new Set(current); if (next.has(league.id)) next.delete(league.id); else next.add(league.id); return next; })}><span><i /> LIVE WIN PATH</span><strong>{need.teamNeed ? `${need.teamNeed.toFixed(1)} PTS NEEDED` : "PROJECTED LEAD"}</strong><em aria-hidden="true">⌄</em></button>
                {expandedNeeds.has(league.id) && <div className="need-expanded-content"><p>{need.message}</p>
                {need.targets.slice(0, 6).map((target) => <article key={target.id}><PlayerHeadshot id={target.id} position={target.position} /><div><div className="need-player-row"><button className="inline-player-link" onClick={() => openPlayer(playerShell(target))}>{target.name}</button><b>{target.progress}%</b></div><small>Needs about <b>{target.pointsNeeded.toFixed(1)} more points</b> · {target.statLine}</small><span className="need-progress"><i style={{ width: `${target.progress}%` }} /></span><em>{target.points.toFixed(1)} scored toward a {target.targetTotal.toFixed(1)} point target</em></div></article>)}</div>}
              </section>}
              {consequence?.status === "final" && <div className="postgame-review"><b>{consequence.mine.points > consequence.opponent.points ? "WIN" : consequence.mine.points < consequence.opponent.points ? "LOSS" : "TIE"}</b><p><strong>Postgame review</strong><small>{Math.abs(consequence.mine.points - consequence.opponent.points) <= 5 ? "A close final margin decided this matchup." : "The final scoring margin was decisive."} Results describe what happened, not whether the original lineup decision was sound.</small></p></div>}
              </div>
              <footer className="score-game-actions">
                {matchup && <button className="secondary" onClick={() => void onOpenMatchups(league, matchup.matchupId)}>Open Matchups</button>}
                <button onClick={() => void onOpenLeague(league)}>League scoreboard →</button>
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
  const [data, setData] = useState<ScoreboardData | null>(() =>
    readSessionCache<ScoreboardData>(
      `fantasy-hub-scoreboard:${leagueId}:${defaultWeek >= 1 && defaultWeek <= 18 ? defaultWeek : 1}:all`,
    ),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const cacheKey = `fantasy-hub-scoreboard:${leagueId}:${week}:all`;
    const cached = readSessionCache<ScoreboardData>(cacheKey);
    let hasCached = Boolean(cached);
    if (cached) setData(cached);
    else setData(null);
    const refresh = async () => {
      if (!hasCached) setLoading(true);
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
        writeSessionCache(cacheKey, payload);
        hasCached = true;
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
    const stopPolling = startVisiblePolling(refresh);
    return () => {
      active = false;
      stopPolling();
    };
  }, [leagueId, week]);

  if (!leagueId)
    return (
      <div className="page-content">
        <SectionIntro
          kicker="FANTASY SCOREBOARD"
          title="Choose a league to see every matchup"
          text="Select one of your connected leagues above and the live scoreboard will identify your matchup automatically."
        />
        <section className="panel scoreboard-empty">
          No league selected.
        </section>
      </div>
    );
  return (
    <div className="page-content league-scoreboard-page">
      <section className="scoreboard-head">
        <div>
          <span>FANTASY SCOREBOARD</span>
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
                        {leader === team.rosterId && <em className="score-leader"> · LEADING</em>}
                      </small>
                    </p>
                    <ScoreWithProjection team={team} />
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
  players,
}: {
  leagueId: string;
  season: string;
  defaultWeek: number;
  players: Player[];
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
      return current.has(gameId) ? new Set() : new Set([gameId]);
    });
  };

  useEffect(() => {
    if (!expandedGames.size) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpandedGames(new Set());
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [expandedGames]);

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
          throw new Error(payload.error ?? "Pro football games unavailable");
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
          const games = (selectedWeek?.games ?? []).map((game) => {
            const gameTeamCodes = [normalizeNflTeam(game.away.abbreviation), normalizeNflTeam(game.home.abbreviation)];
            const impactPlayers: NflImpactPlayer[] = PRE_KICKOFF_VISUALS_ENABLED
              ? players
                  .filter((player) => gameTeamCodes.includes(normalizeNflTeam(player.team)))
                  .map((player) => ({ id: player.id, name: player.name, position: player.position, nflTeam: normalizeNflTeam(player.team), side: "You" as const, starter: isStartingPlayer(player), fantasyPoints: 0, projection: player.leagueProjection ?? player.projection ?? null, remainingProjection: player.leagueProjection ?? player.projection ?? 0 }))
              : [];
            return ({
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
            impactPlayers,
          });
          });
          if (!active) return;
          setData({
            league: { name: "Pro Football Schedule", season: String(schedule.season) },
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
                : "Pro football games unavailable",
            );
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void refresh();
    const stopPolling = startVisiblePolling(refresh);
    return () => {
      active = false;
      stopPolling();
    };
  }, [leagueId, players, season, week]);

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
          <span>GAME DAY LIVE</span>
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
            The published season schedule is active. Scores, player impact, and
            matchup context will fill in automatically as games begin.
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
            {data.fantasyMatchup.playerCount} players mapped to pro football games
          </small>
        </section>
      ) : (
        data && (
          <section className="fantasy-matchup-pending">
            Fantasy matchup details have not been posted for Week {data.week}.
            The complete pro football slate is still available below.
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
                  <span className="nfl-score-team-logo">
                    <NflTeamLogo team={team.abbreviation} />
                  </span>
                  <p style={{ backgroundColor: `#${team.color}` }}>
                    <strong>{team.displayName}</strong>
                    <small>
                      {team.record ? `${team.record} · ` : ""}
                      {team.homeAway === "home" ? "HOME" : "AWAY"}
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
                    <strong>{isExpanded ? "Matchup details open" : "Open matchup details"}</strong>
                    <small>
                      <b>{yourPlayerCount}</b> your team ·{" "}
                      <b>{opponentPlayerCount}</b> opponent · {game.impactPlayers.length} total
                    </small>
                  </span>
                </button>
                {isExpanded && (
                  <div className="impact-roster-expanded game-impact-popout" id={playerPanelId} role="dialog" aria-modal="true" aria-label={`${game.name} fantasy matchup impact`}>
                    <header className="game-popout-header"><div><span>FANTASY MATCHUP IMPACT</span><strong>{game.name}</strong><small>{yourPlayerCount} your players · {opponentPlayerCount} opponent players</small></div><button type="button" aria-label="Close matchup details" onClick={() => toggleGamePlayers(game.id)}>×</button></header>
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
          No regular-season pro football games were returned for Week {data.week}.
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

function RedraftAnalytics({ players, rankings, context, setSelectedPlayer }: { players: Player[]; rankings: LeagueRanking[]; context: RankingContext | null; setSelectedPlayer: (player: Player) => void }) {
  const starters = players.filter(isStartingPlayer);
  const bench = players.filter((player) => !isStartingPlayer(player));
  const ranges = starters.map((player) => ({ player, range: matchupAdjustedRange(player) }));
  const projection = starters.reduce((sum, player) => sum + player.projection, 0);
  const floor = ranges.reduce((sum, item) => sum + item.range.floor, 0);
  const ceiling = ranges.reduce((sum, item) => sum + item.range.ceiling, 0);
  const injuryRisks = players.filter((player) => !/healthy/i.test(player.status));
  const usableDepth = bench.filter((player) => player.projection >= 5 && !/out|suspended/i.test(player.status));
  const rankingById = new Map(rankings.map((player) => [player.id, player]));
  const positions = ["QB", "RB", "WR", "TE"];
  const roomAnalytics = positions.map((position) => {
    const room = players.filter((player) => player.position === position).sort((a, b) => b.projection - a.projection);
    const projected = room.reduce((sum, player) => sum + player.projection, 0);
    const bestRank = Math.min(...room.map((player) => rankingById.get(player.id)?.overallRank ?? 9999));
    return { position, room, projected, bestRank };
  });
  const strengths = [...starters].sort((a, b) => b.projection - a.projection).slice(0, 6);
  const volatilityWatch = [...ranges].sort((a, b) => (b.range.ceiling - b.range.floor) - (a.range.ceiling - a.range.floor)).slice(0, 6);
  const requiredSlots = (context?.rosterSlots ?? []).filter((slot) => slot !== "BN").length;
  const emptySlots = Math.max(0, requiredSlots - starters.length);
  const posture = emptySlots ? "Repair the active lineup first" : injuryRisks.length >= 3 ? "Protect weekly availability" : usableDepth.length < 3 ? "Add playable bench depth" : "Press weekly matchup advantages";
  return <div className="page-content dynasty-page league-analytics-redraft">
    <section className="dynasty-hero"><div><span>REDRAFT ANALYTICS</span><h2>{posture}</h2><p>Weekly projection ranges, lineup availability, usable depth, positional concentration, and league-adjusted ranks shape this season’s roster plan.</p></div><div className="window-score"><small>LINEUP MEDIAN</small><strong>{projection.toFixed(1)}</strong><span>{floor.toFixed(1)} floor · {ceiling.toFixed(1)} ceiling</span></div></section>
    <div className="dynasty-metrics"><Metric label="Starting projection" value={projection.toFixed(1)} detail={`${starters.length} active lineup players`} tone="good"/><Metric label="Playable depth" value={String(usableDepth.length)} detail="Bench players projected for 5+ points" tone={usableDepth.length >= 3 ? "good" : "warn"}/><Metric label="Availability flags" value={String(injuryRisks.length)} detail="Injury or suspension designations" tone={injuryRisks.length ? "warn" : "good"}/><Metric label="Empty starters" value={String(emptySlots)} detail="Unfilled required lineup slots" tone={emptySlots ? "warn" : "good"}/></div>
    <div className="dynasty-main"><section className="panel dynasty-trajectory"><Header eyebrow="WEEKLY OUTCOME RANGE" title="How wide is this lineup’s path?"/><div className="redraft-range"><span style={{ width: `${Math.min(100, (floor / Math.max(ceiling, 1)) * 100)}%` }}/><i style={{ left: `${Math.min(96, (projection / Math.max(ceiling, 1)) * 100)}%` }}/></div><div className="redraft-range-labels"><b>Floor {floor.toFixed(1)}</b><b>Median {projection.toFixed(1)}</b><b>Ceiling {ceiling.toFixed(1)}</b></div><p>A wider range creates comeback upside but increases the chance of a low weekly result. Start/Sit aggressiveness decides which part of this distribution matters most.</p></section><section className="panel dynasty-allocation"><Header eyebrow="POSITION ROOMS" title="Where this roster’s points live"/><div className="allocation-grid">{roomAnalytics.map((room) => <article key={room.position}><strong>{room.position}</strong><span>{room.room.length} players · {room.bestRank < 9999 ? `best asset #${room.bestRank}` : "rank pending"}</span><div><i className="prime" style={{ width: `${Math.min(100, room.projected * 2)}%` }}/></div><small>{room.projected.toFixed(1)} combined projected points</small></article>)}</div></section></div>
    <div className="dynasty-lists"><section className="panel"><Header eyebrow="WEEKLY FOUNDATIONS" title="Players carrying the median"/><p className="model-caveat">These are the largest current contributors to the connected platform’s weekly lineup projection.</p><div className="dynasty-player-list">{strengths.map((player) => <button key={player.id} onClick={() => setSelectedPlayer(player)}><span className={`pos pos-${player.position.toLowerCase()}`}>{player.position}</span><p><strong>{player.name}</strong><small>{player.team} · {formatRosterSlot(player.role)}</small></p><b>{player.projection.toFixed(1)}<small>Projected points</small></b><em className="core">Foundation</em></button>)}</div></section><section className="panel"><Header eyebrow="VOLATILITY WATCH" title="Players who can swing the week"/><p className="model-caveat">Large floor-to-ceiling ranges can help an underdog and hurt a favorite. This is role variance, not a recommendation to bench the player.</p><div className="dynasty-player-list">{volatilityWatch.map(({ player, range }) => <button key={player.id} onClick={() => setSelectedPlayer(player)}><span className={`pos pos-${player.position.toLowerCase()}`}>{player.position}</span><p><strong>{player.name}</strong><small>{range.floor.toFixed(1)} floor · {range.ceiling.toFixed(1)} ceiling</small></p><b>{(range.ceiling - range.floor).toFixed(1)}<small>Point range</small></b><em className="watch">Monitor</em></button>)}</div></section></div>
    <section className="panel dynasty-plan"><Header eyebrow="SEASON PLAYBOOK" title="Three redraft management priorities"/><div><article className="analytics-route-card"><b>01</b><span><strong>{emptySlots ? "Fill every active lineup slot" : "Keep the weekly lineup optimized"}</strong><p>{emptySlots ? `${emptySlots} required starter slot${emptySlots === 1 ? " is" : "s are"} currently empty.` : "Revisit close calls as projections, injuries, weather, and matchup strength update."}</p></span><em>Before kickoff</em></article><article className="analytics-route-card"><b>02</b><span><strong>{injuryRisks.length ? "Build an availability contingency" : "Preserve healthy depth"}</strong><p>{injuryRisks.length ? `${injuryRisks.length} roster players carry a current availability flag. Avoid waiting until kickoff windows close.` : "No current availability flags require an emergency move; maintain flexible bench coverage."}</p></span><em>This week</em></article><article className="analytics-route-card"><b>03</b><span><strong>{usableDepth.length < 3 ? "Upgrade playable depth" : "Use depth to attack weaknesses"}</strong><p>{usableDepth.length < 3 ? "The bench has limited credible weekly replacements. Prioritize waivers with immediate roles." : "Your bench can absorb normal volatility. Explore trades that consolidate depth into stronger starters."}</p></span><em>Ongoing</em></article></div></section>
  </div>;
}

function LeagueAnalytics({
  players,
  teams,
  selectedTeamId,
  rankings,
  context,
  setSelectedPlayer,
}: {
  players: Player[];
  teams: LeagueTeam[];
  selectedTeamId: string;
  rankings: LeagueRanking[];
  context: RankingContext | null;
  setSelectedPlayer: (player: Player) => void;
}) {
  const [expandedAssetPosition, setExpandedAssetPosition] = useState<string | null>(null);
  const isDynasty = context?.format === "Dynasty";
  if (!isDynasty) return <RedraftAnalytics players={players} rankings={rankings} context={context} setSelectedPlayer={setSelectedPlayer} />;
  const rosterIds = new Set(players.map((player) => player.id));
  const rankingById = new Map(rankings.map((player) => [player.id, player]));
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
  const assetValue = (rank: number) =>
    Math.max(24, Math.min(98, 106 - Math.log2(rank + 1) * 10.5));
  const maxDraftScore = Math.max(
    0,
    ...teams.map((team) => team.draftCapital?.score ?? 0),
  );
  const scoreTeamWindow = (team: LeagueTeam) => {
    const rankedRoster = team.roster.flatMap((player) => {
      const ranking = rankingById.get(player.id);
      return ranking ? [{ player, ranking }] : [];
    });
    const startingValues = rankedRoster
      .filter(({ player }) => isStartingPlayer(player))
      .map(({ ranking }) => assetValue(ranking.overallRank));
    const depthValues = rankedRoster
      .filter(({ player }) => !isStartingPlayer(player))
      .map(({ ranking }) => assetValue(ranking.overallRank))
      .sort((a, b) => b - a)
      .slice(0, 5);
    const futureValues = rankedRoster
      .filter(({ ranking }) => ranking.position !== "K" && ranking.position !== "DEF")
      .sort((a, b) => a.ranking.overallRank - b.ranking.overallRank)
      .slice(0, 10)
      .map(({ ranking }) => {
        const curve = dynastyCurves[ranking.position] ?? { peakEnd: 29, annualDecline: 2.5 };
        const runway = Math.max(30, Math.min(98, 64 + (curve.peakEnd - (ranking.age ?? curve.peakEnd)) * 7));
        return assetValue(ranking.overallRank) * .68 + runway * .32;
      });
    const average = (values: number[], fallback: number) =>
      values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : fallback;
    const starterScore = average(startingValues, 45);
    const depthScore = average(depthValues, 42);
    const futureScore = average(futureValues, 45);
    const draftScore = maxDraftScore > 0
      ? 35 + ((team.draftCapital?.score ?? 0) / maxDraftScore) * 65
      : 50;
    return { starterScore, depthScore, futureScore, draftScore };
  };
  const rawLeagueWindowScores = teams.map((team) => ({ team, ...scoreTeamWindow(team) }));
  const windowStarterScores = rawLeagueWindowScores.map((team) => team.starterScore);
  const windowDepthScores = rawLeagueWindowScores.map((team) => team.depthScore);
  const windowFutureScores = rawLeagueWindowScores.map((team) => team.futureScore);
  const leagueWindowScores = rawLeagueWindowScores
    .map((team) => {
      const starterScore = leagueRelativeGrade(team.starterScore, windowStarterScores);
      const depthScore = leagueRelativeGrade(team.depthScore, windowDepthScores);
      const futureScore = leagueRelativeGrade(team.futureScore, windowFutureScores);
      return {
        ...team,
        starterScore,
        depthScore,
        futureScore,
        score: Math.round(Math.max(20, Math.min(99, starterScore * .58 + depthScore * .16 + futureScore * .18 + team.draftScore * .08))),
      };
    })
    .sort((a, b) => b.score - a.score);
  const selectedWindow = leagueWindowScores.find(({ team }) => team.id === selectedTeamId);
  const baseStrength = selectedWindow?.score ?? 50;
  const leagueAverage = leagueWindowScores.length
    ? leagueWindowScores.reduce((sum, team) => sum + team.score, 0) / leagueWindowScores.length
    : baseStrength;
  const leagueWindowRank = Math.max(1, leagueWindowScores.findIndex(({ team }) => team.id === selectedTeamId) + 1);
  const starterScoreMean = windowStarterScores.length
    ? windowStarterScores.reduce((sum, value) => sum + value, 0) / windowStarterScores.length
    : 0;
  const starterScoreSpread = Math.sqrt(
    windowStarterScores.reduce((sum, value) => sum + (value - starterScoreMean) ** 2, 0) /
      Math.max(1, windowStarterScores.length),
  );
  const projectedStarterValue = (year: number) => starters.length
    ? starters.reduce((sum, player) => {
        const futureAge = (player.age ?? player.curve.peakEnd) + year;
        const decline = Math.max(0, futureAge - player.curve.peakEnd) * player.curve.annualDecline;
        const development = futureAge <= player.curve.peakEnd - 3 ? Math.min(5, year * 1.3) : 0;
        return sum + Math.max(15, assetValue(player.overallRank) - decline + development);
      }, 0) / starters.length
    : 0;
  const currentProjectedStarterValue = projectedStarterValue(0);
  const outlook = [0, 1, 2, 3].map((year) => {
    const futureStarterValue = projectedStarterValue(year);
    const starterGradeMovement = starters.length
      ? ((futureStarterValue - currentProjectedStarterValue) / Math.max(6, starterScoreSpread)) * 12
      : 0;
    // The first bar is the current window score. Future bars only apply the
    // league-scaled change from aging and development to that same baseline.
    const score = year === 0 ? baseStrength : baseStrength + starterGradeMovement * .58;
    return {
      year: new Date().getUTCFullYear() + year,
      score: Math.round(Math.min(99, Math.max(20, score))),
    };
  });
  const trajectory = outlook[3].score - outlook[0].score;
  const windowLabel = baseStrength >= 78 && leagueWindowRank <= Math.max(3, Math.ceil(teams.length * .3))
    ? "Championship window"
    : baseStrength >= 68
      ? "Contending window"
      : baseStrength >= 58
        ? "Fringe / retool window"
        : "Build window";
  const driverValue = (player: (typeof assets)[number]) => {
    const runway = Math.max(30, Math.min(98, 64 + player.yearsToCliff * 7));
    return assetValue(player.overallRank) * .72 + runway * .28;
  };
  const windowDrivers = [...assets]
    .filter((player) => player.position !== "K" && player.position !== "DEF")
    .sort((a, b) => driverValue(b) - driverValue(a));
  const positiveDrivers = windowDrivers.slice(0, 3);
  const pressureDrivers = [...starters]
    .filter((player) => player.position !== "K" && player.position !== "DEF")
    .sort((a, b) => driverValue(a) - driverValue(b))
    .slice(0, 3);
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
          <small>DYNASTY WINDOW SCORE</small>
          <strong>{Math.round(baseStrength)}<i>/100</i></strong>
          <b>{windowLabel}</b>
          <span>#{leagueWindowRank} of {teams.length || 1} · League avg. {leagueAverage.toFixed(0)}</span>
        </div>
      </section>
      <section className="window-context panel">
        <div className="window-context-summary">
          <span>WHY YOUR SCORE IS {Math.round(baseStrength)} / 100</span>
          <strong>{windowLabel} · #{leagueWindowRank} in this league</strong>
          <small>{baseStrength >= leagueAverage ? `${(baseStrength - leagueAverage).toFixed(0)} points above the ${leagueAverage.toFixed(0)} league average.` : `${(leagueAverage - baseStrength).toFixed(0)} points below the ${leagueAverage.toFixed(0)} league average.`} Higher scores indicate a stronger combination of current contention and future roster runway.</small>
          <div className="window-score-breakdown">
            <article><b>{Math.round(selectedWindow?.starterScore ?? 45)}<i>/100</i></b><span>Starters</span><small>58% of score</small></article>
            <article><b>{Math.round(selectedWindow?.depthScore ?? 42)}<i>/100</i></b><span>Depth</span><small>16% of score</small></article>
            <article><b>{Math.round(selectedWindow?.futureScore ?? 45)}<i>/100</i></b><span>Core runway</span><small>18% of score</small></article>
            <article><b>{Math.round(selectedWindow?.draftScore ?? 50)}<i>/100</i></b><span>Draft capital</span><small>8% of score</small></article>
          </div>
          <div className="window-scale"><i style={{ left: `${baseStrength}%` }} /><span>Build &lt;58</span><span>Fringe 58–67</span><span>Contend 68–77</span><span>Title 78+</span></div>
        </div>
        <div className="window-driver-list positive">
          <span>WINDOW LIFTERS</span>
          {positiveDrivers.map((player) => <button key={`lift-${player.id}`} onClick={() => setSelectedPlayer(player)}><strong>{player.name}</strong><small>{player.positionRank ? `${player.position}${player.positionRank}` : player.position} · {player.phase}</small></button>)}
        </div>
        <div className="window-driver-list pressure">
          <span>WINDOW PRESSURE</span>
          {pressureDrivers.map((player) => <button key={`pressure-${player.id}`} onClick={() => setSelectedPlayer(player)}><strong>{player.name}</strong><small>{player.positionRank ? `${player.position}${player.positionRank}` : player.position} · {player.phase}</small></button>)}
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
              ).sort((a, b) => a.overallRank - b.overallRank);
              const prime = room.filter(
                (player) => player.phase === "Prime",
              ).length;
              const development = room.filter(
                (player) => player.phase === "Development",
              ).length;
              const cliff = room.filter(
                (player) => player.phase === "Cliff watch",
              ).length;
              const expanded = expandedAssetPosition === position;
              return (
                <Fragment key={position}>
                <button className="asset-allocation-toggle" type="button" aria-expanded={expanded} aria-controls={`asset-room-${position.toLowerCase()}`} onClick={() => setExpandedAssetPosition(expanded ? null : position)}>
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
                  <em aria-hidden="true">{expanded ? "−" : "+"}</em>
                </button>
                {expanded && <div className="asset-position-roster" id={`asset-room-${position.toLowerCase()}`}>
                  <header><span>{position} ASSETS</span><b>{room.length} PLAYERS</b></header>
                  {room.map((player) => {
                    const rosterPlayer = players.find((candidate) => candidate.id === player.id);
                    return <button type="button" key={`allocation-${player.id}`} onClick={() => setSelectedPlayer(player)}><span className={`pos pos-${position.toLowerCase()}`}>{position}</span><p><strong>{player.name}</strong><small>Age {player.age ?? "—"} · {player.phase} · {rosterPlayer ? formatRosterSlot(rosterPlayer.role) : "Roster"}</small></p><b>#{player.positionRank ?? "—"}<small>{position} rank · Overall #{player.overallRank}</small></b><em>View player →</em></button>;
                  })}
                  {!room.length && <p>No {position} assets are currently rostered.</p>}
                </div>}
                </Fragment>
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
            <article className="analytics-route-card" key={priority.title}>
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
          view: "Trade Lab" as View,
        }
      : {
          title: "Preserve the clean age curve",
          detail:
            "No immediate cliff concentration is present. Avoid replacing useful prime production simply to become younger.",
          horizon: "Ongoing",
          view: "Player Rankings" as View,
        },
    firstCore
      ? {
          title: `Build the next window around ${firstCore.name}`,
          detail: `The roster’s strongest combination of league-adjusted value and runway should anchor multi-year trade decisions. Avoid exchanging that runway for marginal weekly gains.`,
          horizon: "2–3 years",
          view: "Player Rankings" as View,
        }
      : {
          title: "Acquire one foundational young asset",
          detail:
            "The roster lacks a clear high-value player with three or more seasons of modeled runway. Prioritize quality over collecting low-upside youth.",
          horizon: "Next market",
          view: "Trade Lab" as View,
        },
    trajectory < -5
      ? {
          title: "Reduce synchronized decline risk",
          detail: `The starter window falls ${Math.abs(trajectory)} points over three years. Stagger veteran exits so several positions do not lose value in the same offseason.`,
          horizon: "Before decline",
          view: "Trade Lab" as View,
        }
      : {
          title: "Use depth to extend the competitive window",
          detail: `The three-year window is stable. Convert excess concentration${(positionCounts.WR ?? 0) >= 6 ? " at wide receiver" : " in deep rooms"} into scarcer starting value or future flexibility.`,
          horizon: "Trade window",
          view: "Trade Lab" as View,
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
  leagueTeams,
  selectedTeamId,
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
  leagueTeams: LeagueTeam[];
  selectedTeamId: string;
}) {
  const projectionPlatform = useContext(ProjectionPlatformContext);
  const [scenario, setScenario] = useState<"safe" | "balanced" | "upside">("balanced");
  const [commandChanges, setCommandChanges] = useState<string[]>([]);
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
  const starters = players.filter(isStartingPlayer);
  const bench = players.filter((player) => !isStartingPlayer(player));
  const lineupFloor = starters.reduce((sum, player) => sum + player.floor, 0);
  const selectedTeam = leagueTeams.find((team) => team.id === selectedTeamId);
  const opponentTeam = selectedTeam?.matchupId == null
    ? null
    : leagueTeams.find((team) => team.id !== selectedTeam.id && team.matchupId === selectedTeam.matchupId) ?? null;
  const teamProjection = (team: LeagueTeam) => team.roster.filter(isStartingPlayer).reduce((sum, player) => sum + player.projection, 0);
  const opponentProjection = opponentTeam ? teamProjection(opponentTeam) : null;
  const projectedRank = leagueTeams.length
    ? [...leagueTeams].sort((a, b) => teamProjection(b) - teamProjection(a)).findIndex((team) => team.id === selectedTeamId) + 1
    : 0;
  const projectedMargin = opponentProjection == null ? null : totals.projection - opponentProjection;
  const winProbability = projectedMargin == null
    ? null
    : Math.round(Math.max(8, Math.min(92, 50 + projectedMargin * 2.15)));
  const requiredStarters = context?.rosterSlots.filter((slot) => !["BN", "BE", "Bench", "IR", "TAXI"].includes(slot)).length ?? starters.length;
  const emptySlots = Math.max(0, requiredStarters - starters.length);
  const unavailable = players.filter((player) => /out|ir|suspend|doubt/i.test(player.status));
  const monitored = players.filter((player) => /question/i.test(player.status));
  const healthScore = Math.max(0, 100 - unavailable.length * 18 - monitored.length * 6 - emptySlots * 15);
  const scenarioPool = starters.filter((player) => !/out|ir|suspend|doubt/i.test(player.status));
  const balancedAnchor = [...scenarioPool].sort((a, b) => b.projection - a.projection)[0] ?? null;
  const safeAnchor = [...scenarioPool]
    .filter((player) => player.id !== balancedAnchor?.id)
    .sort((a, b) => b.floor - a.floor)[0] ?? balancedAnchor;
  const upsideAnchor = [...scenarioPool]
    .filter((player) => player.id !== balancedAnchor?.id && player.id !== safeAnchor?.id)
    .sort((a, b) => b.ceiling - a.ceiling)[0] ?? [...scenarioPool]
      .filter((player) => player.id !== balancedAnchor?.id)
      .sort((a, b) => b.ceiling - a.ceiling)[0] ?? balancedAnchor;
  const scenarioPlayer = scenario === "safe" ? safeAnchor : scenario === "upside" ? upsideAnchor : balancedAnchor;
  const scenarioLineupProjection = totals.projection;
  const scenarioFloor = lineupFloor;
  const scenarioCeiling = totals.ceiling;
  const scenarioProjection = scenario === "safe"
    ? scenarioFloor + (scenarioLineupProjection - scenarioFloor) * 0.72
    : scenario === "upside"
      ? scenarioLineupProjection + (scenarioCeiling - scenarioLineupProjection) * 0.45
      : scenarioLineupProjection;
  const scenarioWinProbability = opponentProjection == null
    ? null
    : Math.round(Math.max(8, Math.min(92, 50 + (scenarioProjection - opponentProjection) * 2.15)));
  const positionOrder = ["QB", "RB", "WR", "TE", "FLEX"];
  const positionTotal = (roster: Player[], position: string) => roster
    .filter(isStartingPlayer)
    .filter((player) => position === "FLEX" ? ["RB", "WR", "TE"].includes(player.position) && /flex/i.test(player.role) : player.position === position)
    .reduce((sum, player) => sum + player.projection, 0);
  const positionEdges = positionOrder.map((position) => {
    const mine = positionTotal(players, position);
    const theirs = opponentTeam ? positionTotal(opponentTeam.roster, position) : 0;
    return { position, mine, theirs, edge: mine - theirs };
  }).filter((item) => item.mine > 0 || item.theirs > 0);
  const bestBench = [...bench].filter((player) => !/out|ir|suspend/i.test(player.status)).sort((a, b) => b.projection - a.projection)[0];
  const trendWatch = [...players].filter((player) => player.trend !== 0).sort((a, b) => Math.abs(b.trend) - Math.abs(a.trend)).slice(0, 4);
  const actions = [
    ...(emptySlots ? [{ level: "ACT NOW", title: `Fill ${emptySlots} empty starter slot${emptySlots === 1 ? "" : "s"}`, detail: "An incomplete lineup creates an avoidable zero.", view: "My Team" as View }] : []),
    ...(unavailable[0] ? [{ level: "ACT NOW", title: `Replace or monitor ${unavailable[0].name}`, detail: `${unavailable[0].status} status threatens the current roster plan.`, view: "Start / Sit" as View }] : []),
    ...(decision ? [{ level: "BEFORE KICKOFF", title: `Resolve ${primaryDecision!.name} vs ${secondaryDecision!.name}`, detail: `${Math.abs(primaryDecision!.projection - secondaryDecision!.projection).toFixed(1)} points separate the current options.`, view: "Start / Sit" as View }] : []),
    ...(waiverPlans[0] ? [{ level: "THIS WEEK", title: `Consider ${waiverPlans[0].add.name}`, detail: `Add for ${waiverPlans[0].plan.drop!.name} if the role remains available.`, view: "Waiver Wire" as View }] : []),
  ].slice(0, 3);
  useEffect(() => {
    if (!selectedTeamId) return;
    const storageKey = `fantasy-hub:command-snapshot:${selectedTeamId}`;
    const nextSnapshot = {
      projection: Number(totals.projection.toFixed(1)),
      healthScore,
      concern: concern?.name ?? null,
      waiver: waiverPlans[0]?.add.name ?? null,
      opponent: opponentTeam?.teamName ?? null,
    };
    try {
      const prior = JSON.parse(window.localStorage.getItem(storageKey) ?? "null") as typeof nextSnapshot | null;
      const changes: string[] = [];
      if (prior) {
        const projectionChange = nextSnapshot.projection - prior.projection;
        if (Math.abs(projectionChange) >= 0.1)
          changes.push(`Lineup projection ${projectionChange > 0 ? "rose" : "fell"} ${Math.abs(projectionChange).toFixed(1)} points.`);
        if (nextSnapshot.healthScore !== prior.healthScore)
          changes.push(`Lineup health moved from ${prior.healthScore} to ${nextSnapshot.healthScore}.`);
        if (nextSnapshot.concern !== prior.concern)
          changes.push(nextSnapshot.concern ? `${nextSnapshot.concern} now requires availability monitoring.` : "The previous availability concern has cleared.");
        if (nextSnapshot.waiver && nextSnapshot.waiver !== prior.waiver)
          changes.push(`${nextSnapshot.waiver} is now the leading actionable waiver option.`);
        if (nextSnapshot.opponent !== prior.opponent && nextSnapshot.opponent)
          changes.push(`The active matchup is now against ${nextSnapshot.opponent}.`);
      }
      setCommandChanges(changes.slice(0, 4));
      window.localStorage.setItem(storageKey, JSON.stringify(nextSnapshot));
    } catch {
      setCommandChanges([]);
    }
  }, [selectedTeamId, totals.projection, healthScore, concern?.name, waiverPlans[0]?.add.name, opponentTeam?.teamName]);
  return (
    <div className="page-content command-center-page">
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
          value={winProbability == null ? "—" : `${winProbability}%`}
          detail={opponentTeam ? `vs ${opponentTeam.teamName}` : "Opponent matchup pending"}
          tone={winProbability != null && winProbability >= 55 ? "good" : winProbability != null && winProbability < 45 ? "warn" : ""}
        />
        <Metric
          label="Projected rank"
          value={projectedRank > 0 ? `#${projectedRank}` : "—"}
          detail={`of ${leagueTeams.length || context?.teams || "—"} teams this week`}
        />
        <Metric
          label="Lineup range"
          value={`${lineupFloor.toFixed(0)}–${totals.ceiling.toFixed(0)}`}
          detail={`${totals.projection.toFixed(1)} median projection`}
        />
        <Metric
          label="Lineup health"
          value={String(healthScore)}
          detail={concern ? `Monitor ${concern.name}` : emptySlots ? `${emptySlots} empty starter slot` : "No active concerns"}
          tone={healthScore >= 90 ? "good" : "warn"}
        />
      </div>
      <section className="panel command-matchup-strip">
        <div><span>THIS WEEK</span><strong>{selectedTeam?.teamName ?? "Your team"}</strong><b>{totals.projection.toFixed(1)}</b></div>
        <i><small>{projectedMargin == null ? "MATCHUP PENDING" : `${projectedMargin >= 0 ? "+" : ""}${projectedMargin.toFixed(1)} PROJECTED`}</small><em style={{ left: `${100 - (winProbability ?? 50)}%` }} /></i>
        <div className="opponent"><span>OPPONENT</span><strong>{opponentTeam?.teamName ?? "Awaiting opponent"}</strong><b>{opponentProjection?.toFixed(1) ?? "—"}</b></div>
      </section>
      <section className="panel command-action-queue">
        <Header eyebrow="NEXT BEST ACTIONS" title="Your league-specific game plan" action="Open team" onClick={() => setView("My Team")} />
        <div>{actions.length ? actions.map((action, index) => <button key={action.title} onClick={() => setView(action.view)}><b>0{index + 1}</b><span><em>{action.level}</em><strong>{action.title}</strong><small>{action.detail}</small></span><i>→</i></button>) : <p><b>✓</b><span><strong>No urgent action required</strong><small>Your active lineup passes the current availability and replacement scan.</small></span></p>}</div>
      </section>
      <div className="command-briefing-grid">
        <section className="panel command-what-changed">
          <Header eyebrow="SINCE YOUR LAST CHECK" title="What changed" />
          {commandChanges.length ? <div>{commandChanges.map((change, index) => <p key={change}><b>{index + 1}</b><span>{change}</span></p>)}</div> : <div className="command-no-change"><b>✓</b><span><strong>No material changes</strong><small>Your projection, availability, matchup, and waiver priorities are holding steady.</small></span></div>}
        </section>
        <section className="panel command-scenarios">
          <Header eyebrow="LINEUP APPROACH" title="Choose your scenario" />
          <div className="command-scenario-toggle" role="group" aria-label="Lineup scenario">
            {(["safe", "balanced", "upside"] as const).map((option) => <button key={option} className={scenario === option ? "active" : ""} onClick={() => setScenario(option)}>{option}</button>)}
          </div>
          <div className="command-scenario-result">
            <span><small>SCENARIO SCORE</small><b>{scenarioProjection.toFixed(1)}</b></span>
            <span><small>RANGE</small><b>{scenarioFloor.toFixed(0)}–{scenarioCeiling.toFixed(0)}</b></span>
            <span><small>WIN ODDS</small><b>{scenarioWinProbability == null ? "—" : `${scenarioWinProbability}%`}</b></span>
          </div>
          <p>{scenarioPlayer ? <><strong>{scenario === "safe" ? "Best floor anchor" : scenario === "upside" ? "Best ceiling anchor" : "Best median anchor"}: {scenarioPlayer.name}</strong><small>{scenario === "safe" ? `${scenarioPlayer.floor.toFixed(1)}-point floor anchors the stable path.` : scenario === "upside" ? `${scenarioPlayer.ceiling.toFixed(1)}-point ceiling drives the aggressive path.` : `${scenarioPlayer.projection.toFixed(1)} projected points lead the balanced path.`}</small></> : <><strong>Current lineup retained</strong><small>No active starter is available to anchor this scenario.</small></>}</p>
        </section>
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
                {topMatchupEdge.player.opponent} ranks #{topMatchupEdge.player.matchupStrength!.rank} in {matchupPointsLabel(matchupPosition(topMatchupEdge.player.position))}. The {projectionPlatform} projection remains the median; Fantasy Hub adjusts the outcome range used by Start/Sit.
              </p>
              <div>
                <span>Floor <b>{topMatchupEdge.player.floor.toFixed(1)} → {topMatchupEdge.range.floor.toFixed(1)}</b></span>
                <span>Ceiling <b>{topMatchupEdge.player.ceiling.toFixed(1)} → {topMatchupEdge.range.ceiling.toFixed(1)}</b></span>
              </div>
            </>
          ) : (
            <p>Opponent rankings will appear after the pro football schedule maps this roster to a supported position matchup.</p>
          )}
        </section>
      </div>
      <div className="command-intelligence-grid">
        <section className="panel command-position-edges">
          <Header eyebrow="POSITION ADVANTAGE" title="Where this matchup tilts" action="Open matchup" onClick={() => setView("Matchups")} />
          <div>{positionEdges.map((item) => <article key={item.position}><b>{item.position}</b><span><i style={{ left: `${Math.max(7, Math.min(93, 50 + item.edge * 3))}%` }} /></span><small>{item.mine.toFixed(1)}</small><em className={item.edge >= 0 ? "positive" : "negative"}>{item.edge >= 0 ? "+" : ""}{item.edge.toFixed(1)}</em><small>{opponentTeam ? item.theirs.toFixed(1) : "—"}</small></article>)}</div>
        </section>
        <section className="panel command-availability">
          <Header eyebrow="AVAILABILITY WATCH" title="Status before lineup lock" action="Review lineup" onClick={() => setView("Start / Sit")} />
          <div>{[...unavailable, ...monitored].slice(0, 4).map((player) => <button key={player.id} onClick={() => setSelectedPlayer(player)}><span className={`pos pos-${player.position.toLowerCase()}`}>{player.position}</span><p><strong>{player.name}</strong><small>{player.team} · {player.opponent}</small></p><Status value={player.status} /></button>)}{!unavailable.length && !monitored.length && <p className="command-clear"><b>✓</b><span><strong>All clear</strong><small>No active availability flags on this roster.</small></span></p>}</div>
        </section>
        <section className="panel command-bench-cost">
          <Header eyebrow="BENCH OPPORTUNITY" title="Points outside the lineup" action="View team" onClick={() => setView("My Team")} />
          {bestBench ? <button onClick={() => setSelectedPlayer(bestBench)}><span className={`pos pos-${bestBench.position.toLowerCase()}`}>{bestBench.position}</span><p><strong>{bestBench.name}</strong><small>{formatRosterSlot(bestBench.role)} · {bestBench.opponent}</small></p><b>{bestBench.projection.toFixed(1)}<small>PTS</small></b></button> : <p className="command-clear">No active bench projection is available.</p>}
          <small>Highest projected reserve. This is context—not an automatic recommendation to change the lineup.</small>
        </section>
        <section className="panel command-trends">
          <Header eyebrow="ROLE & MOMENTUM" title="Players moving fastest" action="Player ranks" onClick={() => setView("Player Rankings")} />
          <div>{trendWatch.map((player) => <button key={player.id} onClick={() => setSelectedPlayer(player)}><span className={`pos pos-${player.position.toLowerCase()}`}>{player.position}</span><p><strong>{player.name}</strong><small>{player.team} · {player.snapPct == null ? "role trend" : `${player.snapPct.toFixed(0)}% snaps`}</small></p><b className={player.trend >= 0 ? "positive" : "negative"}>{player.trend >= 0 ? "+" : ""}{player.trend.toFixed(1)}</b></button>)}{!trendWatch.length && <p className="command-clear">Role movement will appear as weekly usage changes.</p>}</div>
        </section>
      </div>
    </div>
  );
}

function MyTeam({
  players,
  context,
  leagueId,
  week,
  setSelectedPlayer,
}: {
  players: Player[];
  context: RankingContext | null;
  leagueId: string;
  week: number;
  setSelectedPlayer: (p: Player) => void;
}) {
  const [livePlayers, setLivePlayers] = useState<Map<string, { player: ScoreboardPlayer; status: string }>>(new Map());
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (!leagueId) return;
      try {
        const response = await fetch(`/api/scoreboard?leagueId=${encodeURIComponent(leagueId)}&week=${week}&scope=mine`);
        if (!response.ok) return;
        const payload = await response.json() as ScoreboardData;
        const mine = payload.matchups.flatMap((matchup) => matchup.teams.filter((team) => team.isMine).map((team) => ({ matchup, team })))[0];
        if (active && mine) setLivePlayers(new Map(mine.team.topPlayers.map((player) => [player.id, { player, status: mine.matchup.status }])));
      } catch { /* Roster remains available when live scoring is unavailable. */ }
    };
    void refresh();
    const stopPolling = startVisiblePolling(refresh);
    return () => { active = false; stopPolling(); };
  }, [leagueId, week]);
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
        compact
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
        livePlayers={livePlayers}
        emptySlots={unfilledSlots}
        setSelectedPlayer={setSelectedPlayer}
      />
      <RosterSection
        title="Reserves"
        detail={`${reserves.length} bench, IR, and taxi players`}
        players={reserves}
        livePlayers={livePlayers}
        setSelectedPlayer={setSelectedPlayer}
      />
    </div>
  );
}

function RosterSection({
  title,
  detail,
  players,
  livePlayers = new Map(),
  emptySlots = [],
  setSelectedPlayer,
}: {
  title: string;
  detail: string;
  players: Player[];
  livePlayers?: Map<string, { player: ScoreboardPlayer; status: string }>;
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
            {players.map((player) => {
              const live = livePlayers.get(player.id);
              const temperature = live ? playerTemperature(live.player, live.status) : { value: 50, label: "Waiting for kickoff", state: "steady" };
              return (
              <tr className={temperature.state === "fire" ? "temperature-card-fire" : temperature.state === "ice" ? "temperature-card-ice" : undefined} key={player.id} onClick={() => setSelectedPlayer(player)}>
                <td className="roster-player-cell">
                  <span className={`pos pos-${player.position.toLowerCase()}`}>
                    {player.position}
                  </span>
                  <span className="roster-player-copy">
                    <strong>{player.name}</strong>
                    <small>{player.team}</small>
                  </span>
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
                  <span className={`player-temperature roster-temperature ${temperature.state}`}>
                    <span className="temperature-label"><b>❄ ICE</b><strong>{temperature.label}</strong><b>FIRE 🔥</b></span>
                    <span className="temperature-track"><i style={{ left: `${temperature.value}%` }} /></span>
                  </span>
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
              );
            })}
            {emptySlots.map((slot, index) => (
              <tr className="empty-starter-row" key={`empty-${slot}-${index}`}>
                <td className="roster-player-cell">
                  <span className="empty-player-mark">+</span>
                  <span className="roster-player-copy">
                    <strong>Empty starter slot</strong>
                    <small>Set your lineup before lock</small>
                  </span>
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
  const [expandedTeamId, setExpandedTeamId] = useState("");
  useEffect(() => {
    if (!expandedTeamId) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpandedTeamId("");
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [expandedTeamId]);
  const rankingById = new Map(rankings.map((player) => [player.id, player]));
  const isDynasty = context?.format === "Dynasty";
  const positions = ["QB", "RB", "WR", "TE"];
  const slotCounts = (context?.rosterSlots ?? []).reduce<
    Record<string, number>
  >((counts, slot) => ({ ...counts, [slot]: (counts[slot] ?? 0) + 1 }), {});
  const superflexSlots = (slotCounts.SUPER_FLEX ?? 0) + (slotCounts.QB_FLEX ?? 0);
  const playerValue = (player: Player) => {
    const rank = rankingById.get(player.id)?.overallRank;
    return rank
      ? Math.max(24, 106 - Math.log2(rank + 1) * 10.5)
      : Math.min(88, player.projection * 3.3);
  };
  const roomNeed = (position: string) => Math.max(1,
    (slotCounts[position] ?? (position === "RB" || position === "WR" ? 2 : 1)) +
    (position === "QB" ? superflexSlots : 0));
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
    const roomValues = positions.map((position) => roomScores[position]);
    const roomAverage = roomValues.reduce((sum, value) => sum + value, 0) / roomValues.length;
    const balanceScore = roomAverage * .72 + Math.min(...roomValues) * .28;
    const runwayValues = team.roster.flatMap((player) => {
      const ranking = rankingById.get(player.id);
      if (!ranking?.age || player.position === "K" || player.position === "DEF") return [];
      const curve = dynastyCurves[player.position] ?? { peakEnd: 29, annualDecline: 2.5 };
      const yearsToCliff = curve.peakEnd - ranking.age;
      const runway = Math.max(28, Math.min(96, 64 + yearsToCliff * 6));
      return [{ value: playerValue(player) * .72 + runway * .28, rank: ranking.overallRank }];
    }).sort((a, b) => a.rank - b.rank).slice(0, 12).map((item) => item.value);
    const runwayScore = runwayValues.reduce((sum, value) => sum + value, 0) / Math.max(1, runwayValues.length);
    return {
      ...team,
      roomScores,
      starterScore,
      depthScore,
      balanceScore,
      runwayScore,
      draftScore: team.draftCapital?.score ?? 0,
    };
  });
  const orderedDraftScores = rawTeams.map((team) => team.draftScore).sort((a, b) => a - b);
  const medianDraftScore = orderedDraftScores.length
    ? orderedDraftScores[Math.floor((orderedDraftScores.length - 1) / 2)]
    : 1;
  // These are league-strength grades, not raw averages of player values. Center an
  // average roster in the low 70s and use standard deviation to preserve meaningful
  // separation without making an ordinary lineup look like a failing grade.
  const starterScores = rawTeams.map((team) => team.starterScore);
  const depthScores = rawTeams.map((team) => team.depthScore);
  const balanceScores = rawTeams.map((team) => team.balanceScore);
  const runwayScores = rawTeams.map((team) => team.runwayScore);
  const calibratedDraftScore = (draftScore: number) => Math.max(30, Math.min(95,
    medianDraftScore > 0 ? 50 + Math.log2(Math.max(1, draftScore) / medianDraftScore) * 24 : 50));
  const scoredTeams = rawTeams
    .map((team) => {
      const draftValue = calibratedDraftScore(team.draftScore);
      const starterScore = leagueRelativeGrade(team.starterScore, starterScores);
      const depthScore = leagueRelativeGrade(team.depthScore, depthScores);
      const balanceScore = leagueRelativeGrade(team.balanceScore, balanceScores);
      const runwayScore = leagueRelativeGrade(team.runwayScore, runwayScores);
      return {
        ...team,
        starterScore,
        depthScore,
        balanceScore,
        runwayScore,
        draftValue,
        overallScore: Number((isDynasty
          ? starterScore * .52 + depthScore * .14 + balanceScore * .16 + runwayScore * .10 + draftValue * .08
          : starterScore * .72 + depthScore * .18 + balanceScore * .10
        ).toFixed(1)),
      };
    })
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
  const roomRankTone = (rank: number) =>
    rank <= 3
      ? "rank-elite"
      : rank > Math.ceil(teams.length * (2 / 3))
        ? "rank-trailing"
        : "rank-middle";
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
        compact
        kicker="LEAGUE POWER RANKINGS"
        title="See where every roster has an edge"
        text={`Overall rank blends league-adjusted starters, usable depth, and positional balance${isDynasty ? ", plus roster runway and calibrated three-year draft capital" : " using this league’s lineup and scoring settings"}. Superflex leagues count the second quarterback as a required starter, while pick hoards are compressed so one outlier cannot distort the league.`}
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
        <header className="team-rank-board-head">
          <div>
            <span>FANTASY HUB POWER BOARD</span>
            <h3>League roster rankings</h3>
            <p>Open any team to inspect its complete roster and positional profile.</p>
          </div>
          <div className="team-rank-legend" aria-label="Position rank legend">
            <span className="rank-elite">Top tier</span>
            <span className="rank-middle">League middle</span>
            <span className="rank-trailing">Needs attention</span>
          </div>
        </header>
        <div className={`team-rank-row team-rank-head ${isDynasty ? "dynasty" : ""}`} aria-hidden="true">
          <span>Rank</span>
          <span>Team</span>
          <span>Score</span>
          {positions.map((position) => <span key={`heading-${position}`}>{position}</span>)}
          {isDynasty && <span>Draft</span>}
          <span>Core players</span>
        </div>
        {scoredTeams.map((team) => {
          const coreAssets = team.roster
            .map((player) => rankingById.get(player.id))
            .filter((player): player is LeagueRanking => Boolean(player))
            .sort((a, b) => a.overallRank - b.overallRank)
            .slice(0, 4);
          const firstRounders =
            team.draftCapital?.picks.filter((pick) => pick.round === 1)
              .length ?? 0;
          const secondRounders =
            team.draftCapital?.picks.filter((pick) => pick.round === 2)
              .length ?? 0;
          const allAssets = [...team.roster].sort((a, b) => {
            const aRank = rankingById.get(a.id)?.overallRank ?? 9999;
            const bRank = rankingById.get(b.id)?.overallRank ?? 9999;
            return aRank - bRank || b.projection - a.projection;
          });
          const expanded = expandedTeamId === team.id;
          return (
            <Fragment key={team.id}>
            <article
              className={`team-rank-row ${isDynasty ? "dynasty" : ""} ${team.id === selectedTeamId ? "your-team" : ""} ${expanded ? "expanded" : ""}`}
            >
              <b className="overall-place">#{overallRanks.get(team.id)}</b>
              <div className="rank-team-name">
                <button className="team-rank-toggle" type="button" aria-expanded={expanded} aria-controls={`team-assets-${team.id}`} aria-label={`${expanded ? "Hide" : "View"} ${team.teamName} complete team assets`} onClick={() => setExpandedTeamId((current) => current === team.id ? "" : team.id)}>
                  <span><strong>{team.teamName}</strong><small>{team.managerName}{team.id === selectedTeamId ? " · YOUR TEAM" : ""}</small></span>
                  <i aria-hidden="true">{expanded ? "−" : "+"}</i>
                </button>
              </div>
              <strong className="team-score">{team.overallScore}</strong>
              {positions.map((position) => (
                <div className={`room-rank ${roomRankTone(roomRanks[position].get(team.id) ?? teams.length)}`} data-position={position} key={position}>
                  <b>#{roomRanks[position].get(team.id)}</b>
                  <small className="room-position-label">{position}</small>
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
              <button className="team-assets-mobile-open" type="button" aria-haspopup="dialog" aria-expanded={expanded} aria-controls={`team-assets-${team.id}`} onClick={() => setExpandedTeamId((current) => current === team.id ? "" : team.id)}>{expanded ? "Hide complete roster" : "View complete roster"}</button>
            </article>
            {expanded && (() => {
              const drawer = <div className="team-assets-modal-layer" onClick={() => setExpandedTeamId("")}><section className="team-assets-drawer" id={`team-assets-${team.id}`} role="dialog" aria-modal="true" aria-label={`${team.teamName} complete team assets`} onClick={(event) => event.stopPropagation()}>
              <header><div><span>COMPLETE TEAM ASSETS</span><strong>{team.teamName}</strong></div><small>{allAssets.length} rostered players{isDynasty ? ` · ${team.draftCapital?.picks.length ?? 0} draft picks` : ""}</small><button className="team-assets-close" type="button" aria-label="Close team assets" onClick={() => setExpandedTeamId("")}>×</button></header>
              <div className="team-rating-breakdown"><article><span>STARTERS</span><b>{team.starterScore.toFixed(0)}</b><small>{isDynasty ? "52%" : "72%"}</small></article><article><span>DEPTH</span><b>{team.depthScore.toFixed(0)}</b><small>{isDynasty ? "14%" : "18%"}</small></article><article><span>BALANCE</span><b>{team.balanceScore.toFixed(0)}</b><small>{isDynasty ? "16%" : "10%"}</small></article>{isDynasty && <><article><span>RUNWAY</span><b>{team.runwayScore.toFixed(0)}</b><small>10%</small></article><article><span>DRAFT</span><b>{team.draftValue.toFixed(0)}</b><small>8%</small></article></>}</div>
              <div className="team-position-rooms">
                {[...positions, "OTHER"].map((position) => {
                  const positionPlayers = allAssets.filter((player) => position === "OTHER" ? !positions.includes(player.position) : player.position === position);
                  if (!positionPlayers.length) return null;
                  return <section className="team-position-room" key={position}>
                    <header><span className={`pos pos-${position.toLowerCase()}`}>{position === "OTHER" ? "ST" : position}</span><strong>{position === "OTHER" ? "KICKERS & DEFENSE" : `${position}s`}</strong><small>{positionPlayers.length} PLAYERS</small></header>
                    <div className="team-assets-grid">{positionPlayers.map((player) => {
                      const ranking = rankingById.get(player.id);
                      return <button type="button" key={player.id} onClick={() => { setExpandedTeamId(""); setSelectedPlayer(player); }}><span className={`pos pos-${player.position.toLowerCase()}`}>{player.position}</span><p><strong>{player.name}</strong><small>{player.team} · {formatRosterSlot(player.role)}</small></p><b>{ranking ? `#${ranking.overallRank}` : `${player.projection.toFixed(1)} PTS`}</b></button>;
                    })}</div>
                  </section>;
                })}
              </div>
              {isDynasty && Boolean(team.draftCapital?.picks.length) && <div className="team-pick-assets"><span>DRAFT CAPITAL</span>{team.draftCapital!.picks.map((pick) => <b key={pick.id}>{pick.season} R{pick.round}{pick.originalRosterId !== team.id ? " · ACQUIRED" : ""}</b>)}</div>}
              </section></div>;
              return typeof document !== "undefined" ? createPortal(drawer, document.body) : null;
            })()}
            </Fragment>
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

function buildSeasonCompositeRankings(
  rankings: LeagueRanking[],
  context: RankingContext | null,
  selectedAdpKey?: string,
  redraftMarketHorizon = false,
): CompositeLeagueRanking[] {
  const superflex = (context?.positionDemand.QB ?? 0) > 1.4;
  const sleeperAdpKey = `Sleeper ${superflex ? "Superflex" : "Single-QB"}`;
  const underdogAdpKey = `Underdog ${
    superflex
      ? "Superflex Half PPR"
      : context?.scoring === "PPR"
        ? "Single-QB Full PPR"
        : "Single-QB Half PPR"
  }`;
  const baselineDemand: Record<string, number> = {
    QB: 1,
    RB: 2,
    WR: 2,
    TE: 1,
  };
  const contextWeight = redraftMarketHorizon
    ? 0.35
    : context?.format === "Dynasty"
      ? 0.65
      : context?.format === "Keeper"
        ? 0.5
        : context
          ? 0.35
          : 0;
  const internalRankById = redraftMarketHorizon
    ? new Map(
        [...rankings]
          .sort(
            (a, b) =>
              (b.rankingValue - (b.ageAdjustment ?? 0)) -
                (a.rankingValue - (a.ageAdjustment ?? 0)) ||
              a.overallRank - b.overallRank,
          )
          .map((player, index) => [player.id, index + 1]),
      )
    : new Map(rankings.map((player) => [player.id, player.overallRank]));
  return rankings
    .map((player) => {
      const defaultSources = context?.format === "Dynasty"
        ? [{ value: player.adpBySite?.[sleeperAdpKey], weight: 1 }]
        : [
            { value: player.adpBySite?.[underdogAdpKey], weight: 0.6 },
            { value: player.adpBySite?.[sleeperAdpKey], weight: 0.3 },
            { value: player.adpBySite?.ESPN, weight: 0.1 },
          ];
      const sources = (selectedAdpKey
        ? [{ value: player.adpBySite?.[selectedAdpKey], weight: 1 }]
        : defaultSources
      ).filter(
        (source): source is { value: number; weight: number } =>
          typeof source.value === "number" && source.value > 0,
      );
      const availableWeight = sources.reduce(
        (total, source) => total + source.weight,
        0,
      );
      const compositeAdp = availableWeight
        ? sources.reduce(
            (total, source) => total + source.value * source.weight,
            0,
          ) / availableWeight
        : null;
      const demand =
        context?.positionDemand[player.position] ??
        baselineDemand[player.position] ??
        1;
      const demandDelta = demand - (baselineDemand[player.position] ?? 1);
      const demandMultiplier =
        player.position === "QB" ? 3 : player.position === "TE" ? 1.8 : 1.25;
      const scoringAdjustment =
        player.position === "QB"
          ? Math.max(0, (context?.passTouchdown ?? 4) - 4) * 1.5
          : player.position === "TE"
            ? Math.max(0, context?.tePremium ?? 0) * 4
            : 0;
      const internalRank = internalRankById.get(player.id) ?? player.overallRank;
      const marketRank = compositeAdp ?? internalRank;
      const leagueAdjustedMarketRank = Math.max(
        1,
        marketRank -
          demandDelta * (context?.teams ?? 12) * demandMultiplier -
          scoringAdjustment,
      );
      const hubRankScore =
        leagueAdjustedMarketRank * (1 - contextWeight) +
        internalRank * contextWeight;
      return { ...player, compositeAdp, hubRankScore };
    })
    .sort(
      (a, b) =>
        a.hubRankScore - b.hubRankScore ||
        a.overallRank - b.overallRank,
    )
    .map((player, index) => ({ ...player, overallRank: index + 1 }));
}

function PlayerRanks({
  roster,
  leagueRankings,
  context,
  isPro,
  week,
  onUpgrade,
  setSelectedPlayer,
}: {
  roster: Player[];
  leagueRankings: LeagueRanking[];
  context: RankingContext | null;
  isPro: boolean;
  week: number;
  onUpgrade: () => void;
  setSelectedPlayer: (player: Player) => void;
}) {
  const [rankingMode, setRankingMode] = useState<"season" | "weekly">("season");
  const [position, setPosition] = useState("ALL");
  const [query, setQuery] = useState("");
  const rosterNames = new Set(
    roster.map((player) => player.name.toLowerCase()),
  );
  const teamCount = context?.teams ?? 12;
  const compositePool = buildSeasonCompositeRankings(leagueRankings, context);
  const positionRanks = new Map<string, number>();
  const personalizedPool: (RankedPlayer & Partial<LeagueRanking> & { compositeAdp: number | null })[] =
    compositePool.map((player, index) => {
      const positionRank = (positionRanks.get(player.position) ?? 0) + 1;
      positionRanks.set(player.position, positionRank);
      const overallRank = index + 1;
      const tier: 1 | 2 | 3 | 4 | 5 | 6 =
        overallRank <= teamCount
          ? 1
          : overallRank <= teamCount * 3
            ? 2
            : overallRank <= teamCount * 6
              ? 3
              : overallRank <= teamCount * 10
                ? 4
                : overallRank <= teamCount * 14
                  ? 5
                  : 6;
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
        overallRank,
        positionRank,
        tier,
        outlook: `${ageNote}; ${lineupNote} in this league.`,
      };
    });
  const pool: (RankedPlayer & Partial<LeagueRanking> & { compositeAdp?: number | null })[] =
    personalizedPool.length ? personalizedPool : rankedPlayers;
  const statsSample = pool.find((player) => player.statsSourceSeason);
  const statsSeasonLabel = statsSample?.statsSourceSeason ?? new Date().getUTCFullYear() - 1;
  const filtered = pool
    .filter(
      (player) =>
        (position === "ALL" || player.position === position) &&
        player.name.toLowerCase().includes(query.trim().toLowerCase()),
    )
    .sort((a, b) => a.overallRank - b.overallRank);
  const tiers = [1, 2, 3, 4, 5, 6] as const;
  const tierLabels = {
    1: "Elite first-round anchors",
    2: "Premium weekly advantages",
    3: "Core lineup starters",
    4: "Flexible starters and upside",
    5: "Bench depth and specialists",
    6: "Late-round fliers and emerging value",
  };
  return (
    <div className="page-content player-rankings-page">
      <SectionIntro
        compact
        kicker="FANTASY HUB RANKINGS"
        title={rankingMode === "weekly" ? `Week ${Math.max(1, week)} player rankings` : "Tier-based rankings built for your league"}
        text={
          rankingMode === "weekly"
            ? "Position-by-position weekly ranks blending league projections, ceiling potential, opponent strength, and game-day weather."
            : context
            ? `Composite market rank for your ${context.teams}-team ${context.format.toLowerCase()} league, blending Underdog, Sleeper, and ESPN into six draft tiers.`
            : "Import a league to build a six-tier composite from Underdog, Sleeper, and ESPN draft markets."
        }
      />
      <section className="ranking-mode-toggle panel" role="group" aria-label="Select player ranking horizon">
        <button className={rankingMode === "season" ? "active" : ""} aria-pressed={rankingMode === "season"} onClick={() => setRankingMode("season")}>
          <span>SEASON</span><strong>Season-long tiers</strong>
        </button>
        <button className={rankingMode === "weekly" ? "active" : ""} aria-pressed={rankingMode === "weekly"} onClick={() => setRankingMode("weekly")}>
          <span>PRO · WEEK {Math.max(1, week)}</span><strong>Current weekly ranks</strong>
        </button>
      </section>
      {rankingMode === "weekly" ? (
        isPro ? (
          <WeeklyPlayerRankings players={leagueRankings} week={Math.max(1, week)} setSelectedPlayer={setSelectedPlayer} />
        ) : (
          <section className="weekly-rankings-gate panel">
            <span>FANTASY HUB PRO</span><div className="pro-lock"><FHLogo label="Fantasy Hub" /></div>
            <h2>Weekly Player Rankings are a Pro experience.</h2>
            <p>Unlock projection, ceiling, matchup, and weather-adjusted rankings for every current pro football week.</p>
            <button onClick={onUpgrade}>Explore Fantasy Hub Pro →</button>
          </section>
        )
      ) : (<>
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
      <section className="rank-controls ranking-page-controls panel">
        <div
          className="position-filters"
          role="group"
          aria-label="Filter rankings by position"
        >
          {["ALL", "QB", "RB", "WR", "TE"].map((value) => (
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
                  <span>{statsSeasonLabel} GP</span>
                  <span>Team offense</span>
                  <span>Composite ADP</span>
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
                        {typeof player.compositeAdp === "number"
                          ? player.compositeAdp.toFixed(1)
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
      </>)}
    </div>
  );
}

function WeeklyPlayerRankings({
  players,
  week,
  setSelectedPlayer,
}: {
  players: LeagueRanking[];
  week: number;
  setSelectedPlayer: (player: Player) => void;
}) {
  const [expandedPositions, setExpandedPositions] = useState<Set<string>>(() => new Set());
  const positionConfig = [
    { position: "QB", limit: 24, label: "Quarterbacks" },
    { position: "RB", limit: 24, label: "Running backs" },
    { position: "WR", limit: 36, label: "Wide receivers" },
    { position: "TE", limit: 24, label: "Tight ends" },
  ] as const;
  const cards = positionConfig.map((config) => {
    const positionPlayers = players.filter((player) => player.position === config.position && player.opponent !== "BYE");
    const ranges = new Map(positionPlayers.map((player) => [player.id, matchupAdjustedRange(player)]));
    const maxProjection = Math.max(1, ...positionPlayers.map((player) => Math.max(0, player.leagueProjection ?? player.projection)));
    const maxCeiling = Math.max(1, ...positionPlayers.map((player) => ranges.get(player.id)?.ceiling ?? player.ceiling));
    const ranked = positionPlayers
      .map((player) => {
        const projection = Math.max(0, player.leagueProjection ?? player.projection);
        const range = ranges.get(player.id) ?? matchupAdjustedRange(player);
        const projectionScore = (projection / maxProjection) * 100;
        const ceilingScore = (range.ceiling / maxCeiling) * 100;
        const matchupScore = player.matchupStrength?.score ?? 50;
        const weatherScore = Math.max(35, Math.min(100, 100 + (player.weatherAdjustment ?? 0) * 400));
        const availabilityFactor = /out|doubtful|ir|suspend/i.test(player.status) ? .35 : /questionable/i.test(player.status) ? .88 : 1;
        const weeklyScore = (projectionScore * .45 + ceilingScore * .25 + matchupScore * .2 + weatherScore * .1) * availabilityFactor;
        return { ...player, weeklyProjection: projection, weeklyCeiling: range.ceiling, weeklyScore };
      })
      .sort((a, b) => b.weeklyScore - a.weeklyScore || b.weeklyProjection - a.weeklyProjection)
      .slice(0, config.limit);
    return { ...config, ranked };
  });
  return (
    <div className="weekly-rankings-view">
      <section className="weekly-ranking-method panel">
        <div><span>PROJECTION</span><strong>League projection</strong></div>
        <div><span>CEILING</span><strong>Ceiling potential</strong></div>
        <div><span>MATCHUP</span><strong>Opponent strength</strong></div>
        <div><span>WEATHER</span><strong>Game-day conditions</strong></div>
      </section>
      <div className="weekly-position-grid">
        {cards.map((card) => {
          const expanded = expandedPositions.has(card.position);
          const visiblePlayers = expanded ? card.ranked : card.ranked.slice(0, 12);
          return (
          <section className={`weekly-position-card panel weekly-${card.position.toLowerCase()}`} key={card.position}>
            <header><div><span>WEEK {week} · {expanded ? `TOP ${card.limit}` : "TOP 12"}</span><h3>{card.label}</h3></div><div className="weekly-position-actions"><button type="button" aria-expanded={expanded} onClick={() => setExpandedPositions((current) => { const next = new Set(current); if (expanded) next.delete(card.position); else next.add(card.position); return next; })}>{expanded ? "Show top 12" : `Show all ${card.ranked.length}`}</button><i className={`pos pos-${card.position.toLowerCase()}`}>{card.position}</i></div></header>
            <div className="weekly-rank-list">
              {visiblePlayers.map((player, index) => (
                <button key={player.id} onClick={() => setSelectedPlayer(player)}>
                  <b>#{index + 1}</b>
                  <span><strong>{player.name}</strong><small>{player.team}</small></span>
                  <div><b>{player.weeklyProjection.toFixed(1)}</b><small>PROJ</small></div>
                  <div><b>{player.weeklyCeiling.toFixed(1)}</b><small>CEIL</small></div>
                  <div className="weekly-matchup"><MatchupBadge player={player} /></div>
                  <div className="weekly-weather"><b>{(player.weatherAdjustment ?? 0) < -.08 ? "⚠" : player.weatherSummary ? "☁" : "—"}</b><small>{player.weatherSummary ?? "Weather pending"}</small></div>
                  <strong className="weekly-score">{player.weeklyScore.toFixed(1)}</strong>
                </button>
              ))}
            </div>
          </section>
          );
        })}
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
  const [adpDirection, setAdpDirection] = useState<"asc" | "desc">("asc");
  const [adpSite, setAdpSite] = useState<"Sleeper" | "ESPN" | "Underdog">("Sleeper");
  const [sleeperAdpFormat, setSleeperAdpFormat] = useState<"Single-QB" | "Superflex">("Single-QB");
  const [underdogAdpFormat, setUnderdogAdpFormat] = useState<"Single-QB Half PPR" | "Single-QB Full PPR" | "Superflex Half PPR">("Single-QB Half PPR");
  const adpSourceLabel = adpSite === "ESPN" ? "ESPN (Single-QB)" : adpSite === "Underdog" ? `Underdog (${underdogAdpFormat})` : `Sleeper (${sleeperAdpFormat})`;
  const adpDataKey = adpSite === "ESPN" ? "ESPN" : adpSite === "Underdog" ? `Underdog ${underdogAdpFormat}` : `Sleeper ${sleeperAdpFormat}`;
  const rosterNames = new Set(
    roster.map((player) => player.name.toLowerCase()),
  );
  const teamCount = context?.teams ?? 12;
  const compositePool = buildSeasonCompositeRankings(
    leagueRankings,
    context,
    adpDataKey,
    true,
  );
  const positionRanks = new Map<string, number>();
  const personalizedPool: RankedPlayer[] = compositePool.map((player) => {
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
    const ageNote = "Redraft market horizon";
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
      const aAdp = a.adpBySite?.[adpDataKey];
      const bAdp = b.adpBySite?.[adpDataKey];
      if (typeof aAdp !== "number" && typeof bAdp !== "number")
        return a.overallRank - b.overallRank;
      if (typeof aAdp !== "number") return 1;
      if (typeof bAdp !== "number") return -1;
      return adpDirection === "asc" ? aAdp - bAdp : bAdp - aAdp;
    });
  return (
    <div className="page-content adp-page">
      <SectionIntro
        compact
        kicker="DRAFT MARKET"
        title={`${adpSourceLabel} average draft position`}
        text={
          context
            ? adpSite === "Sleeper"
              ? `Sleeper ${sleeperAdpFormat} draft-market ADP aligned to ${context.scoring}.`
              : adpSite === "Underdog"
                ? `Official Underdog 2026 Best Ball ${underdogAdpFormat} draft market, updated August 21.`
                : "ESPN Single-QB platform ADP reflects ESPN's redraft market and is shown separately for direct comparison."
            : "Import a league to compare platform-specific Sleeper, ESPN, and Underdog draft markets."
        }
      />
      {context && (
        <section className="ranking-context">
          <span>
            <b>Redraft</b> ADP horizon
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
          {["ALL", "QB", "RB", "WR", "TE"].map((value) => (
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
          <strong>Direct platform draft-market data from {adpSourceLabel}</strong>
        </div>
        <div className="adp-control-actions">
          <div className="adp-sites" role="group" aria-label="Select ADP source">
            <button aria-pressed={adpSite === "Sleeper"} className={adpSite === "Sleeper" ? "active" : ""} onClick={() => { if (adpSite === "Sleeper") setAdpDirection((current) => current === "asc" ? "desc" : "asc"); else { setAdpSite("Sleeper"); setAdpDirection("asc"); } }}>
              <span>Sleeper</span><i aria-hidden="true">{adpSite === "Sleeper" ? adpDirection === "asc" ? "↑" : "↓" : "↕"}</i>
            </button>
            <button aria-pressed={adpSite === "ESPN"} className={adpSite === "ESPN" ? "active" : ""} onClick={() => { if (adpSite === "ESPN") setAdpDirection((current) => current === "asc" ? "desc" : "asc"); else { setAdpSite("ESPN"); setAdpDirection("asc"); } }}>
              <span>ESPN</span><i aria-hidden="true">{adpSite === "ESPN" ? adpDirection === "asc" ? "↑" : "↓" : "↕"}</i>
            </button>
            <button aria-pressed={adpSite === "Underdog"} className={adpSite === "Underdog" ? "active" : ""} onClick={() => { if (adpSite === "Underdog") setAdpDirection((current) => current === "asc" ? "desc" : "asc"); else { setAdpSite("Underdog"); setAdpDirection("asc"); } }}>
              <span>Underdog</span><i aria-hidden="true">{adpSite === "Underdog" ? adpDirection === "asc" ? "↑" : "↓" : "↕"}</i>
            </button>
          </div>
          <div className="adp-format-slot">
            {adpSite === "Sleeper" ? <div className="adp-formats" role="group" aria-label="Select Sleeper ADP format">
              {(["Single-QB", "Superflex"] as const).map((format) => (
                <button key={format} aria-pressed={sleeperAdpFormat === format} className={sleeperAdpFormat === format ? "active" : ""} onClick={() => { setSleeperAdpFormat(format); setAdpDirection("asc"); }}>
                  {format}
                </button>
              ))}
            </div> : adpSite === "Underdog" ? <div className="adp-formats underdog" role="group" aria-label="Select Underdog Best Ball ADP format">
              {(["Single-QB Half PPR", "Single-QB Full PPR", "Superflex Half PPR"] as const).map((format) => (
                <button key={format} aria-pressed={underdogAdpFormat === format} className={underdogAdpFormat === format ? "active" : ""} onClick={() => { setUnderdogAdpFormat(format); setAdpDirection("asc"); }}>
                  {format}
                </button>
              ))}
            </div> : <div className="adp-formats espn" aria-label="ESPN ADP format"><span>Single-QB market</span></div>}
          </div>
        </div>
        <small>
          Lower ADP means the player is typically selected earlier. Select
          the active source again to reverse sorting.
        </small>
      </section>
      <section className="tier-section adp-market-table">
        <header>
          <div>
            <span>{adpSourceLabel.toUpperCase()} MARKET</span>
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
          </div>
          {filtered.map((player) => {
            const onRoster = rosterNames.has(player.name.toLowerCase());
            const adp = player.adpBySite?.[adpDataKey];
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
                  </i>
                </span>
                <b>#{player.overallRank}</b>
                <span
                  className={`market-gap ${gap != null && gap > 0 ? "positive" : gap != null && gap < 0 ? "negative" : ""}`}
                >
                  {gap == null ? "—" : `${gap > 0 ? "+" : ""}${gap}`}
                </span>
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
  isPro,
  onUpgrade,
}: {
  leagueId: string;
  week: number;
  players: Player[];
  teams: LeagueTeam[];
  selectedTeamId: string;
  choice: string;
  setChoice: (v: string) => void;
  context: RankingContext | null;
  isPro: boolean;
  onUpgrade: () => void;
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
    return aggressionScore(player, aggressiveness);
  };
  const rememberedStartSit = useMemo(() => decisions.map((decision) => {
    const options = [decision.starter, ...decision.candidates];
    const recommended = [...options].sort((a, b) => {
      const aScore = aggressionScore(a, aggressiveness);
      const bScore = aggressionScore(b, aggressiveness);
      return bScore - aScore;
    })[0];
    const confidence = Math.min(95, Math.max(50, Math.round(55 + Math.abs(recommended.projection - options.find((item) => item.id !== recommended.id)!.projection) * 4)));
    return { id: `start-sit:${week}:${decision.starter.id}`, leagueId, week, category: "start_sit", recommendation: recommended.name, alternatives: options.map((player) => { const range = matchupAdjustedRange(player); return { id: player.id, name: player.name, position: player.position, projection: player.projection, floor: range.floor, ceiling: range.ceiling }; }), information: { aggressiveness, recommendedAggression, teamProjection, opponentProjection, projectionSource: projectionPlatform, scoring: context?.scoring ?? null }, confidence };
  }), [aggressiveness, context?.scoring, decisions, leagueId, opponentProjection, projectionPlatform, recommendedAggression, teamProjection, week]);
  useEffect(() => { if (isPro) rememberedStartSit.forEach((decision) => rememberDecision(decision)); }, [isPro, rememberedStartSit]);
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
    <div className="page-content start-sit-page">
      <SectionIntro
        compact
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
          {isPro ? <button onClick={() => setAggressiveness(recommendedAggression)}>Use recommended</button> : <button onClick={onUpgrade}>Unlock matchup strategy</button>}
        </div>
      </section>
      <section className={`aggression-panel panel ${isPro ? "" : "pro-control-locked"}`}>
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
          disabled={!isPro}
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
        {!isPro && <button className="inline-pro-unlock" onClick={onUpgrade}>PRO · Unlock floor-to-ceiling strategy</button>}
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
                if (isPro && memory) rememberDecision({ ...memory, userSelection: player.name });
              }}
            >
              <div className="choice-top">
                <span className={`pos pos-${player.position.toLowerCase()}`}>
                  {player.position}
                </span>
                {modelChoice && <b>MODEL PICK</b>}
              </div>
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
      !isProtectedWaiverDrop(player, context) &&
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
    const marketProtection = waiverMarketProtection(player, context);
    const availabilityPenalty = ["Out", "IR", "Suspended"].includes(player.status) ? -2 : 0;
    return projection + roleEvidence + scarcityProtection + marketProtection + availabilityPenalty;
  };
  const drop = [...droppable].sort((a, b) => dropUtility(a) - dropUtility(b))[0];
  const addProjection = add.leagueProjection ?? add.projection;
  const needBonus = (positionCounts[add.position] ?? 0) <= desiredAt(add.position) ? 2 : 0;
  const marketBonus = Math.max(0, 3 - (add.waiverRank ?? add.overallRank) * 0.025);
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

function waiverFaabIntelligence(
  player: WaiverPlayer,
  index: number,
  plan: WaiverAddDropPlan,
  remainingBudget: number,
  trendCount = 0,
) {
  const positionPremium = player.position === "RB" ? 3 : player.position === "WR" ? 2 : player.position === "TE" ? 1 : 0;
  const pressureBoost = Math.min(7, Math.log10(Math.max(1, trendCount) + 1) * 2.8);
  const midpoint = Math.max(1, Math.min(35, Math.round(
    player.projection * 0.48 +
      player.lineupAdjustment * 0.35 +
      Math.max(0, plan.improvement) * 0.75 +
      positionPremium +
      pressureBoost -
      index * 0.3,
  )));
  const lowPercent = Math.max(1, midpoint - 3);
  const highPercent = Math.min(40, midpoint + 3);
  const lowBid = Math.max(1, Math.round(remainingBudget * lowPercent / 100));
  const highBid = Math.max(lowBid, Math.round(remainingBudget * highPercent / 100));
  const claimProbability = Math.round(Math.max(10, Math.min(94,
    76 - index * 4 + pressureBoost * 2 + Math.max(0, plan.improvement) * 2,
  )));
  const urgency = claimProbability >= 75 || plan.improvement >= 5
    ? "Priority claim"
    : claimProbability >= 48 || plan.improvement >= 2.5
      ? "Competitive bid"
      : "Value bid";
  return { lowPercent, highPercent, lowBid, highBid, claimProbability, urgency };
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
  players,
  trending,
  roster,
  leagueSelected,
  leagueStatus,
  context,
  setSelectedPlayer,
}: {
  players: WaiverPlayer[];
  trending: WaiverTrending;
  roster: Player[];
  leagueSelected: boolean;
  leagueStatus: string;
  context: RankingContext | null;
  setSelectedPlayer: (player: Player) => void;
}) {
  const [planned, setPlanned] = useState<string[]>([]);
  const [position, setPosition] = useState("ALL");
  const [faabRemaining, setFaabRemaining] = useState(100);
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
  const trendingAdds = new Map(trending.up.map((player) => [player.id, player.trendCount ?? 0]));
  const faabTargets = players
    .map((player, index) => ({
      player,
      index,
      plan: waiverAddDropPlan(player, roster, context),
    }))
    .filter((target) => target.plan.worthIt && target.plan.drop)
    .slice(0, 3)
    .map((target) => ({
      ...target,
      intelligence: waiverFaabIntelligence(
        target.player,
        target.index,
        target.plan,
        faabRemaining,
        trendingAdds.get(target.player.id) ?? 0,
      ),
    }));
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
    <div className="page-content waiver-wire-page">
      <SectionIntro
        compact
        kicker="LIVE LEAGUE AVAILABILITY"
        title="Turn available players into weekly leverage"
        text="Every player shown is currently unrostered in this league and ranked by league-scored weekly projection normalized within position. This keeps naturally higher quarterback scoring from overwhelming RB, WR, TE, K, and defense value."
      />
      <section className="panel faab-intelligence">
        <header>
          <div><span>FAAB INTELLIGENCE</span><h3>Spend for impact, not hype</h3><p>Modeled from league fit, roster improvement, positional demand, projection, and current add pressure.</p></div>
          <label>REMAINING BUDGET<input type="number" min="1" max="1000" inputMode="numeric" value={faabRemaining} onChange={(event) => setFaabRemaining(Math.max(1, Math.min(1000, Number(event.target.value) || 1)))} /></label>
        </header>
        <div className="faab-target-grid">
          {faabTargets.map(({ player, plan, intelligence }, index) => <article key={`faab-${player.id}`}>
            <div><b>0{index + 1}</b><span className={`pos pos-${player.position.toLowerCase()}`}>{player.position}</span><p><strong>{player.name}</strong><small>{intelligence.urgency} · est. {intelligence.claimProbability}% claim pressure</small></p></div>
            <dl><div><dt>RECOMMENDED BID</dt><dd>${intelligence.lowBid}–${intelligence.highBid}</dd><small>{intelligence.lowPercent}–{intelligence.highPercent}% of remaining</small></div><div><dt>ROSTER GAIN</dt><dd>+{plan.improvement.toFixed(1)}</dd><small>Drop {plan.drop!.name}</small></div></dl>
            <p>{index === 0 ? faabTargets[1] ? `Fallback: ${faabTargets[1].player.name} if this claim fails.` : "No comparable fallback currently clears the add/drop threshold." : `Alternative to ${faabTargets[0]?.player.name ?? "the top claim"} at a lower acquisition cost.`}</p>
          </article>)}
          {!faabTargets.length && <div className="faab-empty"><b>✓</b><span><strong>Protect your budget</strong><small>No available player currently improves the roster enough to justify a FAAB claim.</small></span></div>}
        </div>
        <small className="faab-model-note">Claim pressure is a Fantasy Hub estimate, not a guarantee of another manager’s bid.</small>
      </section>
      <section className="waiver-trending-grid" aria-label="Sleeper player trends">
        {([
          { key: "up", title: "Trending Up", detail: "Most added on Sleeper", empty: "No trending adds are currently available in this league." },
          { key: "down", title: "Trending Down", detail: "Most dropped on Sleeper", empty: "No trending drops are currently available in this league." },
        ] as const).map((group) => (
          <article className={`waiver-trend-card panel ${group.key}`} key={group.key}>
            <header>
              <div>
                <span>{group.key === "up" ? "↗" : "↘"}</span>
                <p><strong>{group.title}</strong><small>{group.detail} · available here</small></p>
              </div>
              <b>TOP 5</b>
            </header>
            <div className="waiver-trend-list">
              {trending[group.key].map((player, index) => (
                <button key={player.id} onClick={() => setSelectedPlayer(player)}>
                  <b>#{index + 1}</b>
                  <span className={`pos pos-${player.position.toLowerCase()}`}>{player.position}</span>
                  <p><strong>{player.name}</strong><small>{player.team || "FA"}</small></p>
                  <em>{group.key === "up" ? "+" : "−"}{player.trendCount ?? 0} {group.key === "up" ? "adds" : "drops"}</em>
                </button>
              ))}
              {!trending[group.key].length && <p className="waiver-trend-empty">{group.empty}</p>}
            </div>
          </article>
        ))}
      </section>
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
          <span>NORMALIZED RANK</span>
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
            const faab = waiverFaabIntelligence(player, availableRank - 1, addDropPlan, faabRemaining, trendingAdds.get(player.id) ?? 0);
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
                  {typeof player.waiverProjection === "number"
                    ? player.waiverProjection.toFixed(1)
                    : "—"}
                </b>
                <Status value={player.status} />
                <span className={`claim-level ${availableRank <= 3 ? "aggressive" : availableRank <= 12 ? "measured" : "watch"}`}>
                  <b>{availableRank <= 3 ? "Aggressive" : availableRank <= 12 ? "Measured" : "Watch"}</b>
                  <small>${faab.lowBid}–${faab.highBid} · {faab.claimProbability}% pressure</small>
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
  const marketAdp = ranking?.compositeAdp;
  const marketGrade = typeof marketAdp === "number"
    ? ratingFromPercentile(100 * (1 - (Math.min(300, marketAdp) - 1) / 299))
    : null;
  const marketWeight = marketGrade == null ? 0 : games < 4 ? 0.34 : games < 8 ? 0.26 : 0.18;
  const marketAdjustedTalent = clampTradeRating(
    trueTalent * (1 - marketWeight) + (marketGrade ?? trueTalent) * marketWeight,
  );
  const currentOverall = clampTradeRating(
    marketAdjustedTalent * 0.5 +
      weeklyGrade * 0.25 +
      availabilityGrade * 0.15 +
      roleGrade * 0.1,
  );
  const age = ranking?.age;
  const provenYoungPlayer =
    games >= 8 && marketAdjustedTalent >= 80 && rawProductionGrade >= 78;
  const ageAdjustment = dynastyAgeCurve(
    position,
    age,
    provenYoungPlayer,
  );
  const futureOverall = clampTradeRating(marketAdjustedTalent + ageAdjustment);
  const dynastyOverall = clampTradeRating(
    marketAdjustedTalent * 0.4 + futureOverall * 0.56 + availabilityGrade * 0.04,
  );
  const evidencePoints =
    Math.min(2, games / 7) + (typeof snap === "number" ? 1 : 0) + (ranking ? 1 : 0);
  const confidence =
    evidencePoints >= 3.5 ? "High" : evidencePoints >= 2 ? "Medium" : "Low";
  return { trueTalent, currentOverall, dynastyOverall, confidence };
}

function dynastyAgeCurve(
  position: string,
  age: number | null | undefined,
  provenYoungPlayer: boolean,
) {
  if (typeof age !== "number") return 0;
  const youngBonus = provenYoungPlayer ? 2 : 0;
  if (position === "QB") {
    if (age <= 27) return Math.min(6, (28 - age) * 0.8 + youngBonus);
    if (age <= 32) return 2;
    if (age <= 35) return -(age - 32) * 2;
    return -7 - (age - 36) * 4.5;
  }
  if (position === "RB") {
    if (age <= 22) return (provenYoungPlayer ? 8 : 6) + youngBonus;
    if (age <= 24) return 6 - (age - 23) + youngBonus;
    if (age === 25) return 1;
    if (age === 26) return -4;
    return -10 - (age - 27) * 6;
  }
  if (position === "WR") {
    if (age <= 23) return 7 + youngBonus;
    if (age <= 26) return 5 - (age - 24) + youngBonus;
    if (age <= 28) return 1 - (age - 27);
    if (age === 29) return -4;
    return -9 - (age - 30) * 4.5;
  }
  if (position === "TE") {
    if (age <= 24) return 5 + youngBonus;
    if (age <= 27) return 4 - (age - 25) + youngBonus;
    if (age <= 29) return 0;
    if (age === 30) return -4;
    return -8 - (age - 31) * 4;
  }
  return 0;
}

function tradePositionAdjustment(
  player: Player,
  ranking: LeagueRanking | undefined,
  context: RankingContext | null,
) {
  const baselineDemand: Record<string, number> = { QB: 1, RB: 2, WR: 2, TE: 1 };
  const demand = context?.positionDemand[player.position] ?? baselineDemand[player.position] ?? 1;
  const demandDelta = demand - (baselineDemand[player.position] ?? 1);
  const format = context?.format ?? "Redraft";
  const demandWeight = format === "Dynasty" ? 5 : format === "Keeper" ? 4 : 3.25;
  const superflexBoost = player.position === "QB" && demand >= 1.4
    ? 7 + Math.min(4, (demand - 1.4) * 5)
    : 0;
  const tightEndPremiumBoost = player.position === "TE"
    ? Math.min(7, Math.max(0, context?.tePremium ?? 0) * 6)
    : 0;
  const passingBoost = player.position === "QB"
    ? Math.max(0, (context?.passTouchdown ?? 4) - 4) * 1.5
    : 0;
  const lineupSignal = (ranking?.lineupAdjustment ?? 0) *
    (format === "Dynasty" ? 0.8 : format === "Keeper" ? 0.65 : 0.5);
  return Math.max(
    -8,
    Math.min(
      16,
      demandDelta * demandWeight +
        superflexBoost +
        tightEndPremiumBoost +
        passingBoost +
        lineupSignal,
    ),
  );
}

function tradePackageValueAdjustment(
  send: TradeAssetValue[],
  receive: TradeAssetValue[],
  context: RankingContext | null,
) {
  const empty = { send: 0, receive: 0 };
  if (!send.length || !receive.length || send.length === receive.length) return empty;
  const consolidatedSide = send.length < receive.length ? "send" : "receive";
  const consolidated = consolidatedSide === "send" ? send : receive;
  const expanded = consolidatedSide === "send" ? receive : send;
  if (expanded.length < 2) return empty;
  const consolidatedTotal = consolidated.reduce((sum, asset) => sum + asset.value, 0);
  const topConsolidated = Math.max(...consolidated.map((asset) => asset.value));
  const topExpanded = Math.max(...expanded.map((asset) => asset.value));
  const extraPieces = expanded.length - consolidated.length;
  const concentration = topConsolidated / Math.max(1, consolidatedTotal);
  const studFactor = Math.max(0, (topConsolidated - 55) / 44);
  const qualityEdge = Math.max(0, (topConsolidated - topExpanded) / 44);
  const rosterDepth = context?.rosterSlots.length ?? 18;
  const depthMultiplier = rosterDepth <= 18 ? 1.15 : rosterDepth >= 28 ? 0.8 : 1;
  const adjustment = Math.min(24, Math.max(2, Math.round(
    extraPieces * (2.5 + studFactor * 5) *
      (0.75 + concentration * 0.5) * depthMultiplier +
      qualityEdge * 5,
  )));
  return consolidatedSide === "send"
    ? { send: adjustment, receive: 0 }
    : { send: 0, receive: adjustment };
}

function tradeAsset(
  player: Player,
  rankingById: Map<string, LeagueRanking>,
  context: RankingContext | null,
): TradeAssetValue {
  const ranking = rankingForPlayer(player, rankingById);
  const profile = fantasyTradeProfile(player, ranking);
  const format = context?.format ?? "Redraft";
  const formatOverall =
    format === "Dynasty"
      ? profile.dynastyOverall
      : format === "Keeper"
        ? profile.currentOverall * 0.6 + profile.dynastyOverall * 0.4
        : profile.currentOverall;
  const scarcityAdjustment = tradePositionAdjustment(player, ranking, context);
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
          context,
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
    !["K", "DEF"].includes(player.position) &&
    Boolean(rankingForPlayer(player, rankingById));
  const partnerAssets = partner.roster
    .filter(eligible)
    .map((player) => tradeAsset(player, rankingById, context))
    .sort(
      (a, b) =>
        (yourNeedOrder.get(a.position) ?? 9) -
          (yourNeedOrder.get(b.position) ?? 9) || b.value - a.value,
    );
  const yourAssets = yourTeam.roster
    .filter(eligible)
    .map((player) => tradeAsset(player, rankingById, context));
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
    .slice(0, 3)
    .map((candidate) => candidate.suggestion);
}

function TradeLab({
  teams,
  selectedTeamId,
  rankings,
  context,
  isPro,
  onUpgrade,
}: {
  teams: LeagueTeam[];
  selectedTeamId: string;
  rankings: LeagueRanking[];
  context: RankingContext | null;
  isPro: boolean;
  onUpgrade: () => void;
}) {
  const yourTeam = teams.find((team) => team.id === selectedTeamId);
  const opponents = teams.filter(
    (team) => team.id !== selectedTeamId && team.roster.length,
  );
  const [selectedId, setSelectedId] = useState(opponents[0]?.id ?? "");
  const [styles, setStyles] = useState<Record<string, TradeStyle>>({});
  const [targetPositions, setTargetPositions] = useState<string[]>([]);
  const [activeSuggestionId, setActiveSuggestionId] = useState("");
  const [calculatorSendIds, setCalculatorSendIds] = useState<string[]>([]);
  const [calculatorReceiveIds, setCalculatorReceiveIds] = useState<string[]>([]);
  const [assetSelectorSide, setAssetSelectorSide] = useState<"send" | "receive" | null>(null);
  const tradeCalculatorRef = useRef<HTMLElement>(null);
  const partner =
    opponents.find((team) => team.id === selectedId) ?? opponents[0];
  const partnerStyle = partner ? (styles[partner.id] ?? "Neutral") : "Neutral";
  const tradeRankings = buildSeasonCompositeRankings(rankings, context);
  const allSuggestions =
    isPro && yourTeam && partner
      ? buildTradeSuggestions(
          yourTeam,
          partner,
          tradeRankings,
          context,
          partnerStyle,
        )
      : [];
  const matchesTargetPosition = (suggestion: TradeSuggestion) =>
    !targetPositions.length || suggestion.receive.some((asset) => targetPositions.includes(asset.position));
  const suggestions = allSuggestions.filter(matchesTargetPosition);
  const partnerMatches = isPro && yourTeam
    ? opponents.map((team) => {
        const packages = buildTradeSuggestions(
          yourTeam,
          team,
          tradeRankings,
          context,
          styles[team.id] ?? "Neutral",
        ).filter(matchesTargetPosition);
        const best = packages[0] ?? null;
        const matchScore = best
          ? Math.min(99, Math.round(best.acceptance * 0.62 + best.yourBenefit * 0.23 + best.partnerBenefit * 0.15))
          : 0;
        return { team, packages, best, matchScore };
      }).filter((match) => match.best).sort((a, b) => b.matchScore - a.matchScore).slice(0, 4)
    : [];
  const toggleTargetPosition = (position: string) => {
    setTargetPositions((current) => current.includes(position)
      ? current.filter((item) => item !== position)
      : [...current, position]);
    setActiveSuggestionId("");
    setCalculatorSendIds([]);
    setCalculatorReceiveIds([]);
  };
  function selectPartner(id: string) {
    setSelectedId(id);
    setActiveSuggestionId("");
    setCalculatorSendIds([]);
    setCalculatorReceiveIds([]);
  }
  function updateStyle(style: TradeStyle) {
    if (!partner) return;
    setStyles((current) => ({ ...current, [partner.id]: style }));
  }
  function jumpToTradeCalculator() {
    tradeCalculatorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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
  const rankingById = buildRankingLookup(tradeRankings);
  const tradeFormat = context?.format ?? "Redraft";
  const eligibleYourPlayers = yourTeam.roster.filter(
    (player) => !["K", "DEF"].includes(player.position),
  );
  const eligiblePartnerPlayers = partner.roster.filter(
    (player) => !["K", "DEF"].includes(player.position),
  );
  const pickAsset = (pick: DraftPick): TradeAssetValue => ({
    id: `pick:${pick.season}:${pick.round}:${pick.originalRosterId}`,
    name: `${pick.season} Round ${pick.round} pick`,
    position: "PICK",
    team: "Draft capital",
    meta: `Originally roster ${pick.originalRosterId}`,
    value: pick.value,
    trueTalent: pick.value,
    currentOverall: pick.value,
    dynastyOverall: pick.value,
    confidence: "High",
  });
  const yourTradeAssets = [
    ...eligibleYourPlayers.map((player) => tradeAsset(player, rankingById, context)),
    ...(yourTeam.draftCapital?.picks ?? []).map(pickAsset),
  ];
  const partnerTradeAssets = [
    ...eligiblePartnerPlayers.map((player) => tradeAsset(player, rankingById, context)),
    ...(partner.draftCapital?.picks ?? []).map(pickAsset),
  ];
  const effectiveSendIds = calculatorSendIds;
  const effectiveReceiveIds = calculatorReceiveIds;
  const calculatorSendAssets = yourTradeAssets.filter((asset) => effectiveSendIds.includes(asset.id));
  const calculatorReceiveAssets = partnerTradeAssets.filter((asset) => effectiveReceiveIds.includes(asset.id));
  const calculatorSendPlayers = yourTeam.roster.filter((player) => effectiveSendIds.includes(player.id));
  const calculatorReceivePlayers = partner.roster.filter((player) => effectiveReceiveIds.includes(player.id));
  const toggleCalculatorAsset = (side: "send" | "receive", id: string) => {
    const setIds = side === "send" ? setCalculatorSendIds : setCalculatorReceiveIds;
    const effectiveIds = side === "send" ? effectiveSendIds : effectiveReceiveIds;
    setIds(effectiveIds.includes(id) ? effectiveIds.filter((assetId) => assetId !== id) : [...effectiveIds, id].slice(0, 6));
  };
  const clearCalculator = () => {
    setCalculatorSendIds([]);
    setCalculatorReceiveIds([]);
    setActiveSuggestionId("");
    setAssetSelectorSide(null);
  };
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
    calculatorSendAssets.length && calculatorReceiveAssets.length
      ? tradeRosterStrength(
          [
            ...yourTeam.roster.filter(
              (player) => !effectiveSendIds.includes(player.id),
            ),
            ...calculatorReceivePlayers,
          ],
          rankingById,
          context,
        ) + (calculatorReceiveAssets.filter((asset) => asset.position === "PICK").reduce((sum, asset) => sum + asset.value, 0) - calculatorSendAssets.filter((asset) => asset.position === "PICK").reduce((sum, asset) => sum + asset.value, 0)) * .15
      : calculatorYourBefore;
  const calculatorPartnerAfter =
    calculatorSendAssets.length && calculatorReceiveAssets.length
      ? tradeRosterStrength(
          [
            ...partner.roster.filter(
              (player) => !effectiveReceiveIds.includes(player.id),
            ),
            ...calculatorSendPlayers,
          ],
          rankingById,
          context,
        ) + (calculatorSendAssets.filter((asset) => asset.position === "PICK").reduce((sum, asset) => sum + asset.value, 0) - calculatorReceiveAssets.filter((asset) => asset.position === "PICK").reduce((sum, asset) => sum + asset.value, 0)) * .15
      : calculatorPartnerBefore;
  const calculatorSendValue = calculatorSendAssets.reduce((sum, asset) => sum + asset.value, 0);
  const calculatorReceiveValue = calculatorReceiveAssets.reduce((sum, asset) => sum + asset.value, 0);
  const calculatorValueAdjustment = tradePackageValueAdjustment(calculatorSendAssets, calculatorReceiveAssets, context);
  const calculatorAdjustedSendValue = calculatorSendValue + calculatorValueAdjustment.send;
  const calculatorAdjustedReceiveValue = calculatorReceiveValue + calculatorValueAdjustment.receive;
  const calculatorGap =
    calculatorSendAssets.length && calculatorReceiveAssets.length
      ? Math.abs(calculatorAdjustedSendValue - calculatorAdjustedReceiveValue) /
        Math.max(1, calculatorAdjustedSendValue, calculatorAdjustedReceiveValue)
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
    calculatorSendAssets.length && calculatorReceiveAssets.length
      ? calculatorAdjustedSendValue / Math.max(1, calculatorAdjustedReceiveValue)
      : 0;
  const calculatorProfileFit =
    calculatorYourAfter - calculatorYourBefore >= calculatorProfile.yourGain &&
    calculatorPartnerAfter - calculatorPartnerBefore >= calculatorProfile.partnerGain &&
    calculatorOfferRatio >= calculatorProfile.offerRatio;
  const calculatorViability =
    !calculatorSendAssets.length || !calculatorReceiveAssets.length
      ? "Select assets"
      : calculatorSendPlayers.length === 1 && calculatorReceivePlayers.length === 1 && calculatorSendPlayers[0].position === "TE" && calculatorReceivePlayers[0].position === "TE"
        ? "Poor roster fit"
        : calculatorProfileFit && calculatorGap <= calculatorProfile.strongGap
          ? "Strong framework"
          : calculatorProfileFit && calculatorGap <= calculatorProfile.workableGap
            ? "Negotiable"
            : calculatorMutual && calculatorGap <= calculatorProfile.workableGap
              ? "Fair value, weak fit"
              : "Low viability";
  const calculatorReady = Boolean(calculatorSendAssets.length && calculatorReceiveAssets.length);
  const calculatorBalancePosition = calculatorReady
    ? Math.max(8, Math.min(92, 50 + ((calculatorAdjustedReceiveValue - calculatorAdjustedSendValue) / Math.max(1, calculatorAdjustedSendValue, calculatorAdjustedReceiveValue)) * 50))
    : 50;
  const calculatorVerdict = !calculatorReady
    ? "Build your deal"
    : calculatorGap <= 0.1
      ? "Balanced framework"
      : calculatorGap <= 0.22
        ? "Close enough to negotiate"
        : calculatorAdjustedSendValue > calculatorAdjustedReceiveValue
          ? `${partner.teamName} receives more value`
          : `${yourTeam.teamName} receives more value`;
  const assetMix = (assets: TradeAssetValue[]) => {
    const counts = assets.reduce<Record<string, number>>((result, asset) => {
      result[asset.position] = (result[asset.position] ?? 0) + 1;
      return result;
    }, {});
    return Object.entries(counts).map(([position, count]) => `${count} ${position}`).join(" · ");
  };
  return (
    <div className="page-content trade-lab-page">
      <SectionIntro
        compact
        kicker="LIVE LEAGUE TRADE INTELLIGENCE"
        title="Evaluate any deal, then let Pro find the best ones"
        text="The manual calculator is free and uses players currently owned by both teams. Fantasy Hub Pro adds roster-wide suggestions, mutual-need analysis, negotiation behavior, and estimated acceptance."
      />
      <div className="trade-lab-status" aria-label="Trade Lab capabilities">
        <b><i>✓</i> Live league rosters</b>
        <b><i>↗</i> Lineup impact</b>
        <b><i>◎</i> Format-aware values</b>
      </div>
      <section className={`trade-controls panel ${isPro ? "" : "trade-suggestion-controls-locked"}`}>
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
        <div className="negotiation-profile-control">
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
                  disabled={!isPro}
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
        {!isPro && <button className="inline-pro-unlock trade-profile-unlock" onClick={onUpgrade}>PRO · Unlock negotiation profiles and suggested packages</button>}
      </section>
      <section className="trade-calculator panel" ref={tradeCalculatorRef}>
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
          <div className="trade-calculator-header-actions">
            <button type="button" onClick={clearCalculator} disabled={!calculatorSendAssets.length && !calculatorReceiveAssets.length}>Clear all</button>
            <b className={`calculator-viability ${calculatorViability.toLowerCase().replaceAll(" ", "-")}`}>
              {calculatorViability}
            </b>
          </div>
        </header>
        <div className="deal-desk">
          {(["send", "receive"] as const).map((side) => {
            const assets = side === "send" ? calculatorSendAssets : calculatorReceiveAssets;
            const adjustment = side === "send" ? calculatorValueAdjustment.send : calculatorValueAdjustment.receive;
            const total = side === "send" ? calculatorAdjustedSendValue : calculatorAdjustedReceiveValue;
            const teamName = side === "send" ? yourTeam.teamName : partner.teamName;
            return <section className={`deal-package ${side}`} key={side}>
              <header><div><span>{side === "send" ? "YOU SEND" : "YOU RECEIVE"}</span><h4>{teamName}</h4></div><b>{assets.length} {assets.length === 1 ? "asset" : "assets"}</b></header>
              <button className="deal-add-assets" type="button" onClick={() => setAssetSelectorSide(side)}><i>+</i><span><strong>{assets.length ? "Edit package" : "Choose players and picks"}</strong><small>Select up to six league assets</small></span></button>
              <div className="deal-asset-list">
                {assets.length ? assets.map((asset) => <article key={asset.id}>
                  <span className={`pos pos-${asset.position.toLowerCase()}`}>{asset.position}</span>
                  <p><strong>{asset.name}</strong><small>{asset.position === "PICK" ? asset.meta : `${asset.team} · ${tradeFormat}`}</small></p>
                  <b>{asset.value}</b>
                  <button type="button" aria-label={`Remove ${asset.name}`} onClick={() => toggleCalculatorAsset(side, asset.id)}>×</button>
                </article>) : <div className="deal-empty"><b>{side === "send" ? "Nothing leaving your roster" : "Nothing coming back yet"}</b><small>Tap above to build this side of the deal.</small></div>}
              </div>
              {adjustment > 0 && <div className="deal-adjustment"><span><b>Package adjustment</b><small>Consolidated-asset premium</small></span><strong>+{adjustment}</strong></div>}
              <footer><span><b>{assets.length} total {assets.length === 1 ? "piece" : "pieces"}</b><small>{assets.length ? assetMix(assets) : "No positions selected"}</small></span><strong>{assets.length ? total : "—"}</strong></footer>
            </section>;
          })}
        </div>
        <section className={`deal-verdict ${calculatorReady ? "ready" : "empty"}`} aria-live="polite">
          <header><span>{calculatorSendAssets.length ? calculatorAdjustedSendValue : "—"}<small>You send</small></span><div><b>{calculatorVerdict}</b><small>{calculatorReady ? `${Math.round(calculatorGap * 100)}% adjusted value gap · ${calculatorViability}` : "Choose assets on both sides to compare the packages."}</small></div><span>{calculatorReceiveAssets.length ? calculatorAdjustedReceiveValue : "—"}<small>You receive</small></span></header>
          <div className="deal-balance-rail"><i style={{ left: `${calculatorBalancePosition}%` }} /><span /></div>
          <footer><small>MORE VALUE SENT</small><b>FANTASY HUB DEAL BALANCE</b><small>MORE VALUE RECEIVED</small></footer>
        </section>
        {assetSelectorSide && (() => {
          const selectorAssets = assetSelectorSide === "send" ? yourTradeAssets : partnerTradeAssets;
          const selectorIds = assetSelectorSide === "send" ? effectiveSendIds : effectiveReceiveIds;
          const selectorTeam = assetSelectorSide === "send" ? yourTeam : partner;
          if (typeof document === "undefined") return null;
          return createPortal(<div className="asset-selector-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAssetSelectorSide(null); }}><section className="asset-selector-dialog" role="dialog" aria-modal="true" aria-label={`Select assets from ${selectorTeam.teamName}`}><header><div><span>{assetSelectorSide === "send" ? "YOU SEND" : "YOU RECEIVE"}</span><h3>{selectorTeam.teamName}</h3><small>Select or deselect up to six players and picks.</small></div><button type="button" aria-label="Close asset selector" onClick={() => setAssetSelectorSide(null)}>×</button></header><div className="asset-selector-list">{selectorAssets.map((asset) => <button type="button" className={selectorIds.includes(asset.id) ? "selected" : ""} aria-pressed={selectorIds.includes(asset.id)} key={asset.id} onClick={() => toggleCalculatorAsset(assetSelectorSide, asset.id)}><i>{selectorIds.includes(asset.id) ? "✓" : "+"}</i><span><b>{asset.name}</b><small>{asset.position === "PICK" ? asset.meta : `${asset.position} · ${asset.team}`}</small></span><em>{asset.value}</em></button>)}</div><footer><small>{selectorIds.length}/6 selected</small><button type="button" onClick={() => setAssetSelectorSide(null)}>Done</button></footer></section></div>, document.body);
        })()}
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
      {!isPro ? (
        <section className="trade-suggestions-paywall panel">
          <div><span>FANTASY HUB PRO</span><h3>Turn this calculator into a trade strategy.</h3><p>Manual player-for-player evaluation stays free. Pro scans every roster, identifies mutual needs, builds viable multi-player packages, adapts to each manager’s negotiation profile, and estimates acceptance.</p></div>
          <div className="trade-suggestion-preview" aria-hidden="true"><b>OPTION 1</b><strong>Upgrade WR depth without sacrificing your core</strong><span>78% modeled acceptance</span><i>Suggested from actual roster strengths</i></div>
          <button onClick={onUpgrade}>Unlock trade suggestions →</button>
        </section>
      ) : (
        <section className="panel trade-recommendation-picker">
          <header>
            <div><span>PRO TRADE FINDER</span><h3>Find the right partner for your roster need</h3></div>
            <small>The calculator stays empty until you choose an option.</small>
          </header>
          <div className="trade-position-filter">
            <div><b>What do you want to receive?</b><small>Select one or more positions.</small></div>
            <div role="group" aria-label="Filter trade targets by position">
              <button type="button" className={!targetPositions.length ? "active" : ""} onClick={() => { setTargetPositions([]); setActiveSuggestionId(""); setCalculatorSendIds([]); setCalculatorReceiveIds([]); }}>Any</button>
              {["QB", "RB", "WR", "TE"].map((position) => <button type="button" key={position} aria-pressed={targetPositions.includes(position)} className={targetPositions.includes(position) ? "active" : ""} onClick={() => toggleTargetPosition(position)}>{position}</button>)}
            </div>
          </div>
          <div className="trade-partner-finder">
            <div className="trade-finder-label"><b>Best trade partners</b><small>Ranked by roster fit, mutual benefit, and modeled acceptance.</small></div>
            {partnerMatches.length ? <div className="trade-partner-grid">{partnerMatches.map((match, index) => <button type="button" key={match.team.id} className={partner.id === match.team.id ? "active" : ""} onClick={() => selectPartner(match.team.id)}><i>{index + 1}</i><span><strong>{match.team.teamName}</strong><small>{match.packages.length} matching framework{match.packages.length === 1 ? "" : "s"}</small></span><b>{match.matchScore}<small>FIT</small></b></button>)}</div> : <p className="trade-finder-empty">No responsible league-wide match was found for the selected position filter.</p>}
          </div>
          <div className="trade-finder-label"><b>Recommended trades with {partner.teamName}</b><small>Choose a package to load it into the calculator above.</small></div>
          {suggestions.length ? <div className="suggestion-tabs" role="list" aria-label={`Recommended trades with ${partner.teamName}`}>
            {suggestions.map((item, index) => <button key={item.id} type="button" role="listitem" className={activeSuggestionId === item.id ? "active" : ""} onClick={() => { setActiveSuggestionId(item.id); setCalculatorSendIds(item.send.map((asset) => asset.id)); setCalculatorReceiveIds(item.receive.map((asset) => asset.id)); }}><span>OPTION {index + 1}</span><strong>{item.title}</strong><small><b>You send:</b> {item.send.map((asset) => asset.name).join(", ")}</small><small><b>You receive:</b> {item.receive.map((asset) => asset.name).join(", ")}</small><em>{item.acceptance}% acceptance · Load deal</em></button>)}
          </div> : <p className="trade-finder-empty">{partner.teamName} has no responsible package matching this position filter. Choose one of the ranked partners above.</p>}
        </section>
      )}
      <button className="trade-calculator-jump" type="button" onClick={jumpToTradeCalculator} aria-label="Back to trade calculator"><i aria-hidden="true">↑</i><span><b>Back to calculator</b><small>Review or adjust this trade</small></span></button>
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
  const initialCachedMatchup = useMemo(
    () => readSessionCache<ScoreboardData>(`fantasy-hub-scoreboard:${leagueId}:${defaultWeek}:all`),
    [leagueId, defaultWeek],
  );
  const [week, setWeek] = useState(defaultWeek);
  const [data, setData] = useState<ScoreboardData | null>(initialCachedMatchup);
  const [matchupId, setMatchupId] = useState<number | null>(
    initialMatchupId ??
    initialCachedMatchup?.matchups.find((matchup) => matchup.teams.some((team) => team.isMine))?.matchupId ??
    initialCachedMatchup?.matchups[0]?.matchupId ??
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [nflSchedule, setNflSchedule] = useState<NflScheduleData | null>(null);
  const [matchupWeather, setMatchupWeather] = useState<WeatherData | null>(null);
  const [matchupStrengths, setMatchupStrengths] = useState<MatchupStrengthData | null>(null);

  useEffect(() => {
    let active = true;
    const cacheKey = `fantasy-hub-scoreboard:${leagueId}:${week}:all`;
    const cached = readSessionCache<ScoreboardData>(cacheKey);
    let hasCached = Boolean(cached);
    if (cached) {
      setData(cached);
      setMatchupId((current) =>
        cached.matchups.some((matchup) => matchup.matchupId === current)
          ? current
          : cached.matchups.find((matchup) => matchup.teams.some((team) => team.isMine))?.matchupId ?? cached.matchups[0]?.matchupId ?? null,
      );
    } else {
      setData(null);
    }
    const refresh = async () => {
      if (!hasCached) setLoading(true);
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
        writeSessionCache(cacheKey, payload);
        hasCached = true;
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
    const stopPolling = startVisiblePolling(refresh);
    return () => {
      active = false;
      stopPolling();
    };
  }, [leagueId, week]);

  useEffect(() => {
    const season = data?.league.season;
    if (!season) return;
    const controller = new AbortController();
    Promise.all([
      fetch(`/api/nfl-schedule?season=${encodeURIComponent(season)}`, { signal: controller.signal }),
      loadWeatherData(season, week),
      fetch(`/api/matchup-strength?season=${encodeURIComponent(season)}&week=${week}`, { signal: controller.signal }),
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
        const temperature = playerTemperature(player, matchup?.status ?? "");
        return (
        <article className={`head-to-head-player ${temperature.state === "fire" ? "temperature-card-fire" : temperature.state === "ice" ? "temperature-card-ice" : ""}`} key={player.id}>
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
            <span className={`player-temperature ${temperature.state}`} title={`${player.name}: ${temperature.label} based on live fantasy points versus projection`}>
              <span className="temperature-label"><b>❄ ICE</b><strong>{temperature.label}</strong><b>FIRE 🔥</b></span>
              <span className="temperature-track"><i style={{ left: `${temperature.value}%` }} /></span>
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
          <span>FANTASY MATCHUPS</span>
          <h2>{data?.league.name ?? "Loading matchup…"}</h2>
          <p>Fantasy scoring refreshes every 30 seconds. Opponent, weather, and position matchup grades use live schedule data and {matchupStrengths?.sourceSeason ?? new Date().getUTCFullYear() - 1} fantasy points allowed.</p>
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
            <div><small>{firstTeam.isMine ? "YOU" : firstTeam.teamName}</small><ScoreWithProjection team={firstTeam} /></div>
            <span><b>{matchup.status === "Live" ? "● LIVE" : matchup.status}</b><i>VS</i><small>Week {data?.week}</small></span>
            <div><small>{secondTeam.isMine ? "YOU" : secondTeam.teamName}</small><ScoreWithProjection team={secondTeam} /></div>
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
          throw new Error(data.error ?? "Pro football schedule unavailable");
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
              : "Pro football schedule unavailable",
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
          <span>FULL {season} PRO FOOTBALL SEASON</span>
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
          Loading the {season} pro football schedule…
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
                <span>PRO FOOTBALL WEEK {activeWeek}</span>
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
  leagueId,
  teams,
  selectedTeamId,
  context,
}: {
  leagueId: string;
  teams: LeagueTeam[];
  selectedTeamId: string;
  context: RankingContext | null;
}) {
  const simulations = 10000;
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
        compact
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
          <button onClick={run} disabled={running}>
            {running ? "Simulating…" : "Sim season"}
          </button>
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
  const platformProjection =
    typeof player.leagueProjection === "number"
      ? player.leagueProjection
      : Number.isFinite(player.projection)
        ? player.projection
        : null;
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
  const logPosition = player.position.toUpperCase();
  const gameLogColumns = logPosition === "QB"
    ? [
        { label: "CMP/ATT", value: (week: PlayerWeek) => `${week.passCompletions}/${week.passAttempts}` },
        { label: "PASS YD", value: (week: PlayerWeek) => week.passYards },
        { label: "PASS TD", value: (week: PlayerWeek) => week.passTouchdowns },
        { label: "INT", value: (week: PlayerWeek) => week.interceptions },
        { label: "RUSH", value: (week: PlayerWeek) => `${week.rushAttempts}-${week.rushYards}` },
        { label: "RUSH TD", value: (week: PlayerWeek) => week.rushTouchdowns },
      ]
    : ["RB", "FB"].includes(logPosition)
      ? [
          { label: "CAR", value: (week: PlayerWeek) => week.rushAttempts },
          { label: "RUSH YD", value: (week: PlayerWeek) => week.rushYards },
          { label: "RUSH TD", value: (week: PlayerWeek) => week.rushTouchdowns },
          { label: "REC/TGT", value: (week: PlayerWeek) => `${week.receptions}/${week.targets}` },
          { label: "REC YD", value: (week: PlayerWeek) => week.receivingYards },
          { label: "REC TD", value: (week: PlayerWeek) => week.receivingTouchdowns },
        ]
      : ["WR", "TE"].includes(logPosition)
        ? [
            { label: "TGT", value: (week: PlayerWeek) => week.targets },
            { label: "REC", value: (week: PlayerWeek) => week.receptions },
            { label: "REC YD", value: (week: PlayerWeek) => week.receivingYards },
            { label: "REC TD", value: (week: PlayerWeek) => week.receivingTouchdowns },
            { label: "RUSH", value: (week: PlayerWeek) => `${week.rushAttempts}-${week.rushYards}` },
            { label: "FUM", value: (week: PlayerWeek) => week.fumblesLost },
          ]
        : logPosition === "K"
          ? [
              { label: "FGM", value: (week: PlayerWeek) => week.fieldGoalsMade },
              { label: "FGA", value: (week: PlayerWeek) => week.fieldGoalsAttempted },
              { label: "XPM", value: (week: PlayerWeek) => week.extraPointsMade },
            ]
          : [
              { label: "SACK", value: (week: PlayerWeek) => week.sacks },
              { label: "INT", value: (week: PlayerWeek) => week.defensiveInterceptions },
              { label: "FR", value: (week: PlayerWeek) => week.fumbleRecoveries },
              { label: "TD", value: (week: PlayerWeek) => week.defensiveTouchdowns },
              { label: "PA", value: (week: PlayerWeek) => week.pointsAllowed },
            ];
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
  const adjustedRange = matchupAdjustedRange(player);
  const projectionValue = platformProjection ?? player.projection;
  const rangeWidth = Math.max(1, adjustedRange.ceiling - adjustedRange.floor);
  const projectionPosition = Math.max(4, Math.min(96, ((projectionValue - adjustedRange.floor) / rangeWidth) * 100));
  const statusRisk = /out|doubtful|ir|suspend/i.test(player.status);
  const verdict = statusRisk ? "AVOID UNTIL ACTIVE" : projectionValue >= 18 ? "CONFIDENT START" : projectionValue >= 12 ? "LINEUP READY" : projectionValue >= 8 ? "MATCHUP FLEX" : "BENCH / WATCH";
  const verdictTone = statusRisk ? "risk" : projectionValue >= 12 ? "strong" : projectionValue >= 8 ? "watch" : "risk";
  const latestSeason = history?.seasons[0];
  const recentAverage = history?.recentWeeks.length
    ? history.recentWeeks.reduce((total, week) => total + week.points, 0) / history.recentWeeks.length
    : null;
  return (
    <div className="player-modal-layer">
    <div
      className="modal-backdrop player-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`${player.name} player details`}
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
          <button className="close" aria-label="Close player details" onClick={close}>
            ×
          </button>
        </header>
        <section className="player-command-hero">
          <div className="player-verdict">
            <span>FANTASY HUB VERDICT</span>
            <strong className={verdictTone}>{verdict}</strong>
            <p>{statusRisk ? `${player.status} status overrides the current projection until availability is confirmed.` : `${projectionPlatform} projects ${projectionValue.toFixed(1)} points with a ${player.matchupStrength?.label.toLowerCase() ?? "neutral"} positional matchup.`}</p>
          </div>
          <div className="player-projection-command">
            <span>{projectionPlatform.toUpperCase()} PROJECTION</span>
            <strong>{platformProjection !== null ? platformProjection.toFixed(1) : "—"}</strong>
            <small>Expected fantasy points</small>
          </div>
          <div className="player-range-command">
            <header><span>WEEKLY OUTCOME RANGE</span><small>{(adjustedRange.ceiling - adjustedRange.floor).toFixed(1)} point spread</small></header>
            <div className="player-range-track"><i style={{ left: `${projectionPosition}%` }} /></div>
            <footer><span><b>{adjustedRange.floor.toFixed(1)}</b> FLOOR</span><span><b>{projectionValue.toFixed(1)}</b> PROJ</span><span><b>{adjustedRange.ceiling.toFixed(1)}</b> CEILING</span></footer>
          </div>
        </section>
        <section className="player-decision-rail">
          <article><span>ROLE</span><strong>{formatRosterSlot(player.role)}</strong><small>{player.status}</small></article>
          <article><span>RECENT FORM</span><strong>{recentAverage !== null ? recentAverage.toFixed(1) : "—"}</strong><small>recent PPG</small></article>
          <article><span>SEASON</span><strong>{latestSeason?.pointsPerGame.toFixed(1) ?? "—"}</strong><small>{latestSeason?.positionRank ? `Pos. #${latestSeason.positionRank}` : "PPG"}</small></article>
          <article><span>SNAP SHARE</span><strong>{typeof (history?.snapProfile?.averagePct ?? player.snapAverage) === "number" ? `${(history?.snapProfile?.averagePct ?? player.snapAverage)!.toFixed(0)}%` : "—"}</strong><small>season average</small></article>
          <article><span>TREND</span><strong className={player.trend >= 0 ? "up" : "down"}>{player.trend >= 0 ? "+" : ""}{player.trend.toFixed(1)}</strong><small>market movement</small></article>
        </section>
        <section className="player-matchup-intel">
          <header><div><span>MATCHUP INTELLIGENCE</span><h3>{player.opponent === "BYE" ? "No game scheduled" : `${player.team} ${player.opponent}`}</h3></div><MatchupBadge player={player} /></header>
          <div><article><span>WEATHER</span><strong>{player.weatherSummary ?? "Forecast pending"}</strong></article><article><span>RANGE IMPACT</span><strong>{adjustedRange.edge > .08 ? "Ceiling boost" : adjustedRange.edge < -.08 ? "Added downside" : "Neutral range"}</strong></article><article><span>EXPERIENCE</span><strong>{history?.player.yearsExp != null ? `${history.player.yearsExp} seasons` : "—"}</strong></article><article><span>AGE</span><strong>{history?.player.age ?? "—"}</strong></article></div>
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
                    <th className="game-log-week" scope="col">WK</th>
                    <th>FPTS</th>
                    {gameLogColumns.map((column) => <th key={column.label}>{column.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {seasonWeeks.map((week) => (
                    <tr key={`${week.season}-${week.week}`}>
                      <td className="game-log-week">
                        <b>W{week.week}</b>
                      </td>
                      <td>
                        <strong className="game-log-points">{week.points.toFixed(1)}</strong>
                      </td>
                      {gameLogColumns.map((column) => <td key={column.label}>{column.value(week)}</td>)}
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
      </aside>
    </div>
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
  action?: string;
  onClick?: () => void;
}) {
  return (
    <header className="panel-header">
      <div>
        <span>{eyebrow}</span>
        <h3>{title}</h3>
      </div>
      {action && onClick ? <button type="button" onClick={onClick}>{action} →</button> : null}
    </header>
  );
}
function SectionIntro({
  compact = false,
  kicker,
  title,
  text,
}: {
  compact?: boolean;
  kicker: string;
  title: string;
  text: string;
}) {
  return (
    <header className={`section-intro ${compact ? "compact" : ""}`}>
      <span>{kicker}</span>
      {!compact && <h2>{title}</h2>}
      {!compact && <p>{text}</p>}
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
