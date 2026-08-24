import { getNflGames, getNflMatch, playsFromMatch } from "../app/highlightly-nfl";

export default {
  async fetch(request: Request) {
    const url = new URL(request.url);
    if (url.pathname !== "/status") return new Response("Highlightly preview provider", { status: 200 });
    const date = url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
    const season = Number(url.searchParams.get("season"));
    const week = Number(url.searchParams.get("week"));
    try {
      const weekly = Number.isInteger(season) && Number.isInteger(week) && season > 2000 && week > 0;
      const games = await getNflGames(weekly ? { season, week, cacheSeconds: 60 } : { date, cacheSeconds: 60 });
      const detailedGame = games[0] ? await getNflMatch(games[0].id, 60) : null;
      const plays = detailedGame ? playsFromMatch(detailedGame) : [];
      return Response.json({
        ok: true,
        provider: "Highlightly",
        query: weekly ? { season, week } : { date },
        games: games.length,
        gameSample: games[0] ?? null,
        detailedGameAvailable: Boolean(detailedGame),
        playCount: plays.length,
        playSample: plays.at(-1) ?? null,
      });
    } catch (error) {
      return Response.json({ ok: false, error: error instanceof Error ? error.message : "Provider unavailable" }, { status: 503 });
    }
  },
};
