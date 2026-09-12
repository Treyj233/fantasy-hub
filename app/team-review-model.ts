export type ReviewPlayer = { id: string; name: string; position: string; team: string; status: string; value: number; projection?: number; age?: number | null };
export type ReviewTeam = { id: string; teamName: string; roster: ReviewPlayer[] };
export type ReviewContext = { rosterSlots: string[]; format: string; scoring: string; tePremium: number; passTouchdown: number };
const eligible: Record<string, string[]> = {
  QB: ['QB'], RB: ['RB'], WR: ['WR'], TE: ['TE'], FLEX: ['RB', 'WR', 'TE'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'], QB_FLEX: ['QB', 'RB', 'WR', 'TE'],
  REC_FLEX: ['WR', 'TE'], WRRB_FLEX: ['WR', 'RB'], WR_RB: ['WR', 'RB'],
  WR_RB_FLEX: ['WR', 'RB'], RB_WR_FLEX: ['WR', 'RB'], 'W/R': ['WR', 'RB'],
  'W/R/T': ['RB', 'WR', 'TE'], SUPERFLEX: ['QB', 'RB', 'WR', 'TE'], 'Q/W/R/T': ['QB', 'RB', 'WR', 'TE'],
  RB_WR: ['RB', 'WR'], WR_TE: ['WR', 'TE'], OP: ['QB', 'RB', 'WR', 'TE'],
};
const reserve = new Set(['BN', 'BE', 'BENCH', 'IR', 'TAXI', 'RESERVE']);
export const reviewUnavailable = (p: ReviewPlayer) => /^(out|ir|injured reserve|suspended|pup|nfi|doubtful)(\b|$)/i.test(p.status);
export function reviewStructure(context: ReviewContext) {
  const slots = context.rosterSlots.map(s => s.toUpperCase()).filter(s => eligible[s]);
  const unsupported = context.rosterSlots.map(s => s.toUpperCase()).filter(s => !eligible[s] && !reserve.has(s));
  const flex = slots.filter(s => eligible[s].length > 1 && !eligible[s].includes('QB')).length;
  const wr = slots.filter(s => s === 'WR').length;
  const skillSlots = slots.filter(s => !eligible[s].includes('QB')).length;
  const deep = Math.max(0, Math.min(1, (skillSlots - 5) / 3));
  return { slots, unsupported, flex, wr, skillSlots, deep,
    superflex: slots.some(s => eligible[s].length > 1 && eligible[s].includes('QB')),
    weights: { starters: .78 - .2 * deep, balance: .12 + .12 * deep, depth: .10 + .08 * deep } };
}

// Weighted matching: select highest-value players, reassigning already selected
// players when necessary so flex slots never steal a required QB/TE/RB/WR.
export function reviewLineup(roster: ReviewPlayer[], slots: string[]) {
  const assigned: (ReviewPlayer | null)[] = slots.map(() => null);
  const orderedSlots = slots.map((_, i) => i).sort((a, b) => eligible[slots[a]].length - eligible[slots[b]].length);
  const place = (player: ReviewPlayer, seen: Set<number>): boolean => {
    for (const i of orderedSlots) {
      if (seen.has(i) || !eligible[slots[i]].includes(player.position)) continue;
      seen.add(i);
      const previous = assigned[i];
      if (!previous || place(previous, seen)) { assigned[i] = player; return true; }
    }
    return false;
  };
  const unique = [...new Map(roster.map(p => [p.id, p])).values()];
  unique.filter(p => !reviewUnavailable(p)).sort((a, b) => b.value - a.value || a.id.localeCompare(b.id)).forEach(p => place(p, new Set()));
  return slots.map((slot, i) => ({ slot, player: assigned[i] }));
}

export function evaluateReviewTeam(team: ReviewTeam, context: ReviewContext) {
  const structure = reviewStructure(context);
  const lineup = reviewLineup(team.roster, structure.slots);
  const used = new Set(lineup.flatMap(row => row.player ? [row.player.id] : []));
  const values = lineup.map(row => row.player?.value ?? 0);
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const starterScore = avg(values);
  const balanceScore = avg([...values].sort((a, b) => a - b).slice(0, Math.max(1, Math.ceil(values.length / 3))));
  const depth = team.roster.filter(p => !used.has(p.id) && !reviewUnavailable(p) && structure.slots.some(s => eligible[s].includes(p.position))).sort((a, b) => b.value - a.value);
  const depthNeeded = Math.max(2, Math.ceil(structure.slots.length / 3));
  const depthScore = depth.slice(0, depthNeeded).reduce((sum, p) => sum + p.value, 0) / depthNeeded;
  const score = starterScore * structure.weights.starters + balanceScore * structure.weights.balance + depthScore * structure.weights.depth;
  const rooms = ['QB', 'RB', 'WR', 'TE'].filter(pos => structure.slots.some(s => eligible[s].includes(pos))).map(position => {
    const starters = lineup.filter(row => row.player?.position === position);
    const required = structure.slots.filter(s => s === position).length;
    const count = Math.max(required, starters.length, 1);
    const score = starters.reduce((sum, row) => sum + (row.player?.value ?? 0), 0) / count;
    return { position, score, starters: starters.flatMap(row => row.player ? [row.player] : []), backups: depth.filter(p => p.position === position) };
  });
  return { id: team.id, teamName: team.teamName, score, starterScore, balanceScore, depthScore, lineup, rooms, depth, vacancies: lineup.filter(row => !row.player).length };
}

export function buildTeamReview(teams: ReviewTeam[], selectedTeamId: string, context: ReviewContext) {
  const structure = reviewStructure(context);
  if (!structure.slots.length) throw new Error('Supported offensive starter settings are required.');
  const assessed = teams.map(t => evaluateReviewTeam(t, context));
  const mine = assessed.find(t => t.id === selectedTeamId);
  const source = teams.find(t => t.id === selectedTeamId);
  if (!mine || !source || teams.length < 2 || !source.roster.length) throw new Error('Select a team and load league rosters first.');
  const rank = (metric: 'score' | 'starterScore' | 'balanceScore' | 'depthScore') => 1 + assessed.filter(t => t[metric] > mine[metric] + .001).length;
  const rooms = mine.rooms.map(room => ({ ...room,
    rank: 1 + assessed.filter(t => (t.rooms.find(r => r.position === room.position)?.score ?? 0) > room.score + .001).length,
    leagueAverage: assessed.reduce((sum, t) => sum + (t.rooms.find(r => r.position === room.position)?.score ?? 0), 0) / teams.length,
  }));
  const strengths = [...rooms].sort((a, b) => a.rank - b.rank || b.score - a.score);
  const weaknesses = [...rooms].sort((a, b) => (a.score - a.leagueAverage) - (b.score - b.leagueAverage));
  const overallRank = rank('score');
  const belowAverage = rooms.filter(r => r.score < r.leagueAverage * .9);
  const injuries = source.roster.filter(p => /questionable|doubtful|^out$|^ir$|suspend|pup|nfi/i.test(p.status));
  const verdict = mine.vacancies ? 'Needs Reinforcements'
    : overallRank <= Math.max(1, Math.floor(teams.length * .15)) && belowAverage.length === 0 && rank('depthScore') <= Math.ceil(teams.length / 2) ? 'Powerhouse'
    : overallRank <= Math.ceil(teams.length / 3) ? 'Contender'
    : rank('starterScore') <= Math.ceil(teams.length / 2) && rank('depthScore') > Math.ceil(teams.length * .65) ? 'Top-Heavy'
    : belowAverage.length === 0 ? 'Balanced'
    : overallRank <= Math.ceil(teams.length * .65) ? 'In the Hunt'
    : 'Needs Reinforcements';
  const targetPositions = weaknesses.filter(r => r.score < r.leagueAverage || !r.backups.length).slice(0, 2).map(r => r.position);
  const teamCounts = new Map<string, number>();
  mine.lineup.forEach(row => { if (row.player?.team) teamCounts.set(row.player.team, (teamCounts.get(row.player.team) ?? 0) + 1); });
  return { ...mine, structure, rooms, strengths, weaknesses, verdict, overallRank, leagueSize: teams.length,
    balanceRank: rank('balanceScore'), depthRank: rank('depthScore'), starterRank: rank('starterScore'),
    injuries, targetPositions, concentration: [...teamCounts].filter(([, count]) => count >= 3),
    peers: assessed.map(t => ({ id: t.id, rooms: t.rooms.map(r => ({ position: r.position, score: r.score })) })),
    summary: mine.vacancies ? `${mine.vacancies} required offensive slot${mine.vacancies === 1 ? '' : 's'} cannot be filled by currently available players. Restore coverage before making consolidation trades.`
      : `${strengths[0].position} is your strongest relative room (#${strengths[0].rank}). ${belowAverage.length ? `${weaknesses[0].position} is the clearest improvement area` : 'No position is materially below the league average'}; ${rank('depthScore') > Math.ceil(teams.length / 2) ? 'backup coverage is the next pressure point.' : 'usable depth gives you room to respond.'}`,
  };
}
export type TeamReviewReport = ReturnType<typeof buildTeamReview>;
