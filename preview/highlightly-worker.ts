import { getNflGames, getNflMatch, playsFromMatch } from "../app/highlightly-nfl";
import weekOnePbp from "./week1-pbp.json";

type ReplayPlay = { id: string; offense: string; defense: string; text: string; type: string; period: number; clock: string; yards: number; scoring: boolean; turnover: boolean };

const HIGHLIGHTLY_BASE_URL = "https://american-football.highlightly.net";

async function proxyLiveHighlightly(url: URL) {
  const upstreamPath = url.pathname.slice("/live".length);
  if (!/^\/(matches|box-score)(?:\/|$)/.test(upstreamPath)) {
    return Response.json({ error: "Unsupported Highlightly route" }, { status: 404 });
  }
  const apiKey = String((await import("cloudflare:workers")).env.HIGHLIGHTLY_API_KEY ?? "").trim();
  if (!apiKey) return Response.json({ error: "Highlightly key unavailable" }, { status: 503 });
  const upstream = new URL(`${HIGHLIGHTLY_BASE_URL}${upstreamPath}`);
  upstream.search = url.search;
  const response = await fetch(upstream, {
    method: "GET",
    headers: { "x-rapidapi-key": apiKey, accept: "application/json" },
  });
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", upstreamPath === "/matches" ? "public, max-age=15, s-maxage=20" : "public, max-age=10, s-maxage=20");
  headers.delete("set-cookie");
  return new Response(response.body, { status: response.status, headers });
}

export default {
  async fetch(request: Request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/live/")) return proxyLiveHighlightly(url);
    if (url.pathname === "/replay/2025-week-1") {
      try {
        const games = await getNflGames({ season: 2025, week: 1, cacheSeconds: 86400 });
        return Response.json(
          { data: games.sort((a, b) => a.date.localeCompare(b.date)), label: "2025 Regular Season · Week 1" },
          { headers: { "Cache-Control": "public, max-age=300, s-maxage=86400" } },
        );
      } catch (error) {
        console.error(JSON.stringify({ event: "week_one_replay_failed", error: error instanceof Error ? error.message : String(error) }));
        return Response.json({ data: [], error: "Week 1 replay unavailable" }, { status: 503 });
      }
    }
    if (url.pathname === "/replay/2025-week-1/match") {
      const matchId = url.searchParams.get("matchId")?.trim();
      if (!matchId || !/^\d+$/.test(matchId)) return Response.json({ error: "Valid matchId required" }, { status: 400 });
      try {
        const match = await getNflMatch(matchId, 86400);
        const gameKey = match ? `${match.awayTeam?.abbreviation ?? ""}-${match.homeTeam?.abbreviation ?? ""}` : "";
        const replayPlays = ((weekOnePbp.games as Record<string, ReplayPlay[]>)[gameKey] ?? []);
        const data = match ? {
          ...match,
          events: replayPlays.map((play) => ({
            team: { abbreviation: play.offense },
            result: play.type,
            isScoringPlay: play.scoring,
            playDetails: [{ text: play.text, type: play.type, period: play.period, clock: play.clock }],
          })),
        } : null;
        return Response.json({ data, playSource: "nflverse", playCount: replayPlays.length }, { headers: { "Cache-Control": "public, max-age=300, s-maxage=86400" } });
      } catch (error) {
        console.error(JSON.stringify({ event: "week_one_match_failed", matchId, error: error instanceof Error ? error.message : String(error) }));
        return Response.json({ data: null, error: "Week 1 match unavailable" }, { status: 503 });
      }
    }
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
