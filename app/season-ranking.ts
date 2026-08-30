export type SeasonMarketSource = { value: number | null; weight: number };

export function seasonRankingValue({
  marketSources,
  sourceRank,
  historicalPointsPerGame,
  lineupAdjustment,
}: {
  marketSources: SeasonMarketSource[];
  sourceRank: number;
  historicalPointsPerGame: number | null;
  lineupAdjustment: number;
}) {
  const available = marketSources.filter(
    (source) => typeof source.value === "number" && source.value > 0 && source.value < 999,
  ) as Array<{ value: number; weight: number }>;
  const availableWeight = available.reduce((total, source) => total + source.weight, 0);
  const marketRank = availableWeight > 0
    ? available.reduce((total, source) => total + source.value * source.weight, 0) / availableWeight
    : sourceRank;
  // Season value is deliberately independent from the active week's projection,
  // matchup and temporary injury designation. Those belong in Weekly Rankings.
  const leagueAdjustedRank = Math.max(1, marketRank - lineupAdjustment * 1.5);
  const productionBonus = historicalPointsPerGame == null
    ? 0
    : Math.min(10, Math.max(0, historicalPointsPerGame * 0.4));
  return {
    marketRank: Number(marketRank.toFixed(2)),
    value: Number((Math.max(0, 210 - leagueAdjustedRank) + productionBonus).toFixed(2)),
  };
}
