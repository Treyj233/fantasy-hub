type EspnMember = { id?: string; displayName?: string; firstName?: string; lastName?: string };
type EspnPlayer = {
  id?: number;
  fullName?: string;
  defaultPositionId?: number;
  proTeamId?: number;
  injured?: boolean;
  injuryStatus?: string;
  ownership?: { percentOwned?: number };
  stats?: { scoringPeriodId?: number; statSourceId?: number; appliedTotal?: number }[];
};
type EspnRosterEntry = { lineupSlotId?: number; playerPoolEntry?: { player?: EspnPlayer } };
type EspnTeam = { id?: number; abbrev?: string; name?: string; location?: string; nickname?: string; primaryOwner?: string; owners?: string[]; roster?: { entries?: EspnRosterEntry[] }; record?: { overall?: { wins?: number; losses?: number; ties?: number } } };
export type EspnPayload = {
  id?: number;
  seasonId?: number;
  scoringPeriodId?: number;
  status?: { currentMatchupPeriod?: number; isActive?: boolean; latestScoringPeriod?: number };
  settings?: {
    name?: string;
    size?: number;
    scoringSettings?: { scoringItems?: { statId?: number; points?: number }[] };
    rosterSettings?: { lineupSlotCounts?: Record<string, number> };
    keeperSettings?: { keeperCount?: number };
    scheduleSettings?: { matchupPeriodCount?: number };
  };
  members?: EspnMember[];
  teams?: EspnTeam[];
  players?: { player?: EspnPlayer; onTeamId?: number }[];
  schedule?: { matchupPeriodId?: number; home?: { teamId?: number; totalPoints?: number }; away?: { teamId?: number; totalPoints?: number } }[];
};

const positionById: Record<number, string> = { 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "DEF" };
const slotById: Record<number, string> = { 0: "QB", 2: "RB", 4: "WR", 6: "TE", 7: "SUPER_FLEX", 16: "DEF", 17: "K", 20: "Bench", 21: "IR", 23: "FLEX", 24: "FLEX" };
const nflTeamById: Record<number, string> = { 1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN", 8: "DET", 9: "GB", 10: "TEN", 11: "IND", 12: "KC", 13: "LV", 14: "LAR", 15: "MIA", 16: "MIN", 17: "NE", 18: "NO", 19: "NYG", 20: "NYJ", 21: "PHI", 22: "ARI", 23: "PIT", 24: "LAC", 25: "SF", 26: "SEA", 27: "TB", 28: "WSH", 29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU" };

function teamName(team: EspnTeam) {
  return team.name?.trim() || `${team.location ?? ""} ${team.nickname ?? ""}`.trim() || team.abbrev || `Team ${team.id ?? ""}`;
}

function projection(player: EspnPlayer, week: number) {
  const exact = player.stats?.find((row) => row.statSourceId === 1 && row.scoringPeriodId === week)?.appliedTotal;
  const fallback = player.stats?.find((row) => row.statSourceId === 1)?.appliedTotal;
  return Number((exact ?? fallback ?? 0).toFixed(2));
}

function actualPoints(player: EspnPlayer, week: number) {
  return Number((player.stats?.find((row) => row.statSourceId === 0 && row.scoringPeriodId === week)?.appliedTotal ?? 0).toFixed(2));
}

function endpoint(season: number, leagueId: string) {
  return `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${encodeURIComponent(leagueId)}?view=mSettings&view=mTeam&view=mRoster&view=mMatchup&view=kona_player_info`;
}

export async function fetchEspnLeague(leagueId: string, seasonHint?: number) {
  const current = new Date().getUTCFullYear();
  const seasons = [...new Set([seasonHint, current, current - 1].filter((value): value is number => Boolean(value)))];
  const fantasyFilter = JSON.stringify({ players: { limit: 2000, sortPercOwned: { sortPriority: 1, sortAsc: false } } });
  for (const season of seasons) {
    const response = await fetch(endpoint(season, leagueId), {
      headers: { Accept: "application/json", "User-Agent": "Fantasy Hub public ESPN league importer", "x-fantasy-filter": fantasyFilter },
      next: { revalidate: 60 },
    }).catch(() => null);
    if (response?.ok) return await response.json() as EspnPayload;
    if (response?.status === 401 || response?.status === 403)
      throw new Error("This ESPN league is private. Make it publicly viewable before importing by league ID.");
  }
  throw new Error("ESPN league not found for the current or previous season.");
}

