import { loadSnapProfiles, snapProfileFor } from "../../snap-data";

type PlayerDirectoryEntry = { player_id?: string; full_name?: string; age?: number; years_exp?: number; college?: string; height?: string; weight?: string };
type StatLine = { stats?: Record<string, number | undefined> };

function number(stats: Record<string, number | undefined>, key: string) { return typeof stats[key] === "number" ? stats[key]! : 0; }

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedId = url.searchParams.get("id")?.trim();
  const requestedName = url.searchParams.get("name")?.trim().toLowerCase();
  if (!requestedId && !requestedName) return Response.json({ error: "Player required" }, { status: 400 });
  try {
    const [directoryResponse, stateResponse] = await Promise.all([
      fetch("https://api.sleeper.app/v1/players/nfl?active=true", { next: { revalidate: 86400 } }),
      fetch("https://api.sleeper.app/v1/state/nfl", { next: { revalidate: 3600 } }),
    ]);
    if (!directoryResponse.ok || !stateResponse.ok) throw new Error("Source unavailable");
    const directory = await directoryResponse.json() as Record<string, PlayerDirectoryEntry>;
    const state = await stateResponse.json() as { previous_season?: string; season?: string };
    const resolved = directory[requestedId ?? ""] ?? Object.values(directory).find((entry) => entry.full_name?.toLowerCase() === requestedName);
    const playerId = resolved?.player_id;
    if (!playerId) return Response.json({ sourceStatus: "unavailable", player: { id: requestedId ?? "" }, seasons: [], recentWeeks: [], weeks: [] });
    const currentSeason = Number(state.season ?? new Date().getUTCFullYear());
    const previousSeason = Number(state.previous_season ?? currentSeason - 1);
    const latestSeason = Number.isFinite(currentSeason) && currentSeason >= previousSeason ? currentSeason : previousSeason;
    const seasons = [latestSeason, latestSeason - 1, latestSeason - 2];
    const [seasonResponses, weeklyResponses, snapProfiles] = await Promise.all([
      Promise.all(seasons.map((season) => fetch(`https://api.sleeper.com/stats/nfl/player/${playerId}?season_type=regular&season=${season}&grouping=season`, { next: { revalidate: 86400 } }).then((response) => response.ok ? response.json() as Promise<StatLine> : null).catch(() => null))),
      Promise.all(seasons.map((season) => fetch(`https://api.sleeper.com/stats/nfl/player/${playerId}?season_type=regular&season=${season}&grouping=week`, { next: { revalidate: 3600 } }).then((response) => response.ok ? response.json() as Promise<Record<string, StatLine>> : {}).catch(() => ({})))),
      loadSnapProfiles(latestSeason),
    ]);
    const snapProfile = snapProfileFor(snapProfiles, resolved.full_name ?? "");
    const seasonHistory = seasonResponses.flatMap((line, index) => {
      const stats = line?.stats;
      if (!stats || !Object.keys(stats).length) return [];
      const games = number(stats, "gp");
      const points = number(stats, "pts_ppr");
      return [{ season: String(seasons[index]), games, points, pointsPerGame: games ? points / games : 0, positionRank: number(stats, "pos_rank_ppr") || null, yards: number(stats, "pass_yd") + number(stats, "rush_yd") + number(stats, "rec_yd"), touchdowns: number(stats, "pass_td") + number(stats, "rush_td") + number(stats, "rec_td"), receptions: number(stats, "rec") }];
    });
    const weeks = weeklyResponses.flatMap((weeklyResponse, seasonIndex) => Object.entries(weeklyResponse).flatMap(([week, line]) => {
      const stats = line?.stats;
      if (!stats) return [];
      const passYards = number(stats, "pass_yd");
      const rushYards = number(stats, "rush_yd");
      const receivingYards = number(stats, "rec_yd");
      const passTouchdowns = number(stats, "pass_td");
      const rushTouchdowns = number(stats, "rush_td");
      const receivingTouchdowns = number(stats, "rec_td");
      return [{ season: String(seasons[seasonIndex]), week: Number(week), points: number(stats, "pts_ppr"), totalYards: passYards + rushYards + receivingYards, touchdowns: passTouchdowns + rushTouchdowns + receivingTouchdowns, passYards, passAttempts: number(stats, "pass_att"), passCompletions: number(stats, "pass_cmp"), passTouchdowns, interceptions: number(stats, "pass_int"), rushAttempts: number(stats, "rush_att"), rushYards, rushTouchdowns, targets: number(stats, "rec_tgt"), receptions: number(stats, "rec"), receivingYards, receivingTouchdowns, fumblesLost: number(stats, "fum_lost"), twoPointConversions: number(stats, "pass_2pt") + number(stats, "rush_2pt") + number(stats, "rec_2pt"), fieldGoalsMade: number(stats, "fgm"), fieldGoalsAttempted: number(stats, "fga"), extraPointsMade: number(stats, "xpm"), sacks: number(stats, "sack"), defensiveInterceptions: number(stats, "def_int"), fumbleRecoveries: number(stats, "fum_rec"), defensiveTouchdowns: number(stats, "def_td"), pointsAllowed: number(stats, "pts_allow") }];
    }));
    const recentWeeks = weeks.filter((week) => week.season === String(latestSeason)).sort((a, b) => b.week - a.week).slice(0, 6).reverse().map((week) => ({ week: week.week, points: week.points, yards: week.totalYards, touchdowns: week.touchdowns, targets: week.targets }));
    return Response.json({ sourceStatus: seasonHistory.length ? "available" : "unavailable", player: { id: playerId, age: resolved.age, yearsExp: resolved.years_exp, college: resolved.college, height: resolved.height, weight: resolved.weight }, snapProfile, seasons: seasonHistory, recentWeeks, weeks });
  } catch {
    return Response.json({ sourceStatus: "unavailable", player: { id: requestedId ?? "" }, seasons: [], recentWeeks: [], weeks: [] });
  }
}
