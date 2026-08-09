type SourcePlayer = { player_id?: string; full_name?: string; first_name?: string; last_name?: string; position?: string; team?: string; injury_status?: string | null; search_rank?: number };
type SourceProjection = { player_id?: string; stats?: { pts_ppr?: number; pts_half_ppr?: number; pts_std?: number } };

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id || !/^\d{6,24}$/.test(id)) return Response.json({ error: "Invalid league ID" }, { status: 400 });
  try {
    const [leagueResponse, rostersResponse, usersResponse, playersResponse] = await Promise.all([
      fetch(`https://api.sleeper.app/v1/league/${id}`, { next: { revalidate: 300 } }),
      fetch(`https://api.sleeper.app/v1/league/${id}/rosters`, { next: { revalidate: 300 } }),
      fetch(`https://api.sleeper.app/v1/league/${id}/users`, { next: { revalidate: 300 } }),
      fetch("https://api.sleeper.app/v1/players/nfl?active=true", { next: { revalidate: 86400 } }),
    ]);
    if (!leagueResponse.ok || !rostersResponse.ok || !usersResponse.ok || !playersResponse.ok) throw new Error("League unavailable");
    const league = await leagueResponse.json() as { name?: string; total_rosters?: number; season?: string; leg?: number; roster_positions?: string[]; scoring_settings?: { rec?: number } };
    const rosters = await rostersResponse.json() as { roster_id?: number; owner_id?: string; players?: string[]; starters?: string[] }[];
    const users = await usersResponse.json() as { user_id?: string; display_name?: string; metadata?: { team_name?: string } }[];
    const sourcePlayers = await playersResponse.json() as Record<string, SourcePlayer>;
    const projectionResponse = await fetch(`https://api.sleeper.com/projections/nfl/${league.season ?? new Date().getUTCFullYear()}/${league.leg ?? 1}?season_type=regular`, { next: { revalidate: 3600 } }).catch(() => null);
    const projectionPayload: unknown = projectionResponse?.ok ? await projectionResponse.json().catch(() => []) : [];
    const sourceProjections = Array.isArray(projectionPayload) ? projectionPayload as SourceProjection[] : [];
    const receptionValue = league.scoring_settings?.rec ?? 1;
    const projectionKey = receptionValue >= .75 ? "pts_ppr" : receptionValue >= .25 ? "pts_half_ppr" : "pts_std";
    const leagueProjections = new Map(sourceProjections.flatMap((entry) => entry.player_id && typeof entry.stats?.[projectionKey] === "number" ? [[entry.player_id, entry.stats[projectionKey]]] : []));
    const userById = new Map(users.flatMap((user) => user.user_id ? [[user.user_id, user]] : []));
    const teams = rosters.map((roster, rosterIndex) => {
      const owner = roster.owner_id ? userById.get(roster.owner_id) : undefined;
      const managerName = owner?.display_name ?? `Manager ${rosterIndex + 1}`;
      const starterIds = roster.starters ?? [];
      const starterSet = new Set(starterIds);
      const benchIds = (roster.players ?? []).filter((playerId) => !starterSet.has(playerId));
      const orderedRoster = [
        ...starterIds.map((playerId, index) => ({ playerId, role: league.roster_positions?.[index] ?? "Starter" })),
        ...benchIds.map((playerId) => ({ playerId, role: "Bench" })),
      ];
      const normalized = orderedRoster.slice(0, 24).flatMap(({ playerId, role }, index) => {
        const player = sourcePlayers[playerId];
        if (!player) return [];
        const projection = Math.max(5, 21 - index * .72 - Math.max(0, (player.search_rank ?? 100) - 50) * .01);
        return [{ id: player.player_id ?? playerId, name: player.full_name ?? `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim(), position: player.position ?? "FLEX", team: player.team ?? "FA", opponent: "Matchup pending", projection: Number(projection.toFixed(1)), leagueProjection: leagueProjections.get(playerId) ?? null, floor: Number((projection * .58).toFixed(1)), ceiling: Number((projection * 1.52).toFixed(1)), trend: 0, status: player.injury_status ?? "Healthy", role }];
      });
      return { id: String(roster.roster_id ?? rosterIndex + 1), ownerId: roster.owner_id, managerName, teamName: owner?.metadata?.team_name ?? `${managerName}'s Team`, roster: normalized };
    });
    const managers = users.flatMap((user, index) => user.user_id ? [{ id: user.user_id, name: user.display_name ?? `Manager ${index + 1}`, teamName: user.metadata?.team_name ?? `${user.display_name ?? `Manager ${index + 1}`}'s Team`, style: "Neutral" as const }] : []);
    return Response.json({ league: { name: league.name ?? "Imported League", teams: league.total_rosters, season: league.season, managers: users.length }, teams, managers });
  } catch {
    return Response.json({ error: "League unavailable" }, { status: 502 });
  }
}
