type SleeperPlayer = {
  player_id?: string;
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
  search_rank?: number;
};

export type PlayerContext = {
  playerId: string;
  player: string;
  position: string;
  team: string;
  backups: string[];
  affectedPlayers: string[];
  relatedPlayers: Array<{ id: string; name: string; position: string; team: string; relationship: "subject" | "beneficiary" | "backup" }>;
};

let playerCache: { expires: number; players: SleeperPlayer[] } | null = null;

const MAX_FANTASY_SEARCH_RANK = 400;
const MAX_RELEVANT_DEPTH_ORDER = 2;
const materialRoleChange = /season-ending|out for (?:the )?(?:season|year|multiple weeks?)|placed on (?:injured reserve|ir)|ruled out|will miss|released|waived|cut|traded away/i;

const hasFantasyMarket = (player: SleeperPlayer) =>
  typeof player.search_rank === "number"
  && player.search_rank > 0
  && player.search_rank <= MAX_FANTASY_SEARCH_RANK;

const hasMeaningfulDepthRole = (player: SleeperPlayer) =>
  typeof player.depth_chart_order === "number"
  && player.depth_chart_order > 0
  && player.depth_chart_order <= MAX_RELEVANT_DEPTH_ORDER;

const isFantasySignificant = (player: SleeperPlayer) =>
  hasFantasyMarket(player) || hasMeaningfulDepthRole(player);

const isAvailableForRecommendation = (player: SleeperPlayer) =>
  player.status !== "Inactive"
  && !player.injury_status;

const fantasyRelevanceOrder = (player: SleeperPlayer) =>
  player.search_rank && player.search_rank > 0 ? player.search_rank : 10_000 + (player.depth_chart_order ?? 99);

async function loadPlayers() {
  if (!playerCache || playerCache.expires < Date.now()) {
    const response = await fetch("https://api.sleeper.app/v1/players/nfl", {
      headers: { "User-Agent": "FantasyHubBot/1.0 (+https://fantasyhubapp.com)" },
    });
    if (!response.ok) return [];
    const data = await response.json() as Record<string, SleeperPlayer>;
    playerCache = {
      expires: Date.now() + 6 * 60 * 60 * 1000,
      players: Object.entries(data).map(([playerId, player]) => ({ ...player, player_id: player.player_id ?? playerId })),
    };
  }
  return playerCache.players;
}

export async function findTeamFantasyPlayers(teams: string[]) {
  const players = await loadPlayers();
  const skillPositions = new Set(["QB", "RB", "WR", "TE", "K"]);
  return teams.flatMap((team) => players
    .filter((player) => player.player_id && player.full_name && player.team === team && player.position && skillPositions.has(player.position))
    .filter(isAvailableForRecommendation)
    .filter(isFantasySignificant)
    .sort((a, b) => fantasyRelevanceOrder(a) - fantasyRelevanceOrder(b))
    .slice(0, 5)
    .map((player) => ({ id: player.player_id!, name: player.full_name!, position: player.position!, team: player.team!, relationship: "beneficiary" as const })));
}

