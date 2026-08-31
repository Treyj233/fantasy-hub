export type SeasonMarketSource = { value: number | null; weight: number };

export function assumedSuspensionGames(status: string | null | undefined) {
  return ["DNR", "SUS"].includes((status ?? "").trim().toUpperCase()) ? 6 : 0;
}

export function seasonRankingValue({
  marketSources,
  sourceRank,
  projectedSeasonPoints,
  age,
  position,
  priorSeasonGames,
  unavailableGames,
  lineupAdjustment,
}: {
  marketSources: SeasonMarketSource[];
  sourceRank: number;
  projectedSeasonPoints: number | null;
  age: number | null;
  position: string;
  priorSeasonGames: number | null;
  unavailableGames: number;
  lineupAdjustment: number;
}) {
  const available = marketSources.filter(
    (source) => typeof source.value === "number" && source.value > 0 && source.value < 999,
  ) as Array<{ value: number; weight: number }>;
  const availableWeight = available.reduce((total, source) => total + source.weight, 0);
  const marketRank = availableWeight > 0
    ? available.reduce((total, source) => total + source.value * source.weight, 0) / availableWeight
    : sourceRank;
  // ROS value is deliberately independent from the active week's projection,
  // matchup and temporary injury designation. Those belong in Weekly Rankings.
  const leagueAdjustedRank = Math.max(1, marketRank - lineupAdjustment * 1.5);
  const projectedPointsPerGame = projectedSeasonPoints == null
    ? null
    : projectedSeasonPoints / 17;
  const forwardProjectionBonus = projectedPointsPerGame == null
    ? 0
    : Math.min(16, Math.max(0, projectedPointsPerGame * .85));
  const ageThreshold = position === "RB" ? 26 : position === "WR" ? 28 : position === "TE" ? 30 : position === "QB" ? 33 : 30;
  const ageRate = position === "RB" ? 2.25 : position === "WR" ? 1.5 : position === "TE" ? 1.1 : position === "QB" ? .65 : 1;
  const yearsPastThreshold = age == null ? 0 : Math.max(0, age - ageThreshold);
  const ageRisk = Math.min(18, Math.pow(yearsPastThreshold, 1.25) * ageRate);
  const availabilityRisk = priorSeasonGames == null
    ? 0
    : Math.min(6, Math.max(0, 14 - priorSeasonGames) * .55);
  const suspensionRisk = Math.min(24, Math.max(0, unavailableGames) * 3.5);
  return {
    marketRank: Number(marketRank.toFixed(2)),
    availabilityPenalty: Number(suspensionRisk.toFixed(2)),
    value: Number((Math.max(0, 210 - leagueAdjustedRank) + forwardProjectionBonus - ageRisk - availabilityRisk - suspensionRisk).toFixed(2)),
  };
}
