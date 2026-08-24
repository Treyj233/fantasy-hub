import { loadNflSeasonSchedule } from "./nfl-schedule-data";

const HIGHLIGHTLY_BASE_URL = "https://american-football.highlightly.net";

export type HighlightlyTeam = {
  id?: number;
  name?: string;
  displayName?: string;
  abbreviation?: string;
};

export type HighlightlyMatch = {
  id?: number;
  round?: string;
  date?: string;
  league?: string;
  season?: number;
  awayTeam?: HighlightlyTeam;
  homeTeam?: HighlightlyTeam;
  state?: {
    period?: number;
    clock?: string | number;
    description?: string;
    report?: string;
    score?: { current?: string };
  };
  venue?: { city?: string; name?: string; state?: string };
  forecast?: { status?: string; temperature?: string };
  events?: HighlightlyDrive[];
};

type HighlightlyDrive = {
  team?: HighlightlyTeam;
  result?: string;
  description?: string;
  isScoringPlay?: boolean;
  playDetails?: {
    text?: string;
    type?: string;
    period?: number;
    clock?: string;
    isPenalty?: boolean;
    start?: { yardLine?: number; possessionText?: string };
    end?: { yardLine?: number; possessionText?: string };
  }[];
};

export type NflDataGame = {
  id: string;
  date: string;
  round: string;
  season: number;
  state: "pre" | "in" | "post";
  status: string;
  period: number;
  clock: string;
  away: { id: string; abbreviation: string; name: string; displayName: string; score: number; winner: boolean };
  home: { id: string; abbreviation: string; name: string; displayName: string; score: number; winner: boolean };
  venue: { city: string; name: string; state: string } | null;
  forecast: { status: string; temperature: string } | null;
};