export async function findPlayerContext(text: string, eventType?: string): Promise<PlayerContext | null> {
  const players = await loadPlayers();
  if (!players.length) return null;
  const normalized = text.toLowerCase();
  const primaryStatement = normalized.split(/(?<=[.!?])\s+/)[0].slice(0, 260);
  const skillPositions = new Set(["QB", "RB", "WR", "TE", "K"]);
  const mentionedPlayers = players
    .filter((player) => player.full_name && player.team && player.position && skillPositions.has(player.position))
    .filter((player) => primaryStatement.includes(player.full_name!.toLowerCase()));
  const eventIndexes = eventType === "injury"
    ? [...primaryStatement.matchAll(/injur|tor(?:e|n)|tear|acl|achilles|concussion|surgery|sprain|hamstring|ankle|knee|hip|groin/gi)].map((match) => match.index ?? 0)
    : eventType === "contract"
      ? [...primaryStatement.matchAll(/trade|sign|release|waive|contract|roster move/gi)].map((match) => match.index ?? 0)
      : [];
  const mentioned = eventIndexes.length && mentionedPlayers.length > 1
    ? [...mentionedPlayers].sort((a, b) => {
      const distance = (player: SleeperPlayer) => {
        const nameIndex = primaryStatement.indexOf(player.full_name!.toLowerCase());
        const nameEnd = nameIndex + player.full_name!.length;
        return Math.min(...eventIndexes.map((eventIndex) => Math.abs(eventIndex - nameEnd)));
      };
      return distance(a) - distance(b);
    })[0]
    : mentionedPlayers.sort((a, b) => b.full_name!.length - a.full_name!.length)[0];
  if (!mentioned?.full_name || !mentioned.team || !mentioned.position) return null;
  const order = mentioned.depth_chart_order ?? 0;
  const backups = players
    .filter((player) => player.full_name && player.team === mentioned.team && player.position === mentioned.position)
    .filter((player) => player.full_name !== mentioned.full_name && isAvailableForRecommendation(player))
    .filter((player) => !order || !player.depth_chart_order || player.depth_chart_order > order)
    .sort((a, b) => (a.depth_chart_order ?? 99) - (b.depth_chart_order ?? 99))
    .slice(0, 2)
    .map((player) => player.full_name!);
  const affectedPositions = mentioned.position === "QB"
    ? new Set(["WR", "TE"])
    : mentioned.position === "WR" || mentioned.position === "TE"
      ? new Set(["WR", "TE"])
      : new Set([mentioned.position]);
  const affectedPlayerRecords = players
    .filter((player) => player.full_name && player.team === mentioned.team && player.position && affectedPositions.has(player.position))
    .filter((player) => player.full_name !== mentioned.full_name && isAvailableForRecommendation(player))
    .filter(isFantasySignificant)
    .sort((a, b) => fantasyRelevanceOrder(a) - fantasyRelevanceOrder(b))
    .slice(0, 3);
  const affectedPlayers = affectedPlayerRecords.map((player) => player.full_name!);
  const hasRelevantAffectedPlayer = players
    .filter((player) => player.full_name && player.team === mentioned.team && player.position && affectedPositions.has(player.position))
    .some((player) => player.full_name !== mentioned.full_name && isAvailableForRecommendation(player) && isFantasySignificant(player));
  const depthOrder = mentioned.depth_chart_order ?? 0;
  const meaningfulTeammateImpact = materialRoleChange.test(primaryStatement)
    && depthOrder > 0
    && depthOrder <= 3
    && hasRelevantAffectedPlayer;
  if (!isFantasySignificant(mentioned) && !meaningfulTeammateImpact) return null;
  const backupRecords = players
    .filter((player) => player.player_id && player.full_name && backups.includes(player.full_name));
  const relatedPlayers = [
    { id: mentioned.player_id ?? mentioned.full_name, name: mentioned.full_name, position: mentioned.position, team: mentioned.team, relationship: "subject" as const },
    ...affectedPlayerRecords.filter((player) => player.player_id && player.full_name && player.position && player.team).map((player) => ({ id: player.player_id!, name: player.full_name!, position: player.position!, team: player.team!, relationship: "beneficiary" as const })),
    ...backupRecords.filter((player) => !affectedPlayers.includes(player.full_name!)).map((player) => ({ id: player.player_id!, name: player.full_name!, position: player.position!, team: player.team!, relationship: "backup" as const })),
  ].filter((player, index, players) => players.findIndex((candidate) => candidate.id === player.id) === index);
  return { playerId: mentioned.player_id ?? mentioned.full_name, player: mentioned.full_name, position: mentioned.position, team: mentioned.team, backups, affectedPlayers, relatedPlayers };
}
