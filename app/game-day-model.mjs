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
    const closestWinPath = items
      .filter((item) => item.side === "you" && item.pointsNeeded > 0)
      .sort((a, b) => a.pointsNeeded - b.pointsNeeded)[0];
    let text;
    if (helps && hurts) text = `${first.playerName} helps you in ${helps} league${helps === 1 ? "" : "s"} but hurts you in ${hurts}.`;
    else if (closestWinPath) text = `You need about ${Math.ceil(closestWinPath.pointsNeeded)} more points from ${first.playerName} to project ahead in ${closestWinPath.leagueName ?? "this league"}.`;
    else if (helps) text = `${first.playerName} is active for you across ${helps} connected matchup${helps === 1 ? "" : "s"}.`;
    else text = `${first.playerName} is an opposing player in ${hurts} connected matchup${hurts === 1 ? "" : "s"}.`;
    return { playerId: first.playerId, playerName: first.playerName, text, ...leverage };
  }).sort((a, b) => b.score - a.score);
}

/**
 * Allocates the projected points still needed to the user's remaining starters.
 * Targets are proportional to each player's remaining projection so the output
 * stays attainable-looking without pretending to predict a specific stat line.
 */
export function whatDoINeed({ yourPoints, opponentPoints, opponentRemaining = 0, players = [], scoring = {} }) {
  const eligible = players.filter((player) => player.projection != null && player.projection > player.points);
  const teamNeed = Math.max(0, opponentPoints + opponentRemaining + 0.01 - yourPoints);
  const remainingWeight = eligible.reduce((sum, player) => sum + Math.max(1, player.projection - player.points), 0);
  if (!eligible.length) return { teamNeed: Number(teamNeed.toFixed(1)), targets: [], message: teamNeed > 0 ? "No remaining projected starters are available to build a target." : "Your current score is above the opponent’s projected finish." };
  if (teamNeed <= 0.05) return { teamNeed: 0, targets: [], message: "Your current score is already above the opponent’s projected finish." };
  const targets = eligible.map((player) => {
    const share = Math.max(1, player.projection - player.points) / remainingWeight;
    const pointsNeeded = Number((teamNeed * share).toFixed(1));
    const targetTotal = player.points + pointsNeeded;
    return { ...player, pointsNeeded, targetTotal: Number(targetTotal.toFixed(1)), progress: Math.min(100, Math.round(player.points / Math.max(0.1, targetTotal) * 100)), statLine: statLineEquivalent(player.position, pointsNeeded, scoring) };
  }).sort((a, b) => b.pointsNeeded - a.pointsNeeded);
  return { teamNeed: Number(teamNeed.toFixed(1)), targets, message: `You need about ${teamNeed.toFixed(1)} more points to finish above your opponent’s projected score.` };
}

export function statLineEquivalent(position, points, scoring = {}) {
  const rounded = Math.max(1, Math.ceil(points));
  if (position === "QB") {
    const passTd = scoring.pass_td ?? 4;
    const passYd = scoring.pass_yd ?? 0.04;
    const yardRate = Math.max(0.001, passYd);
    const candidates = Array.from({ length: 7 }, (_, touchdowns) => {
      const yards = Math.max(0, Math.round((points - touchdowns * passTd) / yardRate / 25) * 25);
      const scored = yards * yardRate + touchdowns * passTd;
      const typicalYards = 125 + touchdowns * 75;
      return { touchdowns, yards, score: Math.abs(scored - points) * 100 + Math.abs(yards - typicalYards) / 25 };
    });
    const best = candidates.sort((a, b) => a.score - b.score || a.touchdowns - b.touchdowns)[0];
    return `about ${best.yards} passing yards and ${best.touchdowns} passing TD${best.touchdowns === 1 ? "" : "s"} (${passTd}-point passing TD scoring)`;
  }
  if (["WR", "TE"].includes(position)) {
    const reception = scoring.rec ?? 1;
    const yardPoint = scoring.rec_yd ?? 0.1;
    const catches = reception > 0 ? Math.min(12, Math.max(1, Math.ceil(points / (reception + 10 * yardPoint)))) : 0;
    const yards = Math.max(0, Math.round((points - catches * reception) / Math.max(0.01, yardPoint) / 5) * 5);
    return `about ${catches} catch${catches === 1 ? "" : "es"} for ${yards} yards`;
  }
  if (position === "RB") {
    const reception = scoring.rec ?? 1;
    const yardPoint = Math.max(scoring.rush_yd ?? 0.1, scoring.rec_yd ?? 0.1);
    const catches = reception > 0 ? Math.min(6, Math.max(0, Math.floor(points / 5))) : 0;
    const yards = Math.max(0, Math.round((points - catches * reception) / yardPoint / 5) * 5);
    return catches ? `about ${yards} scrimmage yards and ${catches} catches` : `about ${yards} scrimmage yards`;
  }
  return `about ${rounded} fantasy points in this league’s scoring`;
}
