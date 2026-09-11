// A single final can move forward-looking value without replacing the season baseline.
export function postgameValueAdjustment(actual, projected, completed, evidence = {}) {
  if (!completed || !Number.isFinite(actual) || !Number.isFinite(projected) || projected <= 0) return 0;
  const current = (actual - projected) / Math.max(8, projected);
  const prior = (evidence.priorGames ?? []).filter(game => game.completed && Number.isFinite(game.actual) && Number.isFinite(game.projected) && game.projected > 0)
    .slice(-3).map(game => (game.actual - game.projected) / Math.max(8, game.projected));
  const samples = [...prior, current];
  const direction = Math.sign(current);
  // Count repeat performances, not the calendar week or an old season's games.
  const supporting = samples.filter(delta => Math.sign(delta) === direction && Math.abs(delta) >= .15).length;
  const average = samples.reduce((sum, delta) => sum + Math.max(-1, Math.min(1, delta)), 0) / samples.length;
  const provenStar = evidence.marketRank > 0 && evidence.marketRank <= 24 && evidence.historicalGames >= 8;
  const lowerTier = evidence.marketRank > 60;
  const firstGameCap = average < 0 && provenStar ? .75 : average > 0 && lowerTier ? 2 : 1.25;
  const cap = supporting >= 4 ? 8 : supporting >= 3 ? 5 : supporting >= 2 ? 2.5 : firstGameCap;
  return Math.round(Math.max(-cap, Math.min(cap, average * cap)) * 100) / 100;
}

export function injuryTradePenalty(status, format) {
  const normalized = String(status ?? '').trim().toUpperCase();
  const penalty = ({ Q: 2, QUESTIONABLE: 2, D: 5, DOUBTFUL: 5, O: 8, OUT: 8, IR: 16, PUP: 12, NFI: 12, SUSPENDED: 12, SUS: 12 })[normalized] ?? 0;
  return penalty * (format === 'Dynasty' ? .3 : format === 'Keeper' ? .65 : 1);
}
