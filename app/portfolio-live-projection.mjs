// Estimate the finish from actual scoring plus the unplayed share of the
// current weekly forecast. Missing forecasts/progress remain unavailable.
export function portfolioProjectedFinish(team, status) {
  if (!team || !Number.isFinite(team.points)) return null;
  if (status === "Final") return team.points;
  const starters = team.topPlayers.filter(player => player.isStarter);
  if (!starters.length) return null;
  let remaining = 0;
  for (const player of starters) {
    const progress = player.gameProgress;
    if (progress >= 1) continue;
    if (!Number.isFinite(player.projection)) return null;
    if (!Number.isFinite(progress) && status !== "Scheduled") return null;
    remaining += Math.max(0, player.projection) * (1 - Math.max(0, Math.min(1, progress ?? 0)));
  }
  return team.points + remaining;
}
