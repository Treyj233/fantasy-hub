export function simulationInsights({ strengthRank, teamCount, starters, bench }) {
  const topDrivers = [];
  const riskDrivers = [];
  if (strengthRank > 0 && strengthRank <= Math.ceil(teamCount / 2)) {
    topDrivers.push(`Starting lineup ranks #${strengthRank} of ${teamCount} teams.`);
  } else if (strengthRank > 0) {
    riskDrivers.push(`Starting lineup ranks #${strengthRank} of ${teamCount}. Improving a starting spot would help close the gap.`);
  }
  const unavailable = starters.filter(p => /^(out|ir|injured reserve|suspended|sus|doubtful|inactive|pup|dnr)$/i.test(p.status.trim()));
  const questionable = starters.filter(p => /questionable/i.test(p.status));
  if (unavailable.length) riskDrivers.push(`${unavailable.map(p => p.name).join(', ')}: starting with an availability concern. Prepare a replacement.`);
  if (questionable.length) riskDrivers.push(`${questionable.map(p => p.name).join(', ')}: questionable. Keep a backup ready before kickoff.`);
  const lowOpportunity = starters.filter(p => p.projection < 2 && !unavailable.includes(p));
  if (lowOpportunity.length) riskDrivers.push(`${lowOpportunity.map(p => p.name).join(', ')}: projected below 2 points in the current lineup.`);
  const thin = ['QB','RB','WR','TE'].filter(position =>
    starters.some(p => p.position === position) && !bench.some(p => p.position === position && p.projection >= 5 && !/^(out|ir|injured reserve|suspended|sus|doubtful|inactive|pup|dnr)$/i.test(p.status.trim())));
  if (thin.length) riskDrivers.push(`Limited projected bench cover at ${thin.join(', ')}. An injury or bye could force a waiver move.`);
  return { topDrivers, riskDrivers };
}

export function playoffByeCount(playoffTeams) {
  if (!Number.isInteger(playoffTeams) || playoffTeams < 2) return 0;
  return 2 ** Math.ceil(Math.log2(playoffTeams)) - playoffTeams;
}
