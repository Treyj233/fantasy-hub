import { loadCurrentSnapProfiles, snapProfileFor } from "../../snap-data";
import { loadBlendedPlayerSeasonProfiles, loadBlendedTeamOffenseProfiles, playerSeasonProfileFor } from "../../season-history";
import { fetchEspnLeagueForUser, normalizeEspnLeague } from "../espn";
import { getChatGPTUser } from "../../chatgpt-auth";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { leagueDataSnapshots } from "../../../db/schema";
import { fetchCachedUpstream } from "../upstream-cache";
import { adpPlayerKey, loadEspnAdpByPlayerKey, loadUnderdogAdpByPlayerKey } from "../../adp-data";
import { sleeperFantasyPoints } from "../../sleeper-live-scoring.mjs";

type SourcePlayer = { player_id?: string; full_name?: string; first_name?: string; last_name?: string; position?: string; team?: string; injury_status?: string | null; search_rank?: number; age?: number; status?: string; depth_chart_order?: number | null; depth_chart_position?: string | null };
type SourceProjection = { player_id?: string; stats?: Record<string, number> };
type MatchupRow = { roster_id?: number; matchup_id?: number | null };
type TrendingRow = { player_id?: string; count?: number };

const LEAGUE_PAYLOAD_VERSION = 13;
const LEAGUE_SNAPSHOT_TTL_MS = 30 * 60 * 1000;
const SHARED_TTL_SECONDS = {
  projections: 15 * 60,
  adp: 12 * 60 * 60,
  trends: 20 * 60,
} as const;
const isCurrentFantasyPlayer = (player: SourcePlayer) => {
  const status = (player.status ?? "").trim().toLowerCase();
  return Boolean(player.team) && !/(retired|inactive|deceased)/.test(status);
};

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.trim();
  const forceRefresh = url.searchParams.get("refresh") === "1";
  if (!id) return Response.json({ error: "Invalid league ID" }, { status: 400 });
  const db = await getDb();
  if (!forceRefresh) {
    const [snapshot] = await db.select().from(leagueDataSnapshots).where(and(eq(leagueDataSnapshots.userId, user.userId), eq(leagueDataSnapshots.leagueKey, id))).limit(1);
    if (snapshot && Date.now() - new Date(snapshot.refreshedAt).getTime() < LEAGUE_SNAPSHOT_TTL_MS) {
      try {
        const cached = JSON.parse(snapshot.payloadJson) as { payloadVersion?: number };
        if (cached.payloadVersion === LEAGUE_PAYLOAD_VERSION)
          return Response.json({ ...cached, cache: { status: "fresh", refreshedAt: snapshot.refreshedAt } });
      } catch { /* Refresh malformed or outdated snapshots. */ }
    }
  }
  if (id?.startsWith("espn:")) {
    const [, season, leagueId] = id.split(":");
    if (!leagueId || !/^\d{4,24}$/.test(leagueId))
      return Response.json({ error: "Invalid ESPN league ID" }, { status: 400 });
    try {
      const result = { ...(await normalizeEspnLeague(await fetchEspnLeagueForUser(user.userId, leagueId, Number(season)))), payloadVersion: LEAGUE_PAYLOAD_VERSION };
      const refreshedAt = new Date().toISOString();
      const snapshot = { id: crypto.randomUUID(), userId: user.userId, leagueKey: id, payloadJson: JSON.stringify(result), refreshedAt };
      await db.insert(leagueDataSnapshots).values(snapshot).onConflictDoUpdate({ target: [leagueDataSnapshots.userId, leagueDataSnapshots.leagueKey], set: { payloadJson: snapshot.payloadJson, refreshedAt } });
      return Response.json({ ...result, cache: { status: "refreshed", refreshedAt } });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "ESPN league unavailable" }, { status: 502 });
    }
  }
  if (!id || !/^\d{6,24}$/.test(id)) return Response.json({ error: "Invalid league ID" }, { status: 400 });
  try {
    const [leagueResponse, rostersResponse, usersResponse, playersResponse, tradedPicksResponse, trendingUpResponse, trendingDownResponse] = await Promise.all([
      fetch(`https://api.sleeper.app/v1/league/${id}`, { cache: "no-store" }),
      fetch(`https://api.sleeper.app/v1/league/${id}/rosters`, { cache: "no-store" }),
      fetch(`https://api.sleeper.app/v1/league/${id}/users`, { cache: "no-store" }),
      fetchCachedUpstream("https://api.sleeper.app/v1/players/nfl", 86400),
      fetch(`https://api.sleeper.app/v1/league/${id}/traded_picks`, { cache: "no-store" }).catch(() => null),
      fetchCachedUpstream("https://api.sleeper.app/v1/players/nfl/trending/add?lookback_hours=24&limit=100", SHARED_TTL_SECONDS.trends).catch(() => null),
      fetchCachedUpstream("https://api.sleeper.app/v1/players/nfl/trending/drop?lookback_hours=24&limit=100", SHARED_TTL_SECONDS.trends).catch(() => null),
    ]);
    if (!leagueResponse.ok || !rostersResponse.ok || !usersResponse.ok || !playersResponse.ok) throw new Error("League unavailable");
    const league = await leagueResponse.json() as { name?: string; status?: string; total_rosters?: number; season?: string; leg?: number; roster_positions?: string[]; scoring_settings?: Record<string, number>; settings?: { type?: number; draft_rounds?: number } };
    const rosters = await rostersResponse.json() as { roster_id?: number; owner_id?: string; players?: string[]; starters?: string[]; reserve?: string[]; taxi?: string[] }[];
    const users = await usersResponse.json() as { user_id?: string; display_name?: string; metadata?: { team_name?: string } }[];
    const sourcePlayers = await playersResponse.json() as Record<string, SourcePlayer>;
    const tradedPicks = tradedPicksResponse?.ok ? await tradedPicksResponse.json().catch(() => []) as { season?: string; round?: number; roster_id?: number; owner_id?: number; previous_owner_id?: number }[] : [];
    const trendingUpRows = trendingUpResponse?.ok ? await trendingUpResponse.json().catch(() => []) as TrendingRow[] : [];
    const trendingDownRows = trendingDownResponse?.ok ? await trendingDownResponse.json().catch(() => []) as TrendingRow[] : [];
    const projectionWeek = Math.min(18, Math.max(1, league.leg ?? 1));
    const scoring = league.scoring_settings ?? {};
    const receptionValue = scoring.rec ?? 1;
    const [projectionResponse, matchupResponse, sleeperAdpResponse, espnAdp] = await Promise.all([
      fetchCachedUpstream(`https://api.sleeper.com/projections/nfl/${league.season ?? new Date().getUTCFullYear()}/${projectionWeek}?season_type=regular`, SHARED_TTL_SECONDS.projections).catch(() => null),
      fetch(`https://api.sleeper.app/v1/league/${id}/matchups/${projectionWeek}`, { cache: "no-store" }).catch(() => null),
      fetchCachedUpstream(`https://api.sleeper.com/projections/nfl/${league.season ?? new Date().getUTCFullYear()}?season_type=regular&order_by=adp_ppr`, SHARED_TTL_SECONDS.adp).catch(() => null),
      loadEspnAdpByPlayerKey(Number(league.season ?? new Date().getUTCFullYear())),
    ]);
    const projectionPayload: unknown = projectionResponse?.ok ? await projectionResponse.json().catch(() => []) : [];
    const sourceProjections = Array.isArray(projectionPayload) ? projectionPayload as SourceProjection[] : [];
    const sleeperAdpPayload: unknown = sleeperAdpResponse?.ok ? await sleeperAdpResponse.json().catch(() => []) : [];
    const sleeperAdpRows = Array.isArray(sleeperAdpPayload) ? sleeperAdpPayload as SourceProjection[] : [];
    const matchupRows = matchupResponse?.ok ? await matchupResponse.json().catch(() => []) as MatchupRow[] : [];
    const matchupByRoster = new Map(matchupRows.flatMap((row) => row.roster_id ? [[row.roster_id, row.matchup_id ?? null]] : []));
    const projectionKey = receptionValue >= .75 ? "pts_ppr" : receptionValue >= .25 ? "pts_half_ppr" : "pts_std";
    const leagueProjections = new Map(sourceProjections.flatMap((entry) => {
      if (!entry.player_id || !entry.stats) return [];
      const customPoints = sleeperFantasyPoints(entry.stats, scoring, sourcePlayers[entry.player_id]?.position ?? "");
      const fallbackPoints = entry.stats[projectionKey];
      const points = customPoints > 0 ? customPoints : fallbackPoints;
      return typeof points === "number" ? [[entry.player_id, Number(points.toFixed(2))]] : [];
    }));
    const rosterSlots = league.roster_positions ?? [];
    const slotCounts = rosterSlots.reduce<Record<string, number>>((counts, slot) => ({ ...counts, [slot]: (counts[slot] ?? 0) + 1 }), {});
    const format = league.settings?.type === 2 ? "Dynasty" : league.settings?.type === 1 ? "Keeper" : "Redraft";
    const superflex = ((slotCounts.SUPER_FLEX ?? 0) + (slotCounts.QB_FLEX ?? 0)) > 0;
    const sleeperSingleQbAdpKey = format === "Dynasty" ? (receptionValue >= .75 ? "adp_dynasty_ppr" : receptionValue >= .25 ? "adp_dynasty_half_ppr" : "adp_dynasty_std") : (receptionValue >= .75 ? "adp_ppr" : receptionValue >= .25 ? "adp_half_ppr" : "adp_std");
    const sleeperSuperflexAdpKey = format === "Dynasty" ? "adp_dynasty_2qb" : "adp_2qb";
    const sleeperAdpMap = (key: string) => new Map(sleeperAdpRows.flatMap((entry) => {
      const value = entry.stats?.[key];
      return entry.player_id && typeof value === "number" && value > 0 && value < 999 ? [[entry.player_id, value]] : [];
    }));
    const sleeperSingleQbAdp = sleeperAdpMap(sleeperSingleQbAdpKey);
    const sleeperSuperflexAdp = sleeperAdpMap(sleeperSuperflexAdpKey);
    const underdogSingleQbHalfPprAdp = loadUnderdogAdpByPlayerKey("Single-QB Half PPR");
    const underdogSingleQbFullPprAdp = loadUnderdogAdpByPlayerKey("Single-QB Full PPR");
    const underdogSuperflexHalfPprAdp = loadUnderdogAdpByPlayerKey("Superflex Half PPR");
    const receptionLabel = (scoring.rec ?? 0) >= .75 ? "PPR" : (scoring.rec ?? 0) >= .25 ? "Half PPR" : "Standard";
    const leagueSeason = Number(league.season ?? new Date().getUTCFullYear());
    const [snapProfiles, playerSeasonContext, teamOffenseContext] = await Promise.all([
      loadCurrentSnapProfiles(leagueSeason, projectionWeek),
      loadBlendedPlayerSeasonProfiles(leagueSeason, projectionWeek),
      loadBlendedTeamOffenseProfiles(leagueSeason, projectionWeek),
    ]);
    const playerSeasonProfiles = playerSeasonContext.profiles;
    const teamOffenseProfiles = teamOffenseContext.profiles;
    const statsSourceSeason = playerSeasonContext.sourceSeason;
    const statsBlended = playerSeasonContext.blended || teamOffenseContext.blended;
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
    const internalProjection = (playerId: string, player: SourcePlayer) => {
      const leagueSiteProjection = leagueProjections.get(playerId);
      const position = player.position ?? "";
      const depth = player.depth_chart_order ?? null;
      const status = (player.status ?? "").toLowerCase();
      const injury = (player.injury_status ?? "").toLowerCase();
      const unavailable = injury === "out" || injury === "ir" || status.includes("inactive") || status.includes("injured reserve") || status.includes("practice") || status.includes("suspend");
      if (unavailable) return Math.min(leagueSiteProjection ?? .1, .2);
      if (position === "DEF") return leagueSiteProjection ?? positionBaselines.DEF;
      if (!player.team) return 0;
      const sourceRank = player.search_rank && player.search_rank > 0 ? player.search_rank : 9999;
      const rankFactor = sourceRank <= 25 ? 1.35 : sourceRank <= 60 ? 1.12 : sourceRank <= 120 ? .85 : sourceRank <= 220 ? .55 : sourceRank <= 350 ? .3 : .08;
      const rolePrior = (positionBaselines[position] ?? 5) * rankFactor;
      let projection = typeof leagueSiteProjection === "number" ? leagueSiteProjection * .8 + rolePrior * .2 : rolePrior;
      const depthFactor = depth == null || depth <= 1 ? 1 : depth === 2 ? ({ QB: .18, RB: .72, WR: .76, TE: .78 } as Record<string, number>)[position] ?? .82 : depth === 3 ? ({ QB: .08, RB: .42, WR: .4, TE: .38 } as Record<string, number>)[position] ?? .45 : .15;
      projection *= depthFactor;
      if (injury === "doubtful") projection *= .45;
      else if (injury === "questionable") projection *= .9;
      return Math.max(.1, projection);
    };
    const dynastyAgeAdjustment = (player: SourcePlayer) => {
      if (format === "Redraft" || !player.age) return 0;
      const peakAge = player.position === "RB" ? 24 : player.position === "WR" ? 26 : player.position === "TE" ? 27 : player.position === "QB" ? 29 : 27;
      const distance = player.age - peakAge;
      return distance <= 0 ? Math.max(-2, distance * .35) : -Math.pow(distance, 1.18) * (player.position === "RB" ? 1.55 : player.position === "WR" ? 1.05 : player.position === "TE" ? .85 : .55);
    };
    const supportedPlayerPositions = new Set(["QB", "RB", "WR", "TE"]);
    if ((slotCounts.K ?? 0) > 0) supportedPlayerPositions.add("K");
    if ((slotCounts.DEF ?? 0) + (slotCounts.DST ?? 0) > 0)
      supportedPlayerPositions.add("DEF");
    const rankingPool = Object.entries(sourcePlayers).flatMap(([playerId, player]) => {
      const position = player.position ?? "";
      if (!supportedPlayerPositions.has(position) || !isCurrentFantasyPlayer(player)) return [];
      const sourceRank = player.search_rank && player.search_rank > 0 ? player.search_rank : 9999;
      const projectedPoints = internalProjection(playerId, player);
      const lineupAdjustment = Math.min(11, Math.max(-4, ((positionDemand[position] ?? 0) - 1) * (position === "QB" ? 6.5 : 3.2)));
      const ageAdjustment = dynastyAgeAdjustment(player);
      const availabilityAdjustment = player.injury_status === "Out" || player.injury_status === "IR" ? -5 : player.injury_status ? -1.5 : 0;
      const rankSignal = Math.max(0, 28 - Math.log10(Math.max(1, sourceRank)) * 10.5);
      const opportunityAdjustment = projectedPoints < .5 ? -40 : projectedPoints < 2 ? -24 : projectedPoints < 5 ? -10 : 0;
      const value = projectedPoints * 2.35 + rankSignal + lineupAdjustment + ageAdjustment + availabilityAdjustment + opportunityAdjustment;
      const platformProjection = leagueProjections.get(playerId) ?? 0;
      const name = player.full_name ?? `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim();
      const snapProfile = snapProfileFor(snapProfiles, name);
      const seasonProfile = playerSeasonProfileFor(playerSeasonProfiles, name);
      const seasonTeamOffense = seasonProfile?.team ? teamOffenseProfiles.get(seasonProfile.team) : null;
      const receptionBonus = seasonProfile
        ? seasonProfile.receptions *
          (receptionValue + (position === "TE" ? tePremiumValue : 0))
        : 0;
      const fantasyPoints = seasonProfile ? seasonProfile.fantasyPoints + receptionBonus : null;
      const directSleeperSingleQbAdp = sleeperSingleQbAdp.get(playerId) ?? null;
      const directSleeperSuperflexAdp = sleeperSuperflexAdp.get(playerId) ?? null;
      const directSleeperAdp = (superflex ? directSleeperSuperflexAdp : directSleeperSingleQbAdp) ?? null;
      const directEspnAdp = espnAdp.get(adpPlayerKey(name, position)) ?? null;
      const normalizedAdpKey = adpPlayerKey(name, position);
      const hasCurrentRoleSignal =
        player.depth_chart_order != null ||
        leagueProjections.has(playerId) ||
        directSleeperAdp != null ||
        Boolean(snapProfile?.games) ||
        Boolean(seasonProfile?.games);
      if (!hasCurrentRoleSignal) return [];
      const adpBySite = { Sleeper: directSleeperAdp, "Sleeper Single-QB": directSleeperSingleQbAdp, "Sleeper Superflex": directSleeperSuperflexAdp, ESPN: directEspnAdp, "Underdog Single-QB Half PPR": underdogSingleQbHalfPprAdp.get(normalizedAdpKey) ?? null, "Underdog Single-QB Full PPR": underdogSingleQbFullPprAdp.get(normalizedAdpKey) ?? null, "Underdog Superflex Half PPR": underdogSuperflexHalfPprAdp.get(normalizedAdpKey) ?? null };
      const waiverProjection = platformProjection;
      return [{ id: player.player_id ?? playerId, name, position, team: player.team, opponent: "Matchup pending", projection: platformProjection, leagueProjection: leagueProjections.get(playerId) ?? null, waiverProjection: Number(waiverProjection.toFixed(2)), floor: Number((platformProjection * .68).toFixed(1)), ceiling: Number((platformProjection * 1.38).toFixed(1)), trend: 0, status: player.injury_status ?? "Healthy", role: "Player pool", age: player.age ?? null, rankingValue: Number(value.toFixed(2)), sleeperRank: sourceRank, ageAdjustment: Number(ageAdjustment.toFixed(1)), lineupAdjustment: Number(lineupAdjustment.toFixed(1)), snapPct: snapProfile?.latestPct ?? null, snapAverage: snapProfile?.averagePct ?? null, snapWeek: snapProfile?.latestWeek ?? null, snapSeason: snapProfile?.season ?? null, statsSourceSeason, statsBlended, fantasyPoints2025: fantasyPoints == null ? null : Number(fantasyPoints.toFixed(1)), fantasyPpg2025: seasonProfile?.games ? Number((fantasyPoints! / seasonProfile.games).toFixed(1)) : null, gamesPlayed2025: seasonProfile?.games ?? null, targets2025: seasonProfile?.targets ?? null, receptions2025: seasonProfile?.receptions ?? null, receivingYards2025: seasonProfile?.receivingYards ?? null, receivingTouchdowns2025: seasonProfile?.receivingTouchdowns ?? null, rushingAttempts2025: seasonProfile?.rushingAttempts ?? null, rushingYards2025: seasonProfile?.rushingYards ?? null, rushingTouchdowns2025: seasonProfile?.rushingTouchdowns ?? null, passingAttempts2025: seasonProfile?.passingAttempts ?? null, passingYards2025: seasonProfile?.passingYards ?? null, passingTouchdowns2025: seasonProfile?.passingTouchdowns ?? null, team2025: seasonProfile?.team ?? null, teamOffenseRank2025: seasonTeamOffense?.rank ?? null, teamPointsPerGame2025: seasonTeamOffense?.pointsPerGame ?? null, adpBySite }];
    }).sort((a, b) => b.rankingValue - a.rankingValue).slice(0, 600).map((player, index) => ({ ...player, overallRank: index + 1 }));
    const rankingById = new Map(rankingPool.map((player) => [player.id, player]));
    const rosteredPlayerIds = new Set(rosters.flatMap((roster) => roster.players ?? []));
    const availablePool = league.status === "pre_draft" ? [] : rankingPool.filter((player) => !rosteredPlayerIds.has(player.id));
    const projectionStats = new Map<string, { mean: number; deviation: number }>();
    for (const position of supportedPlayerPositions) {
      const values = availablePool.filter((player) => player.position === position && player.waiverProjection > 0).map((player) => player.waiverProjection);
      const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
      const variance = values.length ? values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length : 0;
      projectionStats.set(position, { mean, deviation: Math.sqrt(variance) || 1 });
    }
    const waiverPlayers = availablePool
      .map((player) => {
        const stats = projectionStats.get(player.position) ?? { mean: 0, deviation: 1 };
        return { ...player, normalizedProjectionScore: Number(((player.waiverProjection - stats.mean) / stats.deviation).toFixed(3)) };
      })
      .sort((a, b) => Number(b.waiverProjection > 0) - Number(a.waiverProjection > 0) || b.normalizedProjectionScore - a.normalizedProjectionScore || b.waiverProjection - a.waiverProjection || b.rankingValue - a.rankingValue)
      .map((player, index) => ({ ...player, waiverRank: index + 1 }));
    const availableById = new Map(waiverPlayers.map((player) => [player.id, player]));
    const trendingFor = (rows: TrendingRow[], direction: "up" | "down") => rows.flatMap((row) => {
      const player = row.player_id ? availableById.get(row.player_id) : undefined;
      return player ? [{ ...player, trendCount: Math.max(0, Math.round(row.count ?? 0)), trendDirection: direction }] : [];
    }).slice(0, 5);
    const waiverTrending = { up: trendingFor(trendingUpRows, "up"), down: trendingFor(trendingDownRows, "down") };
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
      const reserveSet = new Set(roster.reserve ?? []);
      const taxiSet = new Set(roster.taxi ?? []);
      const benchIds = (roster.players ?? []).filter((playerId) => !starterSet.has(playerId));
      const orderedRoster = [
        ...starterIds.map((playerId, index) => ({ playerId, role: league.roster_positions?.[index] ?? "Starter" })),
        ...benchIds.map((playerId) => ({ playerId, role: reserveSet.has(playerId) ? "IR" : taxiSet.has(playerId) ? "TAXI" : "Bench" })),
      ];
      const normalized = orderedRoster.flatMap(({ playerId, role }) => {
        const player = sourcePlayers[playerId];
        if (!player) return [];
        const ranking = rankingById.get(player.player_id ?? playerId);
        const platformProjection = leagueProjections.get(playerId) ?? 0;
        const name = player.full_name ?? `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim();
        const snapProfile = snapProfileFor(snapProfiles, name);
        return [{ ...ranking, id: player.player_id ?? playerId, name, position: player.position ?? "FLEX", team: player.team ?? "FA", opponent: "Matchup pending", projection: platformProjection, leagueProjection: leagueProjections.get(playerId) ?? null, floor: Number((platformProjection * .68).toFixed(1)), ceiling: Number((platformProjection * 1.38).toFixed(1)), trend: 0, status: player.injury_status ?? "Healthy", role, snapPct: snapProfile?.latestPct ?? null, snapAverage: snapProfile?.averagePct ?? null, snapWeek: snapProfile?.latestWeek ?? null, snapSeason: snapProfile?.season ?? null }];
      });
      const rosterId = roster.roster_id ?? rosterIndex + 1;
      const ownedPicks = draftPicks.filter((pick) => pick.ownerRosterId === rosterId).sort((a, b) => a.season - b.season || a.round - b.round);
      return { id: String(rosterId), ownerId: roster.owner_id, managerName, teamName: owner?.metadata?.team_name ?? `${managerName}'s Team`, matchupId: matchupByRoster.get(rosterId) ?? null, roster: normalized, draftCapital: { score: Number(ownedPicks.reduce((sum, pick) => sum + pick.value, 0).toFixed(1)), picks: ownedPicks } };
    });
    const managers = users.flatMap((user, index) => user.user_id ? [{ id: user.user_id, name: user.display_name ?? `Manager ${index + 1}`, teamName: user.metadata?.team_name ?? `${user.display_name ?? `Manager ${index + 1}`}'s Team`, style: "Neutral" as const }] : []);
    const result = { payloadVersion: LEAGUE_PAYLOAD_VERSION, league: { name: league.name ?? "Imported League", platform: "Sleeper", status: league.status ?? "unknown", teams: league.total_rosters, season: league.season, currentWeek: Math.max(0, league.leg ?? 0), projectionWeek, managers: users.length }, teams, managers, rankingContext: { format, scoring: receptionLabel, teams: league.total_rosters ?? rosters.length, rosterSlots, positionDemand, tePremium: tePremiumValue, passTouchdown: scoring.pass_td ?? 4, interception: scoring.pass_int ?? -2, bonusRuleCount, scoringRuleCount: Object.values(scoring).filter((value) => value !== 0).length }, rankings: rankingPool, waiverPlayers, waiverTrending };
    const refreshedAt = new Date().toISOString();
    const snapshot = { id: crypto.randomUUID(), userId: user.userId, leagueKey: id, payloadJson: JSON.stringify(result), refreshedAt };
    await db.insert(leagueDataSnapshots).values(snapshot).onConflictDoUpdate({ target: [leagueDataSnapshots.userId, leagueDataSnapshots.leagueKey], set: { payloadJson: snapshot.payloadJson, refreshedAt } });
    return Response.json({ ...result, cache: { status: "refreshed", refreshedAt } });
  } catch {
    return Response.json({ error: "League unavailable" }, { status: 502 });
  }
}
