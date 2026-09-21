// Overlay lightweight lineup updates without recalculating season rankings.
export function applyRosterSnapshot(payload, rosters) {
  if (!Array.isArray(rosters) || !payload.teams?.length) return payload;
  const players = new Map([
    ...(payload.rankings ?? []), ...(payload.waiverPlayers ?? []),
    ...payload.teams.flatMap(team => team.roster ?? []),
  ].map(player => [String(player.id), player]));
  const owned = new Set(rosters.flatMap(roster => roster.players ?? []));
  const slots = payload.rankingContext?.rosterSlots ?? [];
  const teams = payload.teams.map(team => {
    const roster = rosters.find(row => String(row.roster_id) === String(team.id));
    if (!roster || !Array.isArray(roster.players) || !Array.isArray(roster.starters)) return team;
    // Unknown recent additions need a full import, never silently omit them.
    if (roster.players.some(id => !players.has(String(id)))) return team;
    const starters = roster.starters;
    const ids = [...starters.filter(id => id && id !== '0'), ...roster.players.filter(id => !starters.includes(id))];
    return { ...team, roster: ids.flatMap(id => {
      const player = players.get(String(id));
      if (!player) return [];
      const index = starters.indexOf(id);
      const role = index >= 0 ? slots[index] ?? 'Starter' : (roster.reserve ?? []).includes(id) ? 'IR' : (roster.taxi ?? []).includes(id) ? 'TAXI' : 'Bench';
      return [{ ...player, role }];
    }) };
  });
  return { ...payload, teams, waiverPlayers: payload.waiverPlayers?.filter(player => !owned.has(String(player.id))) };
}
