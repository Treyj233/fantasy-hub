import { portfolioProjectedFinish } from './portfolio-live-projection.mjs';

// Recomputed from the same all-league polling snapshot as the scoreboard.
// Forecasts are estimates, never a replacement for the provider's actual score.
export function sundayPulseOutlooks(leagues, scores) {
  return leagues.map(league => {
    const matchup = scores[league.id]?.matchups.find(item => item.teams.some(team => team.isMine));
    const mine = matchup?.teams.find(team => team.isMine);
    const opponent = matchup?.teams.find(team => !team.isMine);
    if (!mine || !opponent) return `${league.name} · Matchup update unavailable`;
    const score = `${mine.teamName} ${mine.points.toFixed(1)} — ${opponent.teamName} ${opponent.points.toFixed(1)}`;
    if (matchup.status === 'Final') return `${league.name} · FINAL · ${score}`;
    const yourFinish = portfolioProjectedFinish(mine, matchup.status);
    const theirFinish = portfolioProjectedFinish(opponent, matchup.status);
    const label = matchup.status === 'Scheduled' ? 'UP NEXT' : 'IN PROGRESS';
    const forecast = yourFinish === null || theirFinish === null
      ? 'Current projection unavailable'
      : `${matchup.status === 'Scheduled' ? 'Projected' : 'Estimated finish'} ${yourFinish.toFixed(1)} — ${theirFinish.toFixed(1)}`;
    return `${league.name} · ${label} · ${score} · ${forecast}`;
  });
}
