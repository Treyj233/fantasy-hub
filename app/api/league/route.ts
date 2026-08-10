type SourcePlayer = { player_id?: string; full_name?: string; first_name?: string; last_name?: string; position?: string; team?: string; injury_status?: string | null; search_rank?: number; age?: number };
type SourceProjection = { player_id?: string; stats?: Record<string, number> };

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id || !/^\d{6,24}$/.test(id)) return Response.json({ error: "Invalid league ID" }, { status: 400 });
  try {
    const [leagueResponse, rostersResponse, usersResponse, playersResponse, tradedPicksResponse] = await Promise.all([
      fetch(`https://api.sleeper.app/v1/league/${id}`, { next: { revalidate: 300 } }),
      fetch(`https://api.sleeper.app/v1/league/${id}/rosters`, { next: { revalidate: 300 } }),
      fetch(`https://api.sleeper.app/v1/league/${id}/users`, { next: { revalidate: 300 } }),
      fetch("https://api.sleeper.app/v1/players/nfl?active=true", { next: { revalidate: 86400 } }),
      fetch(`https://api.sleeper.app/v1/league/${id}/traded_picks`, { next: { revalidate: 300 } }).catch(() => null),
    ]);
    if (!leagueResponse.ok || !rostersResponse.ok || !usersResponse.ok || !playersResponse.ok) throw new Error("League unavailable");
    const league = await leagueResponse.json() as { name?: string; status?: string; total_rosters?: number; season?: string; leg?: number; roster_positions?: string[]; scoring_settings?: Record<string, number>; settings?: { type?: number; draft_rounds?: number } };
    const rosters = await rostersResponse.json() as { roster_id?: number; owner_id?: string; players?: string[]; starters?: string[] }[];
    const users = await usersResponse.json() as { user_id?: string; display_name?: string; metadata?: { team_name?: string } }[];
    const sourcePlayers = await playersResponse.json() as Record<string, SourcePlayer>;
    const tradedPicks = tradedPicksResponse?.ok ? await tradedPicksResponse.json().catch(() => []) as { season?: string; round?: number; roster_id?: number; owner_id?: number; previous_owner_id?: number }[] : [];
    const projectionResponse = await fetch(`https://api.sleeper.com/projections/nfl/${league.season ?? new Date().getUTCFullYear()}/${league.leg ?? 1}?season_type=regular`, { next: { revalidate: 3600 } }).catch(() => null);
    const projectionPayload: unknown = projectionResponse?.ok ? await projectionResponse.json().catch(() => []) : [];
    const sourceProjections = Array.isArray(projectionPayload) ? projectionPayload as SourceProjection[] : [];
    const scoring = league.scoring_settings ?? {};
    const receptionValue = scoring.rec ?? 1;
    const projectionKey = receptionValue >= .75 ? "pts_ppr" : receptionValue >= .25 ? "pts_half_ppr" : "pts_std";
    const platformProjections = new Map(sourceProjections.flatMap((entry) => entry.player_id && typeof entry.stats?.[projectionKey] === "number" ? [[entry.player_id, entry.stats[projectionKey]]] : []));
    const scoreProjectedStats = (playerId: string, stats: Record<string, number>) => {
      const position = sourcePlayers[playerId]?.position ?? "";
      let total = Object.entries(scoring).reduce((points, [statKey, multiplier]) => points + (typeof stats[statKey] === "number" ? stats[statKey] * multiplier : 0), 0);
      const positionReceptionKey = position === "TE" ? "bonus_rec_te" : position === "RB" ? "bonus_rec_rb" : position === "WR" ? "bonus_rec_wr" : "";
      if (positionReceptionKey && typeof scoring[positionReceptionKey] === "number" && typeof stats[positionReceptionKey] !== "number") total += (stats.rec ?? 0) * scoring[positionReceptionKey];
      if (position === "TE" && typeof scoring.rec_te === "number" && typeof stats.rec_te !== "number") total += (stats.rec ?? 0) * scoring.rec_te;
      return total;
    };
    const leagueProjections = new Map(sourceProjections.flatMap((entry) => {
      if (!entry.player_id || !entry.stats) return [];
      const customPoints = scoreProjectedStats(entry.player_id, entry.stats);
      const fallbackPoints = entry.stats[projectionKey];
      const points = customPoints > 0 ? customPoints : fallbackPoints;
      return typeof points === "number" ? [[entry.player_id, Number(points.toFixed(2))]] : [];
    }));
    const rosterSlots = league.roster_positions ?? [];
    const slotCounts = rosterSlots.reduce<Record<string, number>>((counts, slot) => ({ ...counts, [slot]: (counts[slot] ?? 0) + 1 }), {});
    const format = league.settings?.type === 2 ? "Dynasty" : league.settings?.type === 1 ? "Keeper" : "Redraft";
    const receptionLabel = (scoring.rec ?? 0) >= .75 ? "PPR" : (scoring.rec ?? 0) >= .25 ? "Half PPR" : "Standard";
    const tePremiumValue = (scoring.bonus_rec_te ?? 0) + (scoring.rec_te ?? 0);
    const bonusRuleCount = Object.entries(scoring).filter(([key, value]) => key.startsWith("bonus_") && value !== 0).length;
    const flexDemand = (slotCounts.FLEX ?? 0) + (slotCounts.WR_RB_FLEX ?? 0) + (slotCounts.REC_FLEX ?? 0);
    const superflexDemand = (slotCounts.SUPER_FLEX ?? 0) + (slotCounts.QB_FLEX ?? 0);
    const positionDemand: Record<string, number> = {
      QB: (slotCounts.QB ?? 0) + superflexDemand * .85,
      RB: (slotCounts.RB ?? 0) + flexDemand * .38 + superflexDemand * .05,
      WR: (slotCounts.WR ?? 0) + flexDemand * .48 + superflexDemand * .05,
      TE: (slotCounts.TE ?? 0) + flexDemand * .14 + superflexDemand * .05,
      K: slotCounts.K ?? 0,
      DEF: (slotCounts.DEF ?? 0) + (slotCounts.DST ?? 0),
    };
    const positionBaselines: Record<string, number> = { QB: 21, RB: 15, WR: 14, TE: 11, K: 8, DEF: 8 };
    const dynastyAgeAdjustment = (player: SourcePlayer) => {
      if (format === "Redraft" || !player.age) return 0;
      const peakAge = player.position === "RB" ? 24 : player.position === "WR" ? 26 : player.position === "TE" ? 27 : player.position === "QB" ? 29 : 27;
      const distance = player.age - peakAge;
      return distance <= 0 ? Math.max(-2, distance * .35) : -Math.pow(distance, 1.18) * (player.position === "RB" ? 1.55 : player.position === "WR" ? 1.05 : player.position === "TE" ? .85 : .55);
    };
    const rankingPool = Object.entries(sourcePlayers).flatMap(([playerId, player]) => {
      const position = player.position ?? "";
      if (!['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].includes(position) || !player.team) return [];
      const sourceRank = player.search_rank && player.search_rank > 0 ? player.search_rank : 9999;
      const projectedPoints = leagueProjections.get(playerId) ?? Math.max(2, (positionBaselines[position] ?? 8) - Math.log10(Math.max(2, sourceRank)) * 2.15);
      const lineupAdjustment = Math.min(11, Math.max(-4, ((positionDemand[position] ?? 0) - 1) * (position === "QB" ? 6.5 : 3.2)));
      const ageAdjustment = dynastyAgeAdjustment(player);
      const availabilityAdjustment = player.injury_status === "Out" || player.injury_status === "IR" ? -5 : player.injury_status ? -1.5 : 0;
      const rankSignal = Math.max(0, 28 - Math.log10(Math.max(1, sourceRank)) * 10.5);
      const value = projectedPoints * 2.35 + rankSignal + lineupAdjustment + ageAdjustment + availabilityAdjustment;
      return [{ id: player.player_id ?? playerId, name: player.full_name ?? `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim(), position, team: player.team, opponent: "Matchup pending", projection: Number(projectedPoints.toFixed(1)), leagueProjection: platformProjections.get(playerId) ?? null, floor: Number((projectedPoints * .6).toFixed(1)), ceiling: Number((projectedPoints * 1.5).toFixed(1)), trend: 0, status: player.injury_status ?? "Healthy", role: "Player pool", age: player.age ?? null, rankingValue: Number(value.toFixed(2)), ageAdjustment: Number(ageAdjustment.toFixed(1)), lineupAdjustment: Number(lineupAdjustment.toFixed(1)) }];
    }).sort((a, b) => b.rankingValue - a.rankingValue).slice(0, 600).map((player, index) => ({ ...player, overallRank: index + 1 }));
    const rosteredPlayerIds = new Set(rosters.flatMap((roster) => roster.players ?? []));
    const waiverPlayers = league.status === "pre_draft" ? [] : rankingPool.filter((player) => !rosteredPlayerIds.has(player.id)).slice(0, 75);
    const draftRounds = Math.max(1, Math.min(8, league.settings?.draft_rounds ?? 5));
    const firstFutureSeason = Number(league.season ?? new Date().getUTCFullYear()) + 1;
    const draftSeasons = [firstFutureSeason, firstFutureSeason + 1, firstFutureSeason + 2];
    const tradedOwnership = new Map(tradedPicks.flatMap((pick) => pick.season && pick.round && pick.roster_id && pick.owner_id ? [[`${pick.season}-${pick.round}-${pick.roster_id}`, pick.owner_id]] : []));
    const draftPicks = draftSeasons.flatMap((season, yearIndex) => rosters.flatMap((originalRoster) => Array.from({ length: draftRounds }, (_, roundIndex) => {
      const round = roundIndex + 1;
      const originalRosterId = originalRoster.roster_id ?? 0;
      const ownerRosterId = tradedOwnership.get(`${season}-${round}-${originalRosterId}`) ?? originalRosterId;
      const roundWeight = [0, 100, 65, 40, 24, 14, 9, 6, 4][round] ?? 3;
      return { season, round, originalRosterId, ownerRosterId, value: Number((roundWeight * Math.pow(.86, yearIndex)).toFixed(1)) };
    })));
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
        const projection = leagueProjections.get(playerId) ?? Math.max(5, 21 - index * .72 - Math.max(0, (player.search_rank ?? 100) - 50) * .01);
        return [{ id: player.player_id ?? playerId, name: player.full_name ?? `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim(), position: player.position ?? "FLEX", team: player.team ?? "FA", opponent: "Matchup pending", projection: Number(projection.toFixed(1)), leagueProjection: platformProjections.get(playerId) ?? null, floor: Number((projection * .58).toFixed(1)), ceiling: Number((projection * 1.52).toFixed(1)), trend: 0, status: player.injury_status ?? "Healthy", role }];
      });
      const rosterId = roster.roster_id ?? rosterIndex + 1;
      const ownedPicks = draftPicks.filter((pick) => pick.ownerRosterId === rosterId).sort((a, b) => a.season - b.season || a.round - b.round);
      return { id: String(rosterId), ownerId: roster.owner_id, managerName, teamName: owner?.metadata?.team_name ?? `${managerName}'s Team`, roster: normalized, draftCapital: { score: Number(ownedPicks.reduce((sum, pick) => sum + pick.value, 0).toFixed(1)), picks: ownedPicks } };
    });
    const managers = users.flatMap((user, index) => user.user_id ? [{ id: user.user_id, name: user.display_name ?? `Manager ${index + 1}`, teamName: user.metadata?.team_name ?? `${user.display_name ?? `Manager ${index + 1}`}'s Team`, style: "Neutral" as const }] : []);
    return Response.json({ league: { name: league.name ?? "Imported League", status: league.status ?? "unknown", teams: league.total_rosters, season: league.season, managers: users.length }, teams, managers, rankingContext: { format, scoring: receptionLabel, teams: league.total_rosters ?? rosters.length, rosterSlots, positionDemand, tePremium: tePremiumValue, passTouchdown: scoring.pass_td ?? 4, interception: scoring.pass_int ?? -2, bonusRuleCount, scoringRuleCount: Object.values(scoring).filter((value) => value !== 0).length }, rankings: rankingPool, waiverPlayers });
  } catch {
    return Response.json({ error: "League unavailable" }, { status: 502 });
  }
}
