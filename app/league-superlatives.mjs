/** Result-only awards. Equal scores share honors; missing player scores never become zero. */
export function leagueSuperlatives(games, previousGames, playerName) {
  const awards = [];
  const add = (id, label, candidates) => {
    const valid = candidates.filter((entry) => Number.isFinite(entry.value));
    if (!valid.length) return;
    const best = Math.max(...valid.map((entry) => entry.value));
    const winners = valid.filter((entry) => Math.abs(entry.value - best) < 0.000001);
    awards.push({ id, label, recipient: winners.map((entry) => entry.name).join(" · "), detail: `${winners[0].detail}${winners.length > 1 ? " · Shared honors" : ""}` });
  };
  const decided = games.filter(({ teams }) => teams.length === 2 && teams.every((team) => Number.isFinite(team.points)) && teams[0].points !== teams[1].points);
  const winners = decided.map(({ teams }) => teams[0].points > teams[1].points ? teams[0] : teams[1]);
  const losers = decided.map(({ teams }) => teams[0].points < teams[1].points ? teams[0] : teams[1]);
  add("hard-luck", "HARD-LUCK LOSS", losers.map((team) => ({ value: team.points, name: team.teamName, detail: `${team.points.toFixed(1)} points · Highest-scoring loss` })));
  add("just-enough", "JUST ENOUGH", winners.map((team) => ({ value: -team.points, name: team.teamName, detail: `${team.points.toFixed(1)} points · Lowest-scoring win` })));
  add("shootout", "SHOOTOUT", games.map(({ teams }) => {
    const total = teams.reduce((sum, team) => sum + team.points, 0);
    return { value: total, name: teams.map((team) => team.teamName).join(" vs "), detail: `${total.toFixed(1)} combined points` };
  }));
  const teams = games.flatMap((game) => game.teams);
  for (const bench of [false, true]) {
    add(bench ? "bench-spark" : "mvp", bench ? "BENCH FIREPOWER" : "WEEKLY MVP", teams.flatMap((team) => [...new Set(bench ? team.players : team.starters)].filter((id) => id !== "0" && (!bench || !team.starters.includes(id))).flatMap((id) => {
      const points = team.playerPoints[id];
      return Number.isFinite(points) && points > 0 ? [{ value: points, name: `${playerName(id)} · ${team.teamName}`, detail: `${points.toFixed(1)} points · ${bench ? "Highest bench score" : "Highest starting-player score"}` }] : [];
    })));
  }
  const previous = new Map(previousGames.flatMap((game) => game.teams).map((team) => [team.rosterId, team.points]));
  add("bounce-back", "BIGGEST BOUNCE-BACK", teams.flatMap((team) => {
    const before = previous.get(team.rosterId);
    const gain = team.points - before;
    return Number.isFinite(before) && gain > 0 ? [{ value: gain, name: team.teamName, detail: `+${gain.toFixed(1)} points vs last week` }] : [];
  }));
  return awards;
}