export async function fetchEspnLeagueForUser(userId: string, leagueId: string, seasonHint?: number) {
  const db = await getDb();
  const rows = seasonHint
    ? await db.select().from(espnLeagueSnapshots).where(and(eq(espnLeagueSnapshots.userId, userId), eq(espnLeagueSnapshots.leagueId, leagueId), eq(espnLeagueSnapshots.season, String(seasonHint)))).limit(1)
    : await db.select().from(espnLeagueSnapshots).where(and(eq(espnLeagueSnapshots.userId, userId), eq(espnLeagueSnapshots.leagueId, leagueId))).orderBy(desc(espnLeagueSnapshots.syncedAt)).limit(1);
  const snapshot = rows[0];
  if (snapshot) {
    try {
      return JSON.parse(snapshot.payloadJson) as EspnPayload;
    } catch {
      // Fall through to public league access if an older snapshot is unreadable.
    }
  }
  return fetchEspnLeague(leagueId, seasonHint);
}

export function espnLeagueSummary(payload: EspnPayload) {
  const members = new Map((payload.members ?? []).flatMap((member) => member.id ? [[member.id, member]] : []));
  return {
    id: String(payload.id ?? ""),
    name: payload.settings?.name ?? "ESPN League",
    season: String(payload.seasonId ?? new Date().getUTCFullYear()),
    teams: (payload.teams ?? []).map((team) => {
      const ownerId = team.primaryOwner ?? team.owners?.[0] ?? "";
      const owner = members.get(ownerId);
      return { id: String(team.id ?? ""), name: teamName(team), managerName: owner?.displayName ?? (`${owner?.firstName ?? ""} ${owner?.lastName ?? ""}`.trim() || "ESPN Manager") };
    }),
  };
}

