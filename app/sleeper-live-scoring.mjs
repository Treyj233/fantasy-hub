const pointsAllowedBands = [
  ["pts_allow_0", 0, 0],
  ["pts_allow_1_6", 1, 6],
  ["pts_allow_7_13", 7, 13],
  ["pts_allow_14_20", 14, 20],
  ["pts_allow_21_27", 21, 27],
  ["pts_allow_28_34", 28, 34],
  ["pts_allow_35p", 35, Number.POSITIVE_INFINITY],
];

const yardsAllowedBands = [
  ["yds_allow_0_100", 0, 100],
  ["yds_allow_100_199", 100, 199],
  ["yds_allow_200_299", 200, 299],
  ["yds_allow_300_349", 300, 349],
  ["yds_allow_350_399", 350, 399],
  ["yds_allow_400_449", 400, 449],
  ["yds_allow_450_499", 450, 499],
  ["yds_allow_500_549", 500, 549],
  ["yds_allow_550p", 550, Number.POSITIVE_INFINITY],
];

function thresholdBonus(key, stats) {
  const match = /^bonus_(pass|rush|rec)_yd_(\d+)$/.exec(key);
  if (!match) return null;
  return Number(stats[`${match[1]}_yd`] ?? 0) >= Number(match[2]) ? 1 : 0;
}

function bandValue(key, stats, bands, statKey) {
  const band = bands.find(([name]) => name === key);
  if (!band || typeof stats[statKey] !== "number") return null;
  const value = Number(stats[statKey]);
  return value >= band[1] && value <= band[2] ? 1 : 0;
}

export function sleeperFantasyPoints(stats = {}, scoring = {}, position = "") {
  let total = 0;
  for (const [key, weight] of Object.entries(scoring)) {
    if (!Number.isFinite(weight) || weight === 0) continue;
    let value = typeof stats[key] === "number" ? Number(stats[key]) : null;
    if (value == null && key === "bonus_rec_te") value = position === "TE" ? Number(stats.rec ?? 0) : 0;
    if (value == null) value = thresholdBonus(key, stats);
    if (value == null) value = bandValue(key, stats, pointsAllowedBands, "pts_allow");
    if (value == null) value = bandValue(key, stats, yardsAllowedBands, "yds_allow");
    if (value != null) total += value * Number(weight);
  }
  return Number(total.toFixed(2));
}

export function liveTeamPoints(players, customPoints = null) {
  if (typeof customPoints === "number") return Number(customPoints.toFixed(2));
  return Number(players.filter((player) => player.isStarter).reduce((sum, player) => sum + player.points, 0).toFixed(2));
}
