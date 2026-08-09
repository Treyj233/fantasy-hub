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
    if (!playerId) return Response.json({ sourceStatus: "unavailable", player: { id: requestedId ?? "" }, seasons: [], recentWeeks: [] });
    const latestSeason = Number(state.previous_season ?? state.season ?? new Date().getUTCFullYear() - 1);
    const seasons = [latestSeason, latestSeason - 1, latestSeason - 2];
    const [seasonResponses, weeklyResponse] = await Promise.all([
      Promise.all(seasons.map((season) => fetch(`https://api.sleeper.com/stats/nfl/player/${playerId}?season_type=regular&season=${season}&grouping=season`, { next: { revalidate: 86400 } }).then((response) => response.ok ? response.json() as Promise<StatLine> : null).catch(() => null))),
      fetch(`https://api.sleeper.com/stats/nfl/player/${playerId}?season_type=regular&season=${latestSeason}&grouping=week`, { next: { revalidate: 3600 } }).then((response) => response.ok ? response.json() as Promise<Record<string, StatLine>> : {}).catch(() => ({})),
    ]);
    const seasonHistory = seasonResponses.flatMap((line, index) => {
      const stats = line?.stats;
      if (!stats || !Object.keys(stats).length) return [];
      const games = number(stats, "gp");
      const points = number(stats, "pts_ppr");
      return [{ season: String(seasons[index]), games, points, pointsPerGame: games ? points / games : 0, positionRank: number(stats, "pos_rank_ppr") || null, yards: number(stats, "pass_yd") + number(stats, "rush_yd") + number(stats, "rec_yd"), touchdowns: number(stats, "pass_td") + number(stats, "rush_td") + number(stats, "rec_td"), receptions: number(stats, "rec") }];
    });
    const recentWeeks = Object.entries(weeklyResponse).flatMap(([week, line]) => {
      const stats = line?.stats;
      if (!stats) return [];
      return [{ week: Number(week), points: number(stats, "pts_ppr"), yards: number(stats, "pass_yd") + number(stats, "rush_yd") + number(stats, "rec_yd"), touchdowns: number(stats, "pass_td") + number(stats, "rush_td") + number(stats, "rec_td"), targets: number(stats, "rec_tgt") }];
    }).sort((a, b) => b.week - a.week).slice(0, 6).reverse();
    return Response.json({ sourceStatus: seasonHistory.length ? "available" : "unavailable", player: { id: playerId, age: resolved.age, yearsExp: resolved.years_exp, college: resolved.college, height: resolved.height, weight: resolved.weight }, seasons: seasonHistory, recentWeeks });
  } catch {
    return Response.json({ sourceStatus: "unavailable", player: { id: requestedId ?? "" }, seasons: [], recentWeeks: [] });
  }
}
