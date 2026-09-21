// Estimate the finish from actual scoring plus the unplayed share of the
// current weekly forecast. Missing forecasts/progress remain unavailable.
export function portfolioProjectedFinish(team, status) {
  if (!team || !Number.isFinite(team.points)) return null;
  status = matchupProjectionStatus(team, status);
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

export function matchupProjectionStatus(team, status) {
  const normalized = String(status ?? '').toLowerCase();
  if (normalized === 'final') return 'Final';
  const starters = team?.topPlayers?.filter(player => player.isStarter) ?? [];
  if (starters.length && starters.every(player => player.gameProgress >= 1)) return 'Final';
  if (normalized === 'live' || starters.some(player => player.gameProgress > 0) || team?.points !== 0 && Number.isFinite(team?.points)) return 'Live';
  return normalized === 'scheduled' || normalized === 'pre' || !normalized ? 'Scheduled' : 'Live';
}

export function matchupTeamForecast(data, rosterId, pregame) {
  const matchup = data?.matchups?.find(item => item.teams.some(team => String(team.rosterId) === String(rosterId)));
  const team = matchup?.teams.find(team => String(team.rosterId) === String(rosterId));
  return team ? portfolioProjectedFinish(team, matchup.status) : pregame;
}
