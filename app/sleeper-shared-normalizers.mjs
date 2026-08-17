export function normalizeSleeperPlayerDirectory(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return new Map();
  return new Map(Object.entries(payload).flatMap(([id, player]) => {
    if (!player || typeof player !== "object" || Array.isArray(player)) return [];
    return [[id, {
      name: (player.full_name ?? `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim()) || "Unknown player",
      position: player.position ?? "FLEX",
      team: player.team ?? "FA",
    }]];
  }));
}

export function normalizeSleeperStatMap(payload) {
  if (Array.isArray(payload)) {
    return new Map(payload.flatMap((row) =>
      row && typeof row === "object" && row.player_id
        ? [[row.player_id, row.stats && typeof row.stats === "object" ? row.stats : {}]]
        : []));
  }
  if (!payload || typeof payload !== "object") return new Map();
  return new Map(Object.entries(payload).flatMap(([id, row]) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return [];
    const stats = row.stats && typeof row.stats === "object" ? row.stats : row;
    return [[id, stats]];
  }));
}
