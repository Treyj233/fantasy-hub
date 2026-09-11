// The season-results CSV records scores for completed games, not live updates.
export function scheduleResultStatus(awayScore, homeScore) {
  return Number.isFinite(awayScore) && Number.isFinite(homeScore)
    ? 'Final'
    : 'Scheduled';
}
