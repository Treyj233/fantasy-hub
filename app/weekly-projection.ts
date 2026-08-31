export type WeeklyProjectionPlayer = {
  leagueProjection?: number | null;
  projection?: number | null;
};

export function weeklyProjectionValue(player: WeeklyProjectionPlayer) {
  if (typeof player.leagueProjection === "number" && player.leagueProjection > 0)
    return player.leagueProjection;
  if (typeof player.projection === "number" && player.projection > 0)
    return player.projection;
  return null;
}
