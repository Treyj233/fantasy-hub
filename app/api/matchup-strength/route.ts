import { loadMatchupStrengths } from "../../matchup-strength";

export async function GET(request: Request) {
  const requested = Number(new URL(request.url).searchParams.get("season"));
  const requestedWeek = Number(new URL(request.url).searchParams.get("week"));
  const season = Number.isInteger(requested) && requested >= 2025 ? requested : 2026;
  const week = Number.isInteger(requestedWeek) && requestedWeek >= 1 ? requestedWeek : 1;
  return Response.json(await loadMatchupStrengths(season, week));
}
