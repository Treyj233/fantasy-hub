import { loadNflSeasonSchedule } from "../../nfl-schedule-data";

export async function GET(request: Request) {
  const requestedSeason = Number(new URL(request.url).searchParams.get("season"));
  const season = Number.isInteger(requestedSeason) && requestedSeason >= 2020 && requestedSeason <= 2035
    ? requestedSeason
    : new Date().getUTCFullYear();
  const games = await loadNflSeasonSchedule(season);
  if (!games.length)
    return Response.json({ error: "NFL schedule unavailable" }, { status: 502 });
  const now = Date.now();
  const currentWeek = games.find((game) => new Date(game.date).getTime() >= now)?.week ?? games.at(-1)?.week ?? 1;
  const weeks = Array.from({ length: 18 }, (_, index) => ({
    week: index + 1,
    games: games.filter((game) => game.week === index + 1),
  }));
  return Response.json(
    { season, currentWeek, updatedAt: new Date().toISOString(), source: "season_schedule", weeks },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}
