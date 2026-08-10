import { loadMatchupStrengths } from "../../matchup-strength";

export async function GET(request: Request) {
  const requested = Number(new URL(request.url).searchParams.get("season"));
  const season = Number.isInteger(requested) && requested >= 2025 ? requested : 2026;
  return Response.json(await loadMatchupStrengths(season));
}
