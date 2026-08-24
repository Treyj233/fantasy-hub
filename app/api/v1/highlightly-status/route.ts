import { getNflGames } from "../../../highlightly-nfl";

export async function GET() {
  const checkedAt = new Date().toISOString();
  try {
    const games = await getNflGames({ date: checkedAt.slice(0, 10), cacheSeconds: 60 });
    return Response.json({
      ok: true,
      provider: "Highlightly",
      checkedAt,
      gamesToday: games.length,
      liveGames: games.filter((game) => game.state === "in").length,
    }, { headers: { "Cache-Control": "public, s-maxage=60" } });
  } catch (error) {
    return Response.json({
      ok: false,
      provider: "Highlightly",
      checkedAt,
      error: error instanceof Error ? error.message : "Provider unavailable",
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