export async function normalizeEspnLeague(payload: EspnPayload) {
  const week = Math.max(1, payload.scoringPeriodId ?? payload.status?.latestScoringPeriod ?? 1);
  const leagueSeason = Number(payload.seasonId ?? new Date().getUTCFullYear());
  const historySeason = leagueSeason > 2025 ? 2025 : leagueSeason;
  const [snapProfiles, seasonProfiles, teamOffenseProfiles] = await Promise.all([
    loadSnapProfiles(historySeason),
    loadPlayerSeasonProfiles(historySeason),
    loadTeamOffenseProfiles(historySeason),
  ]);
  const members = new Map((payload.members ?? []).flatMap((member) => member.id ? [[member.id, member]] : []));
  const allPoolPlayers = (payload.players ?? []).flatMap((entry) => entry.player ? [{ ...entry.player, onTeamId: entry.onTeamId ?? 0 }] : []);
  const rosterPlayers = (payload.teams ?? []).flatMap((team) => (team.roster?.entries ?? []).flatMap((entry) => entry.playerPoolEntry?.player ? [{ ...entry.playerPoolEntry.player, onTeamId: team.id ?? 0 }] : []));
  const universe = Array.from(new Map([...allPoolPlayers, ...rosterPlayers].flatMap((player) => player.id ? [[player.id, player]] : [])).values());
  const receptionPoints = payload.settings?.scoringSettings?.scoringItems?.find((item) => item.statId === 53)?.points ?? 0;
  const playerShape = (player: EspnPlayer, role = "Player pool") => {
    const points = projection(player, week);
    const name = player.fullName ?? `ESPN Player ${player.id ?? ""}`;
    const snapProfile = snapProfileFor(snapProfiles, name);
    const seasonProfile = playerSeasonProfileFor(seasonProfiles, name);
    const teamOffense = seasonProfile?.team ? teamOffenseProfiles.get(seasonProfile.team) : null;
    const historicalPoints = seasonProfile
      ? seasonProfile.fantasyPoints + seasonProfile.receptions * receptionPoints
      : null;
    return { id: `espn-player:${player.id ?? 0}`, name, position: positionById[player.defaultPositionId ?? 0] ?? "FLEX", team: nflTeamById[player.proTeamId ?? 0] ?? "FA", opponent: "Matchup pending", projection: points, leagueProjection: points, floor: Number((points * .68).toFixed(1)), ceiling: Number((points * 1.38).toFixed(1)), trend: 0, status: player.injuryStatus || (player.injured ? "Questionable" : "Healthy"), role, rankingValue: Number((points * 3 + (player.ownership?.percentOwned ?? 0) * .35).toFixed(2)), ageAdjustment: 0, lineupAdjustment: 0, snapPct: snapProfile?.latestPct ?? null, snapAverage: snapProfile?.averagePct ?? null, snapWeek: snapProfile?.latestWeek ?? null, snapSeason: snapProfile?.season ?? null, fantasyPpg2025: seasonProfile?.games && historicalPoints != null ? Number((historicalPoints / seasonProfile.games).toFixed(1)) : null, gamesPlayed2025: seasonProfile?.games ?? null, team2025: seasonProfile?.team ?? null, teamOffenseRank2025: teamOffense?.rank ?? null, teamPointsPerGame2025: teamOffense?.pointsPerGame ?? null };
  };
  const rosteredIds = new Set(rosterPlayers.map((player) => player.id));
  const rankingPool = universe.map((player) => playerShape(player)).filter((player) => ["QB", "RB", "WR", "TE", "K", "DEF"].includes(player.position)).sort((a, b) => b.rankingValue - a.rankingValue).map((player, index) => ({ ...player, overallRank: index + 1 }));
  const currentMatchups = (payload.schedule ?? []).filter((row) => row.matchupPeriodId === (payload.status?.currentMatchupPeriod ?? week));
  const matchupByTeam = new Map<number, number>();
  currentMatchups.forEach((row, index) => { if (row.home?.teamId) matchupByTeam.set(row.home.teamId, index + 1); if (row.away?.teamId) matchupByTeam.set(row.away.teamId, index + 1); });
  const teams = (payload.teams ?? []).map((team, index) => {
    const ownerId = team.primaryOwner ?? team.owners?.[0] ?? "";
    const owner = members.get(ownerId);
    const roster = (team.roster?.entries ?? []).flatMap((entry) => entry.playerPoolEntry?.player ? [playerShape(entry.playerPoolEntry.player, slotById[entry.lineupSlotId ?? 20] ?? "Bench")] : []);
    return { id: String(team.id ?? index + 1), ownerId: `espn-team:${team.id ?? index + 1}`, managerName: owner?.displayName ?? (`${owner?.firstName ?? ""} ${owner?.lastName ?? ""}`.trim() || `Manager ${index + 1}`), teamName: teamName(team), matchupId: matchupByTeam.get(team.id ?? 0) ?? null, roster, draftCapital: { score: 0, picks: [] } };
  });
  const lineupCounts = payload.settings?.rosterSettings?.lineupSlotCounts ?? {};
  const rosterSlots = Object.entries(lineupCounts).flatMap(([slot, count]) => Array.from({ length: count }, () => slotById[Number(slot)] ?? "Bench"));
  const scoring = receptionPoints >= .75 ? "PPR" : receptionPoints >= .25 ? "Half PPR" : "Standard";
  const slotCounts = rosterSlots.reduce<Record<string, number>>((map, slot) => ({ ...map, [slot]: (map[slot] ?? 0) + 1 }), {});
  const hasRosteredPlayers = teams.some((team) => team.roster.length > 0);
  const format = (payload.settings?.keeperSettings?.keeperCount ?? 0) > 0 ? "Keeper" as const : "Redraft" as const;
  return {
    league: { name: payload.settings?.name ?? "ESPN League", platform: "ESPN", status: hasRosteredPlayers ? "in_season" : "pre_draft", teams: payload.settings?.size ?? teams.length, season: String(payload.seasonId ?? new Date().getUTCFullYear()), currentWeek: payload.status?.latestScoringPeriod ?? 0, projectionWeek: week, managers: members.size },
    teams,
    managers: teams.map((team) => ({ id: team.ownerId, name: team.managerName, teamName: team.teamName, style: "Neutral" as const })),
    rankingContext: { format, scoring, teams: payload.settings?.size ?? teams.length, rosterSlots, positionDemand: { QB: slotCounts.QB ?? 0, RB: (slotCounts.RB ?? 0) + (slotCounts.FLEX ?? 0) * .35, WR: (slotCounts.WR ?? 0) + (slotCounts.FLEX ?? 0) * .5, TE: (slotCounts.TE ?? 0) + (slotCounts.FLEX ?? 0) * .15, K: slotCounts.K ?? 0, DEF: slotCounts.DEF ?? 0 }, tePremium: 0, passTouchdown: 4, interception: -2, bonusRuleCount: 0, scoringRuleCount: payload.settings?.scoringSettings?.scoringItems?.length ?? 0 },
    rankings: rankingPool,
    waiverPlayers: rankingPool.filter((player) => !rosteredIds.has(Number(player.id.replace("espn-player:", "")))),
  };
}

