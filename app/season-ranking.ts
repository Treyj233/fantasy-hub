export type SeasonMarketSource = { value: number | null; weight: number };

export function assumedSuspensionGames(status: string | null | undefined) {
  return ["DNR", "SUS"].includes((status ?? "").trim().toUpperCase()) ? 8 : 0;
}

export function rosUnavailableGames({
  status,
  remainingGames,
  outForSeason,
}: {
  status: string | null | undefined;
  remainingGames: number;
  outForSeason: boolean;
}) {
  const remaining = Math.max(0, remainingGames);
  if (outForSeason) return remaining;
  const normalized = (status ?? "").trim().toUpperCase();
  if (["IR", "PUP", "NFI"].includes(normalized)) return Math.min(4, remaining);
  const suspensionGames = assumedSuspensionGames(normalized);
  if (suspensionGames) return Math.min(suspensionGames, remaining);
  if (["OUT", "O"].includes(normalized)) return Math.min(1, remaining);
  if (["DOUBTFUL", "D"].includes(normalized)) return Math.min(.5, remaining);
  if (["QUESTIONABLE", "Q"].includes(normalized)) return Math.min(.15, remaining);
  return 0;
}

export function depthChartRoleAdjustment(order: number | null | undefined) {
  if (order == null || order <= 0) return 0;
  if (order === 1) return 3;
  if (order === 2) return 0;
  if (order === 3) return -3;
  return -6;
}

export function rosPerformanceAdjustment({
  currentPointsPerGame,
  projectedPointsPerGame,
  currentWeek,
  games,
}: {
  currentPointsPerGame: number | null;
  projectedPointsPerGame: number | null;
  currentWeek: number;
  games: number;
}) {
  if (games <= 0 || currentPointsPerGame == null || projectedPointsPerGame == null) return 0;
  const currentSeasonWeight = Math.min(1, Math.max(.25, (currentWeek - 1) / 4));
  const performanceDelta = (currentPointsPerGame - projectedPointsPerGame) * .8 * currentSeasonWeight;
  return Number(Math.max(-10, Math.min(10, performanceDelta)).toFixed(2));
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
  roleAdjustment = 0,
  performanceAdjustment = 0,
}: {
  marketSources: SeasonMarketSource[];
  sourceRank: number;
  projectedSeasonPoints: number | null;
  age: number | null;
  position: string;
  priorSeasonGames: number | null;
  unavailableGames: number;
  lineupAdjustment: number;
  roleAdjustment?: number;
  performanceAdjustment?: number;
}) {
  const available = marketSources.filter(
    (source) => typeof source.value === "number" && source.value > 0 && source.value < 999,
  ) as Array<{ value: number; weight: number }>;
  const availableWeight = available.reduce((total, source) => total + source.weight, 0);
  const marketRank = availableWeight > 0
    ? available.reduce((total, source) => total + source.value * source.weight, 0) / availableWeight
    : sourceRank;
  // ROS value ignores the active matchup and weekly projection, but it should
  // react to durable availability, depth-chart movement and actual production.
  const leagueAdjustedRank = Math.max(1, marketRank - lineupAdjustment * 1.5);
  const projectedPointsPerGame = projectedSeasonPoints == null
    ? null
    : projectedSeasonPoints / 17;
  const rawForwardProjectionBonus = projectedPointsPerGame == null
    ? 0
    : Math.min(16, Math.max(0, projectedPointsPerGame * .85));
  const availabilityShare = Math.max(0, 17 - Math.max(0, unavailableGames)) / 17;
  const forwardProjectionBonus = rawForwardProjectionBonus * availabilityShare;
  const ageThreshold = position === "RB" ? 26 : position === "WR" ? 28 : position === "TE" ? 30 : position === "QB" ? 33 : 30;
  const ageRate = position === "RB" ? 2.25 : position === "WR" ? 1.5 : position === "TE" ? 1.1 : position === "QB" ? .65 : 1;
  const yearsPastThreshold = age == null ? 0 : Math.max(0, age - ageThreshold);
  const ageRisk = Math.min(18, Math.pow(yearsPastThreshold, 1.25) * ageRate);
  const availabilityRisk = priorSeasonGames == null
    ? 0
    : Math.min(6, Math.max(0, 14 - priorSeasonGames) * .55);
  const availabilityPenaltyRate = unavailableGames >= 6 ? 4.5 : 3.5;
  const suspensionRisk = Math.min(72, Math.max(0, unavailableGames) * availabilityPenaltyRate);
  return {
    marketRank: Number(marketRank.toFixed(2)),
    availabilityPenalty: Number(suspensionRisk.toFixed(2)),
    roleAdjustment: Number(roleAdjustment.toFixed(2)),
    performanceAdjustment: Number(performanceAdjustment.toFixed(2)),
    value: Number((Math.max(0, 210 - leagueAdjustedRank) + forwardProjectionBonus - ageRisk - availabilityRisk - suspensionRisk + roleAdjustment + performanceAdjustment).toFixed(2)),
  };
}
