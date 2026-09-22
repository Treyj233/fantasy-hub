const teamKey = team => ({ JAC: 'JAX', WSH: 'WAS', LA: 'LAR' })[team] ?? team;
export function weeklyCoverage(players, games) {
  const expected = new Set(games.flatMap(game => [teamKey(game.away.abbreviation), teamKey(game.home.abbreviation)]));
  const covered = new Set(players.filter(player => Number(player.leagueProjection ?? player.projection) > 0).map(player => teamKey(player.team)));
  const missing = [...expected].filter(team => !covered.has(team));
  return { ready: expected.size > 0 && missing.length === 0, missing };
}