export function normalizeEspnScoreboard(payload: EspnPayload, ownedRosterId: string, requestedWeek?: number) {
  const currentWeek = Math.max(1, payload.status?.latestScoringPeriod ?? payload.scoringPeriodId ?? 1);
  const week = requestedWeek && requestedWeek >= 1 && requestedWeek <= 18 ? requestedWeek : currentWeek;
  const members = new Map((payload.members ?? []).flatMap((member) => member.id ? [[member.id, member]] : []));
  const teamById = new Map((payload.teams ?? []).flatMap((team) => team.id ? [[team.id, team]] : []));
  const teamShape = (side: { teamId?: number; totalPoints?: number } | undefined) => {
    const team = side?.teamId ? teamById.get(side.teamId) : undefined;
    const ownerId = team?.primaryOwner ?? team?.owners?.[0] ?? "";
    const owner = members.get(ownerId);
    const topPlayers = (team?.roster?.entries ?? []).flatMap((entry, index) => {
      const player = entry.playerPoolEntry?.player;
      if (!player) return [];
      const role = slotById[entry.lineupSlotId ?? 20] ?? "Bench";
      const isStarter = !["Bench", "IR"].includes(role);
      return [{ id: `espn-player:${player.id ?? 0}`, name: player.fullName ?? "ESPN Player", position: positionById[player.defaultPositionId ?? 0] ?? "FLEX", lineupSlot: isStarter ? role : "BN", lineupOrder: isStarter ? index : 100 + index, nflTeam: nflTeamById[player.proTeamId ?? 0] ?? "FA", points: actualPoints(player, week), projection: projection(player, week), isStarter, yards: 0, touchdowns: 0, receptions: 0, targets: 0, offensiveTurnovers: 0, defensiveTurnovers: 0, returnTouchdowns: 0, fieldGoals: 0 }];
    }).sort((a, b) => a.lineupOrder - b.lineupOrder);
    return { rosterId: String(team?.id ?? ""), ownerId: ownerId || null, managerName: owner?.displayName ?? (`${owner?.firstName ?? ""} ${owner?.lastName ?? ""}`.trim() || "ESPN Manager"), teamName: team ? teamName(team) : "ESPN Team", points: Number((side?.totalPoints ?? topPlayers.filter((player) => player.isStarter).reduce((sum, player) => sum + player.points, 0)).toFixed(2)), isMine: String(team?.id ?? "") === ownedRosterId, topPlayers };
  };
  const schedule = (payload.schedule ?? []).filter((row) => row.matchupPeriodId === week);
  const matchups = schedule.map((row, index) => ({ matchupId: index + 1, teams: [teamShape(row.home), teamShape(row.away)].sort((a, b) => Number(b.isMine) - Number(a.isMine)), status: week < currentWeek ? "Final" : week === currentWeek ? "Live" : "Scheduled" })).sort((a, b) => Number(b.teams.some((team) => team.isMine)) - Number(a.teams.some((team) => team.isMine)));
  return { league: { id: String(payload.id ?? ""), name: payload.settings?.name ?? "ESPN League", season: String(payload.seasonId ?? new Date().getUTCFullYear()), currentWeek, provider: "ESPN", projectionSource: "ESPN Projections", scoring: {} }, week, updatedAt: new Date().toISOString(), matchups };
}

export function normalizeEspnSimulation(payload: EspnPayload) {
  const totalTeams = payload.settings?.size ?? payload.teams?.length ?? 0;
  const regularSeasonWeeks = Math.max(1, payload.settings?.scheduleSettings?.matchupPeriodCount ?? 14);
  const matchupPeriods = new Map<number, { teams: string[]; points: number[] }[]>();
  (payload.schedule ?? []).forEach((row) => {
    const week = row.matchupPeriodId ?? 0;
    if (!week || week > regularSeasonWeeks || !row.home?.teamId || !row.away?.teamId) return;
    const matchup = { teams: [String(row.home.teamId), String(row.away.teamId)], points: [Number((row.home.totalPoints ?? 0).toFixed(2)), Number((row.away.totalPoints ?? 0).toFixed(2))] };
    matchupPeriods.set(week, [...(matchupPeriods.get(week) ?? []), matchup]);
  });
  const lineupCounts = payload.settings?.rosterSettings?.lineupSlotCounts ?? {};
  const starterSlots = Object.entries(lineupCounts).flatMap(([slot, count]) => [20, 21].includes(Number(slot)) ? [] : Array.from({ length: count }, () => slotById[Number(slot)] ?? "FLEX"));
  return {
    league: { name: payload.settings?.name ?? "ESPN League", season: String(payload.seasonId ?? new Date().getUTCFullYear()), currentWeek: payload.status?.latestScoringPeriod ?? 1, totalTeams, playoffTeams: Math.max(2, Math.min(totalTeams, 6)), playoffWeekStart: regularSeasonWeeks + 1, regularSeasonWeeks, format: (payload.settings?.keeperSettings?.keeperCount ?? 0) > 0 ? "Keeper" : "Redraft", starterSlots, scoringRuleCount: payload.settings?.scoringSettings?.scoringItems?.length ?? 0 },
    weeks: Array.from({ length: regularSeasonWeeks }, (_, index) => ({ week: index + 1, matchups: matchupPeriods.get(index + 1) ?? [] })),
  };
}
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../db";
import { espnLeagueSnapshots } from "../../db/schema";
import { loadSnapProfiles, snapProfileFor } from "../snap-data";
import { loadPlayerSeasonProfiles, loadTeamOffenseProfiles, playerSeasonProfileFor } from "../season-history";