export type NflDataPlay = {
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

async function runtimeApiKey() {
  let env: Record<string, unknown> = process.env as Record<string, unknown>;
  try {
    env = (await import("cloudflare:workers")).env as unknown as Record<string, unknown>;
  } catch {
    // Local Node tooling uses process.env.
  }
  return String(env.HIGHLIGHTLY_API_KEY ?? "").trim();
}

async function highlightlyFetch<T>(path: string, cacheSeconds: number): Promise<T> {
  const apiKey = await runtimeApiKey();
  if (!apiKey) throw new Error("Highlightly API key is not configured");
  const requestInit = {
    headers: { "x-rapidapi-key": apiKey },
    next: { revalidate: cacheSeconds },
  } as RequestInit & { next: { revalidate: number } };
  const response = await fetch(`${HIGHLIGHTLY_BASE_URL}${path}`, requestInit);
  if (!response.ok) throw new Error(`Highlightly request failed (${response.status})`);
  return response.json() as Promise<T>;
}

const normalizeTeam = (team?: string) =>
  ({ JAC: "JAX", WSH: "WAS", LA: "LAR" })[team ?? ""] ?? team ?? "";

function matchState(description?: string) {
  const value = (description ?? "").toLowerCase();
  if (/finished|final/.test(value)) return "post" as const;
  if (/progress|half time|end period|suspended/.test(value)) return "in" as const;
  return "pre" as const;
}

function scores(value?: string) {
  const [away, home] = (value ?? "").split(/\s*-\s*/).map(Number);
  return [Number.isFinite(away) ? away : 0, Number.isFinite(home) ? home : 0] as const;
}

function normalizeMatch(match: HighlightlyMatch): NflDataGame | null {
  if (match.id == null || !match.awayTeam || !match.homeTeam) return null;
  const [awayScore, homeScore] = scores(match.state?.score?.current);
  const state = matchState(match.state?.description ?? match.state?.report);
  const team = (value: HighlightlyTeam, score: number, opponentScore: number) => ({
    id: String(value.id ?? normalizeTeam(value.abbreviation)),
    abbreviation: normalizeTeam(value.abbreviation),
    name: value.name ?? value.displayName ?? normalizeTeam(value.abbreviation),
    displayName: value.displayName ?? value.name ?? normalizeTeam(value.abbreviation),
    score,
    winner: state === "post" && score > opponentScore,
  });
  return {
    id: String(match.id),
    date: match.date ?? "",
    round: match.round ?? "",
    season: match.season ?? 0,
    state,
    status: match.state?.report ?? match.state?.description ?? "Scheduled",
    period: Number(match.state?.period ?? 0),
    clock: state === "in" ? String(match.state?.clock ?? "") : "",
    away: team(match.awayTeam, awayScore, homeScore),
    home: team(match.homeTeam, homeScore, awayScore),
    venue: match.venue ? { city: match.venue.city ?? "", name: match.venue.name ?? "", state: match.venue.state ?? "" } : null,
    forecast: match.forecast ? { status: match.forecast.status ?? "", temperature: match.forecast.temperature ?? "" } : null,
  };
}

export async function getNflGames(options: { season?: number; week?: number; date?: string; cacheSeconds?: number }): Promise<NflDataGame[]> {
  if (options.season && options.week && !options.date) {
    const schedule = await loadNflSeasonSchedule(options.season);
    const dates = [...new Set(schedule.filter((game) => game.week === options.week).map((game) => game.date.slice(0, 10)))];
    const weeklyGames: NflDataGame[] = (await Promise.all(dates.map((date) => getNflGames({ date, cacheSeconds: options.cacheSeconds })))).flat();
    const expected = new Set(schedule.filter((game) => game.week === options.week).map((game) => `${normalizeTeam(game.away.abbreviation)}:${normalizeTeam(game.home.abbreviation)}`));
    return weeklyGames.filter((game) => expected.has(`${game.away.abbreviation}:${game.home.abbreviation}`));
  }
  const params = new URLSearchParams({ league: "NFL", limit: "100" });
  if (options.date) params.set("date", options.date);
  else if (options.season) params.set("season", String(options.season));
  const payload = await highlightlyFetch<{ data?: HighlightlyMatch[] }>(`/matches?${params}`, options.cacheSeconds ?? 60);
  return (payload.data ?? [])
    .flatMap((match) => {
      const normalized = normalizeMatch(match);
      return normalized ? [normalized] : [];
    });
}

export async function getNflMatch(matchId: string, cacheSeconds = 60) {
  const payload = await highlightlyFetch<HighlightlyMatch[]>(`/matches/${encodeURIComponent(matchId)}`, cacheSeconds);
  return payload[0] ?? null;
}

function yardage(text: string, play: NonNullable<HighlightlyDrive["playDetails"]>[number]) {
  const explicit = text.match(/for\s+(-?\d+)\s+yards?/i);
  if (explicit) return Number(explicit[1]);
  const start = play.start?.yardLine;
  const end = play.end?.yardLine;
  return typeof start === "number" && typeof end === "number" ? Math.abs(end - start) : 0;
}

export function playsFromMatch(match: HighlightlyMatch): NflDataPlay[] {
  const gameId = String(match.id ?? "");
  const teams = [match.awayTeam, match.homeTeam].map((team) => normalizeTeam(team?.abbreviation)).filter(Boolean);
  return (match.events ?? []).flatMap((drive, driveIndex) => {
    const offenseTeam = normalizeTeam(drive.team?.abbreviation);
    const defenseTeam = teams.find((team) => team !== offenseTeam) ?? "";
    return (drive.playDetails ?? []).flatMap((play, playIndex) => {
      const text = play.text?.trim();
      if (!text) return [];
      const scoringPlay = Boolean(drive.isScoringPlay && playIndex === (drive.playDetails?.length ?? 1) - 1) || /touchdown|field goal is good|extra point is good|safety/i.test(text);
      const isTurnover = /intercept|fumble.*(?:recovered|lost)|turnover on downs/i.test(`${play.type ?? ""} ${text} ${drive.result ?? ""}`);
      return [{
        id: `highlightly:${gameId}:${driveIndex}:${playIndex}:${play.period ?? 0}:${play.clock ?? ""}`,
        gameId,
        text,
        type: play.type ?? drive.result ?? "Play",
        yardage: yardage(text, play),
        scoringPlay,
        isTurnover,
        period: Number(play.period ?? 0),
        clock: play.clock ?? "",
        at: `${String(play.period ?? 0).padStart(2, "0")}:${play.clock ?? ""}:${String(driveIndex).padStart(3, "0")}:${String(playIndex).padStart(3, "0")}`,
        offenseTeam,
        defenseTeam,
      }];
    });
  });
}
