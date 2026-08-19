const MARKET_POSITIONS = new Set(["QB", "RB", "WR", "TE"]);

export function bestWaiverMarketRank(player) {
  const ranks = [
    player?.overallRank,
    ...Object.values(player?.adpBySite ?? {}),
  ].filter((value) => typeof value === "number" && Number.isFinite(value) && value > 0 && value < 999);
  return ranks.length ? Math.min(...ranks) : null;
}

export function waiverDropProtectionCutoff(context) {
  const teams = Math.max(6, Math.min(20, Number(context?.teams) || 12));
  if (context?.format === "Dynasty") return Math.max(72, teams * 12);
  if (context?.format === "Keeper") return Math.max(60, teams * 10);
  return Math.max(48, teams * 8);
}

export function isProtectedWaiverDrop(player, context) {
  if (!MARKET_POSITIONS.has(player?.position)) return false;
  const marketRank = bestWaiverMarketRank(player);
  return marketRank != null && marketRank <= waiverDropProtectionCutoff(context);
}

export function waiverMarketProtection(player, context) {
  if (!MARKET_POSITIONS.has(player?.position)) return 0;
  const marketRank = bestWaiverMarketRank(player);
  if (marketRank == null) return 0;
  const cutoff = waiverDropProtectionCutoff(context);
  return Number(Math.max(0, 3 * (1 - marketRank / (cutoff * 2))).toFixed(2));
}
