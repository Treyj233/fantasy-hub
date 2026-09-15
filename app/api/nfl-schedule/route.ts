import { loadNflSeasonSchedule } from "../../nfl-schedule-data";
import { fantasyWeek } from "../../fantasy-week.mjs";

export async function GET(request: Request) {
  const requestedSeason = Number(new URL(request.url).searchParams.get("season"));
  const season = Number.isInteger(requestedSeason) && requestedSeason >= 2020 && requestedSeason <= 2035
    ? requestedSeason
    : new Date().getUTCFullYear();
  const games = await loadNflSeasonSchedule(season);
  if (!games.length)
    return Response.json({ error: "NFL schedule unavailable" }, { status: 502 });
  const now = Date.now();
  const currentWeek = fantasyWeek(games, now).currentWeek;
  const weeks = Array.from({ length: 18 }, (_, index) => ({
    week: index + 1,
    games: games.filter((game) => game.week === index + 1),
  }));
  return Response.json(
    { season, currentWeek, updatedAt: new Date().toISOString(), source: "season_schedule", weeks },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=300" } },
  );
}
