import { getChatGPTUser } from "../../chatgpt-auth";
import { getNflGames, getNflMatch, playsFromMatch, runtimeReplayUrl } from "../../highlightly-nfl";

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const url = new URL(request.url);
  const season = Number(url.searchParams.get("season")) || new Date().getUTCFullYear();
  const week = Math.max(1, Math.min(18, Number(url.searchParams.get("week")) || 1));
  try {
    const games = await getNflGames({ season, week, cacheSeconds: 20 });
    const replayMode = Boolean(await runtimeReplayUrl());
    const liveGames = replayMode ? games : games.filter((game) => game.state === "in");
    const matches = await Promise.all(liveGames.map((game) => getNflMatch(game.id, 20).catch(() => null)));
    const plays = matches.flatMap((match) => match ? playsFromMatch(match) : []).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 180);
    return Response.json({ plays, available: liveGames.length === 0 || matches.some(Boolean), source: replayMode ? "Highlightly scores · NFLverse plays · 2025 Week 1" : "Highlightly", replayMode, updatedAt: new Date().toISOString() });
  } catch {
    return Response.json({ plays: [], available: false, source: "Highlightly" });
  }
}
