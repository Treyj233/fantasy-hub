/**
 * Deterministic game-day consequence model.
 *
 * Leverage is an explainable attention score, not a validated probability.
 * Each exposure contributes more when its fantasy matchup is close, the player
 * has meaningful points left, and the player is still active or has not begun.
 * Conflicting ownership is discounted because the same result can help and hurt.
 */
export function playerLeverage(exposures) {
  if (!exposures.length) return { score: 0, level: "Low", explanation: "No direct exposure in connected matchups." };
  const sides = new Set(exposures.map((item) => item.side));
  const raw = exposures.reduce((total, item) => {
    const closeness = Math.max(0.2, 1 - Math.min(Math.abs(item.margin ?? 0), 40) / 50);
    const remaining = Math.max(0, item.remainingProjection ?? item.projection ?? 0);
    const opportunity = item.state === "final" ? 0 : item.state === "live" ? 1 : 0.82;
    return total + 12 * closeness + Math.min(18, remaining) * 1.15 * opportunity;
  }, 0);
  const conflictMultiplier = sides.size > 1 ? 0.82 : 1;
  const score = Math.min(100, Math.round(raw * conflictMultiplier));
  const level = score >= 60 ? "High" : score >= 30 ? "Medium" : "Low";
  const conflict = sides.size > 1 ? " with mixed exposure" : "";
  return { score, level, explanation: `${exposures.length} connected matchup${exposures.length === 1 ? "" : "s"}${conflict}; ${exposures.filter((item) => Math.abs(item.margin ?? 0) <= 15).length} are within 15 points.` };
}

export function gameLeverage(players) {
  if (!players.length) return { score: 0, level: "Low", explanation: "No direct players from connected matchups." };
  const scores = players.map((player) => playerLeverage(player.exposures ?? []).score);
  const score = Math.min(100, Math.round(Math.max(...scores, 0) * 0.65 + scores.reduce((sum, value) => sum + value, 0) * 0.2));
  return { score, level: score >= 60 ? "High" : score >= 30 ? "Medium" : "Low", explanation: `${players.length} consequential player${players.length === 1 ? "" : "s"}; driven by the highest-impact connected matchups.` };
}

/** Logistic estimate using projected final margin and uncertainty from points remaining. */
export function estimatedWinProbability({ yourPoints, opponentPoints, yourRemaining = 0, opponentRemaining = 0, status = "live", projectionsAvailable = true }) {
  if (status === "final") return yourPoints === opponentPoints ? 50 : yourPoints > opponentPoints ? 100 : 0;
  if (!projectionsAvailable) return null;
  const projectedMargin = yourPoints + yourRemaining - opponentPoints - opponentRemaining;
  const uncertainty = Math.max(7, Math.sqrt(Math.max(1, yourRemaining + opponentRemaining)) * 3.4);
  const probability = 100 / (1 + Math.exp(-projectedMargin / uncertainty));
  return Math.round(Math.max(1, Math.min(99, probability)) / 5) * 5;
}

export function rootingInterests(exposures) {
  const byPlayer = new Map();
  for (const exposure of exposures) byPlayer.set(exposure.playerId, [...(byPlayer.get(exposure.playerId) ?? []), exposure]);
  return [...byPlayer.values()].map((items) => {
    const first = items[0];
    const helps = items.filter((item) => item.side === "you").length;
    const hurts = items.length - helps;
    const leverage = playerLeverage(items);
    let text;
    if (helps && hurts) text = `${first.playerName} helps you in ${helps} league${helps === 1 ? "" : "s"} but hurts you in ${hurts}.`;
    else if (helps && first.pointsNeeded > 0) text = `About ${Math.ceil(first.pointsNeeded)} points from ${first.playerName} would move that matchup to a projected lead.`;
    else if (helps) text = `${first.playerName} is active for you across ${helps} connected matchup${helps === 1 ? "" : "s"}.`;
    else text = `${first.playerName} is an opposing player in ${hurts} connected matchup${hurts === 1 ? "" : "s"}.`;
    return { playerId: first.playerId, playerName: first.playerName, text, ...leverage };
  }).sort((a, b) => b.score - a.score);
}
