type SleeperPlayer = {
  full_name?: string;
  first_name?: string;
  last_name?: string;
  team?: string;
  position?: string;
  fantasy_positions?: string[];
  depth_chart_order?: number;
  depth_chart_position?: string;
  status?: string;
  injury_status?: string | null;
};

export type PlayerContext = {
  player: string;
  position: string;
  team: string;
  backups: string[];
};

let playerCache: { expires: number; players: SleeperPlayer[] } | null = null;

export async function findPlayerContext(text: string): Promise<PlayerContext | null> {
  if (!playerCache || playerCache.expires < Date.now()) {
    const response = await fetch("https://api.sleeper.app/v1/players/nfl", {
      headers: { "User-Agent": "FantasyHubBot/1.0 (+https://fantasyhubapp.com)" },
    });
    if (!response.ok) return null;
    const data = await response.json() as Record<string, SleeperPlayer>;
    playerCache = { expires: Date.now() + 6 * 60 * 60 * 1000, players: Object.values(data) };
  }
  const normalized = text.toLowerCase();
  const skillPositions = new Set(["QB", "RB", "WR", "TE", "K"]);
  const mentioned = playerCache.players
    .filter((player) => player.full_name && player.team && player.position && skillPositions.has(player.position))
    .filter((player) => normalized.includes(player.full_name!.toLowerCase()))
    .sort((a, b) => b.full_name!.length - a.full_name!.length)[0];
  if (!mentioned?.full_name || !mentioned.team || !mentioned.position) return null;
  const order = mentioned.depth_chart_order ?? 0;
  const backups = playerCache.players
    .filter((player) => player.full_name && player.team === mentioned.team && player.position === mentioned.position)
    .filter((player) => player.full_name !== mentioned.full_name && player.status !== "Inactive")
    .filter((player) => !order || !player.depth_chart_order || player.depth_chart_order > order)
    .sort((a, b) => (a.depth_chart_order ?? 99) - (b.depth_chart_order ?? 99))
    .slice(0, 2)
    .map((player) => player.full_name!);
  return { player: mentioned.full_name, position: mentioned.position, team: mentioned.team, backups };
}
