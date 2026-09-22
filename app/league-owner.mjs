// Only match verified IDs, never a display name or the first team in a league.
export function resolveLeagueOwner(teams, rosterId, ownerId) {
  const id = value => String(value ?? '').trim();
  const explicit = id(rosterId) && teams.find(team => id(team.id ?? team.roster_id) === id(rosterId));
  if (explicit) return explicit;
  if (!id(ownerId)) return null;
  const matches = teams.filter(team => id(team.ownerId ?? team.owner_id) === id(ownerId) ||
    (team.coOwnerIds ?? team.co_owners ?? []).some(owner => id(owner) === id(ownerId)));
  return matches.length === 1 ? matches[0] : null;
}
