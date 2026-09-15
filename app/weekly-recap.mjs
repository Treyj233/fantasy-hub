export function recapResult(data, week, rosterId) {
  if (data?.week !== week) return { outcome: 'Unavailable' };
  const matchup = data.matchups?.find(m => m.teams?.some(t => String(t.rosterId) === String(rosterId)));
  if (!matchup) return { outcome: 'No matchup' };
  const mine = matchup.teams.find(t => String(t.rosterId) === String(rosterId));
  const opponent = matchup.teams.find(t => t !== mine);
  if (!opponent) return { outcome: 'Bye' };
  if (matchup.status !== 'Final' || !Number.isFinite(mine.points) || !Number.isFinite(opponent.points)) return { outcome: 'Pending' };
  // Use scoring precision, not rounded display scores, to determine outcomes.
  return { outcome: mine.points > opponent.points ? 'W' : mine.points < opponent.points ? 'L' : 'T', points: mine.points, opponentPoints: opponent.points };
}
