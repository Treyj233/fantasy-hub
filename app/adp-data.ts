import { fetchCachedUpstream } from "./api/upstream-cache";
import underdogAdpSnapshot from "./underdog-adp-snapshot.json";

type EspnAdpPlayer = { fullName?: string; defaultPositionId?: number; ownership?: { averageDraftPosition?: number } };
type SleeperAdpPlayer = { full_name?: string; first_name?: string; last_name?: string; position?: string };
type SleeperAdpRow = { player_id?: string; stats?: Record<string, number> };

const espnPositionById: Record<number, string> = { 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "DEF" };
export type UnderdogAdpFormat = "Single-QB Half PPR" | "Single-QB Full PPR" | "Superflex Half PPR";

export const adpPlayerKey = (name: string, position: string) =>
  `${name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b/g, "").replace(/[^a-z0-9]/g, "")}|${position.toUpperCase()}`;

export const underdogAdpUpdatedAt = underdogAdpSnapshot.updatedAt;
export const loadUnderdogAdpByPlayerKey = (format: UnderdogAdpFormat) =>
  new Map<string, number>(Object.entries(underdogAdpSnapshot.formats[format]));

export async function loadEspnAdpByPlayerKey(season: number) {
  const filter = JSON.stringify({ players: { limit: 2000, sortDraftRanks: { sortPriority: 1, sortAsc: true, value: "STANDARD" } } });
  const response = await fetchCachedUpstream(
    `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leaguedefaults/3?view=kona_player_info`,
    21600,
    { headers: { Accept: "application/json", "User-Agent": "Fantasy Hub ESPN ADP", "x-fantasy-filter": filter } },
  ).catch(() => null);
  if (!response?.ok) return new Map<string, number>();
  const payload = await response.json().catch(() => null) as { players?: { player?: EspnAdpPlayer }[] } | null;
  return new Map((payload?.players ?? []).flatMap((entry) => {
    const player = entry.player;
    const value = player?.ownership?.averageDraftPosition;
    const position = espnPositionById[player?.defaultPositionId ?? 0];
    return player?.fullName && position && typeof value === "number" && value > 0 && value < 999
      ? [[adpPlayerKey(player.fullName, position), value] as const]
      : [];
  }));
}

export async function loadSleeperAdpByPlayerKey(season: number, adpKey: string) {
  const [playersResponse, adpResponse] = await Promise.all([
    fetchCachedUpstream("https://api.sleeper.app/v1/players/nfl", 86400).catch(() => null),
    fetchCachedUpstream(`https://api.sleeper.com/projections/nfl/${season}?season_type=regular&order_by=adp_ppr`, 21600).catch(() => null),
  ]);
  if (!playersResponse?.ok || !adpResponse?.ok) return new Map<string, number>();
  const players = await playersResponse.json().catch(() => ({})) as Record<string, SleeperAdpPlayer>;
  const rows = await adpResponse.json().catch(() => []) as SleeperAdpRow[];
  return new Map((Array.isArray(rows) ? rows : []).flatMap((row) => {
    const player = row.player_id ? players[row.player_id] : undefined;
    const value = row.stats?.[adpKey];
    const name = player?.full_name ?? `${player?.first_name ?? ""} ${player?.last_name ?? ""}`.trim();
    return name && player?.position && typeof value === "number" && value > 0 && value < 999
      ? [[adpPlayerKey(name, player.position), value] as const]
      : [];
  }));
}
