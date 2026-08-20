import { getChatGPTUser } from "../../chatgpt-auth";
import { loadCurrentSnapProfiles, snapProfileFor } from "../../snap-data";
import { loadBlendedPlayerSeasonProfiles, playerSeasonProfileFor } from "../../season-history";
import { fetchCachedUpstream } from "../upstream-cache";

type SourcePlayer = {
  player_id?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  position?: string;
  team?: string;
  search_rank?: number;
  age?: number;
  status?: string;
};

const isCurrentPlayer = (player: SourcePlayer) => {
  const status = (player.status ?? "").toLowerCase();
  return Boolean(player.team) && !/(retired|inactive|deceased)/.test(status);
};

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });

  const currentSeason = new Date().getUTCFullYear();
  const [playersResponse, seasonContext, snapProfiles] = await Promise.all([
    fetchCachedUpstream("https://api.sleeper.app/v1/players/nfl", 86400),
    loadBlendedPlayerSeasonProfiles(currentSeason, 1),
    loadCurrentSnapProfiles(currentSeason, 1),
  ]);
  if (!playersResponse.ok) return Response.json({ error: "Player pool unavailable" }, { status: 502 });

  const sourcePlayers = (await playersResponse.json()) as Record<string, SourcePlayer>;
  const players = Object.entries(sourcePlayers)
    .flatMap(([playerId, player]) => {
      const position = player.position ?? "";
      if (!["QB", "RB", "WR", "TE"].includes(position) || !isCurrentPlayer(player)) return [];
      const name = player.full_name ?? `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim();
      const history = playerSeasonProfileFor(seasonContext.profiles, name);
      const snaps = snapProfileFor(snapProfiles, name);
      if (!name || !history?.games) return [];
      const fantasyPoints = history.fantasyPoints + history.receptions * 0.5;
      return [{
        id: player.player_id ?? playerId,
        name,
        position,
        team: player.team ?? "FA",
        overallRank: player.search_rank && player.search_rank > 0 ? player.search_rank : 9999,
        rankingValue: Math.max(0, 100 - (player.search_rank ?? 9999) * 0.2),
        age: player.age ?? null,
        statsSourceSeason: seasonContext.sourceSeason,
        fantasyPoints2025: Number(fantasyPoints.toFixed(1)),
        fantasyPpg2025: Number((fantasyPoints / history.games).toFixed(1)),
        gamesPlayed2025: history.games,
        targets2025: history.targets,
        receptions2025: history.receptions,
        receivingYards2025: history.receivingYards,
        receivingTouchdowns2025: history.receivingTouchdowns,
        rushingAttempts2025: history.rushingAttempts,
        rushingYards2025: history.rushingYards,
        rushingTouchdowns2025: history.rushingTouchdowns,
        passingAttempts2025: history.passingAttempts,
        passingYards2025: history.passingYards,
        passingTouchdowns2025: history.passingTouchdowns,
        snapAverage: snaps?.averagePct ?? null,
      }];
    })
    .sort((a, b) => a.overallRank - b.overallRank)
    .slice(0, 350)
    .map((player, index) => ({ ...player, overallRank: index + 1 }));

  return Response.json({ players, sourceSeason: seasonContext.sourceSeason });
}
