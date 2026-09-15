import { and, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { managedLeagues, sleeperConnections } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";
import { fetchEspnLeagueForUser, normalizeEspnScoreboard } from "../espn";
import { fetchCachedUpstream } from "../upstream-cache";
import { getSleeperPlayerDirectory, getSleeperWeeklyProjections, getSleeperWeeklyStats } from "../sleeper-shared-data";
import { sleeperFantasyPoints } from "../../sleeper-live-scoring.mjs";
import { getNflGames, type NflDataGame } from "../../highlightly-nfl";
import { currentFantasyWeek } from "../../current-fantasy-week";

type MatchupRow = { roster_id?: number; matchup_id?: number | null; points?: number; custom_points?: number | null; players?: string[]; starters?: string[]; players_points?: Record<string, number> };
const SLEEPER_SCOREBOARD_TTL_SECONDS = {
  leagueConfiguration: 6 * 60 * 60,
  matchupReconciliation: 20,
  rosterOwners: 60 * 60,
  leagueUsers: 60 * 60,
} as const;

function nflGameProgress(game: NflDataGame) {
  if (game.state === "post") return 1;
  if (game.state !== "in") return 0;
  const clock = String(game.clock ?? "");
  const [minutes, seconds] = clock.split(":").map(Number);
  const remainingSeconds = Number.isFinite(minutes) && Number.isFinite(seconds)
    ? minutes * 60 + seconds
    : Number(clock);
  const remaining = Number.isFinite(remainingSeconds)
    ? Math.max(0, Math.min(900, remainingSeconds))
    : 900;
  return Math.max(0, Math.min(1, ((Math.max(1, game.period) - 1) * 900 + (900 - remaining)) / 3600));
}

function gameProgressByTeam(games: NflDataGame[]) {
  return new Map(
    games.flatMap((game) => [
      [game.away.abbreviation, nflGameProgress(game)] as const,
      [game.home.abbreviation, nflGameProgress(game)] as const,
    ]),
  );
}

function withNflGameProgress<T extends { teams: { topPlayers: { nflTeam?: string; gameProgress?: number }[] }[] }>(
  matchups: T[],
  progressByTeam: Map<string, number>,
) {
  return matchups.map((matchup) => ({
    ...matchup,
    teams: matchup.teams.map((team) => ({
      ...team,
      topPlayers: team.topPlayers.map((player) => ({
        ...player,
        gameProgress: progressByTeam.get(player.nflTeam ?? ""),
      })),
    })),
  }));
}

function withCurrentNflStatus<T extends { status: string }>(
  matchups: T[],
  week: number,
  currentWeek: number,
  nflGameInProgress: boolean,
  nflWeekFinished = false,
) {
  const status = week < currentWeek || nflWeekFinished
    ? "Final"
    : week === currentWeek && nflGameInProgress
      ? "Live"
      : "Scheduled";
  return matchups.map((matchup) => ({ ...matchup, status }));
}

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const url = new URL(request.url);
  const leagueId = url.searchParams.get("leagueId")?.trim();
  const requestedWeek = Number(url.searchParams.get("week"));
  const requestedScope = url.searchParams.get("scope") === "mine" ? "mine" : "league";
  if (leagueId?.startsWith("espn:")) {
    const [, season, sourceLeagueId] = leagueId.split(":");
    if (!sourceLeagueId) return Response.json({ error: "Select an ESPN league first" }, { status: 400 });
    const db = await getDb();
    const [record] = await db.select().from(managedLeagues).where(and(eq(managedLeagues.userId, user.userId), eq(managedLeagues.provider, "espn"), eq(managedLeagues.identifier, sourceLeagueId))).limit(1);
    if (!record?.rosterId) return Response.json({ error: "Select your ESPN team in Manage Leagues" }, { status: 409 });
    try {
      const calendar = await currentFantasyWeek(Number(season));
      const week = Number.isInteger(requestedWeek) && requestedWeek >= 1 && requestedWeek <= 18 ? requestedWeek : calendar.currentWeek;
      const scoreboard = normalizeEspnScoreboard(await fetchEspnLeagueForUser(user.userId, sourceLeagueId, Number(season), week), record.rosterId, week);
      scoreboard.league.currentWeek = calendar.currentWeek;
      const nflGames = await getNflGames({ season: Number(season), week: scoreboard.week, cacheSeconds: 20 }).catch(() => []);
      const nflGameInProgress = nflGames.some((game) => game.state === "in");
      return Response.json({
        ...scoreboard,
        matchups: withNflGameProgress(
          withCurrentNflStatus(
            requestedScope === "mine"
              ? scoreboard.matchups.filter((matchup) => matchup.teams.some((team) => team.isMine))
              : scoreboard.matchups,
            scoreboard.week,
            scoreboard.league.currentWeek,
            nflGameInProgress,
            nflGames.length > 0 && nflGames.every(game => game.state === 'post'),
          ),
          gameProgressByTeam(nflGames),
        ),
      });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "ESPN scores unavailable" }, { status: 502 });
    }
  }
  if (!leagueId || !/^\d{6,24}$/.test(leagueId)) return Response.json({ error: "Select a league first" }, { status: 400 });
  const db = await getDb();
  const [connection] = await db.select().from(sleeperConnections).where(eq(sleeperConnections.userId, user.userId)).limit(1);
  if (!connection) return Response.json({ error: "Connect a Sleeper account first" }, { status: 409 });

  // League configuration, rosters, and managers change far less frequently than
  // live scoring. Keep those inputs warm at the edge while official matchup
  // scores refresh frequently enough to remain the source of truth in-game.
  const leagueResponse = await fetchCachedUpstream(
    `https://api.sleeper.app/v1/league/${leagueId}`,
    SLEEPER_SCOREBOARD_TTL_SECONDS.leagueConfiguration,
  );
  if (!leagueResponse.ok) return Response.json({ error: "League unavailable" }, { status: 404 });
  const league = await leagueResponse.json() as { name?: string; season?: string; leg?: number; total_rosters?: number; roster_positions?: string[]; scoring_settings?: Record<string, number> };
  const calendar = await currentFantasyWeek(Number(league.season), league.leg);
  const week = Number.isInteger(requestedWeek) && requestedWeek >= 1 && requestedWeek <= 18 ? requestedWeek : calendar.currentWeek;
  const season = league.season ?? String(new Date().getUTCFullYear());
  const [matchupsResponse, rostersResponse, usersResponse, playerDirectory, statsSnapshot, projectionsSnapshot, nflGames] = await Promise.all([
    fetchCachedUpstream(
      `https://api.sleeper.app/v1/league/${leagueId}/matchups/${week}`,
      SLEEPER_SCOREBOARD_TTL_SECONDS.matchupReconciliation,
    ),
    fetchCachedUpstream(
      `https://api.sleeper.app/v1/league/${leagueId}/rosters`,
      SLEEPER_SCOREBOARD_TTL_SECONDS.rosterOwners,
    ),
    fetchCachedUpstream(
      `https://api.sleeper.app/v1/league/${leagueId}/users`,
      SLEEPER_SCOREBOARD_TTL_SECONDS.leagueUsers,
    ),
    getSleeperPlayerDirectory(),
    getSleeperWeeklyStats(season, week).catch(() => null),
    getSleeperWeeklyProjections(season, week).catch(() => null),
    getNflGames({ season: Number(season), week, cacheSeconds: 20 }).catch(() => []),
  ]);
  if (!matchupsResponse.ok || !rostersResponse.ok || !usersResponse.ok) return Response.json({ error: "Weekly scores unavailable" }, { status: 502 });
  const matchupRows = await matchupsResponse.json() as MatchupRow[];
  const rosters = await rostersResponse.json() as { roster_id?: number; owner_id?: string }[];
  const users = await usersResponse.json() as { user_id?: string; display_name?: string; metadata?: { team_name?: string } }[];
  const players = playerDirectory.value;
  const statsByPlayer = statsSnapshot?.value ?? new Map<string, Record<string, number>>();
  const nflGameInProgress = nflGames.some((game) => game.state === "in");
  const nflProgressByTeam = gameProgressByTeam(nflGames);
  const useCalculatedLiveScoring = nflGameInProgress && statsByPlayer.size > 0;
  const projectionsByPlayer = new Map([...(projectionsSnapshot?.value ?? new Map<string, Record<string, number>>()).entries()].flatMap(([playerId, stats]) => {
    const position = players.get(playerId)?.position ?? "";
    const value = sleeperFantasyPoints(stats, league.scoring_settings ?? {}, position);
    return typeof value === "number" ? [[playerId, Number(value.toFixed(2))] as const] : [];
  }));
  const rosterById = new Map(rosters.flatMap((roster) => roster.roster_id ? [[roster.roster_id, roster]] : []));
  const userById = new Map(users.flatMap((manager) => manager.user_id ? [[manager.user_id, manager]] : []));
  const starterSlots = (league.roster_positions ?? []).filter(
    (slot) => !["BN", "IR", "TAXI"].includes(slot),
  );
  const teamFromRow = (row: MatchupRow) => {
    const roster = row.roster_id ? rosterById.get(row.roster_id) : undefined;
    const manager = roster?.owner_id ? userById.get(roster.owner_id) : undefined;
    const scoring = row.players_points ?? {};
    const starterOrder = new Map(
      (row.starters ?? []).map((playerId, index) => [playerId, index]),
    );
    const rosterOrder = new Map(
      (row.players ?? []).map((playerId, index) => [playerId, index]),
    );
    const topPlayers = (row.players ?? []).map((playerId) => {
      const player = players.get(playerId);
      const stats = statsByPlayer.get(playerId) ?? {};
      const starterIndex = starterOrder.get(playerId);
      const isStarter = starterIndex !== undefined;
      const position = player?.position ?? "FLEX";
      const points = useCalculatedLiveScoring
        ? sleeperFantasyPoints(stats, league.scoring_settings ?? {}, position)
        : Number((scoring[playerId] ?? 0).toFixed(2));
      const nflTeam = player?.team ?? "FA";
      return { id: playerId, name: player?.name ?? "Unknown player", position, lineupSlot: isStarter ? (starterSlots[starterIndex] ?? position) : "BN", lineupOrder: isStarter ? starterIndex : starterSlots.length + (rosterOrder.get(playerId) ?? 999), nflTeam, gameProgress: nflProgressByTeam.get(nflTeam), points, projection: projectionsByPlayer.get(playerId) ?? null, isStarter, yards: Math.round((stats.pass_yd ?? 0) + (stats.rush_yd ?? 0) + (stats.rec_yd ?? 0)), touchdowns: (stats.pass_td ?? 0) + (stats.rush_td ?? 0) + (stats.rec_td ?? 0), receptions: stats.rec ?? 0, targets: stats.rec_tgt ?? 0, offensiveTurnovers: (stats.pass_int ?? 0) + (stats.fum_lost ?? 0), defensiveTurnovers: (stats.def_int ?? 0) + (stats.def_fum_rec ?? stats.fum_rec ?? 0), returnTouchdowns: (stats.kick_ret_td ?? 0) + (stats.punt_ret_td ?? 0) + (stats.st_td ?? 0), fieldGoals: stats.fgm ?? 0, passingYards: stats.pass_yd ?? 0, passingTouchdowns: stats.pass_td ?? 0, interceptions: stats.pass_int ?? 0, rushingAttempts: stats.rush_att ?? 0, rushingYards: stats.rush_yd ?? 0, rushingTouchdowns: stats.rush_td ?? 0, receivingYards: stats.rec_yd ?? 0, receivingTouchdowns: stats.rec_td ?? 0, fieldGoalAttempts: stats.fga ?? 0, extraPoints: stats.xpm ?? 0, sacks: stats.sack ?? 0, pointsAllowed: typeof stats.pts_allow === "number" ? stats.pts_allow : undefined, defensiveTouchdowns: stats.def_td ?? 0 };
    }).sort((a, b) => a.lineupOrder - b.lineupOrder);
    const officialPoints = Number((row.custom_points ?? row.points ?? 0).toFixed(2));
    // The league's matchup score is authoritative. Individual player stat feeds
    // can lag or omit scoring settings, so never reconstruct the score shown on
    // a fantasy matchup card from those stats.
    const points = officialPoints;
    return { rosterId: String(row.roster_id ?? ""), ownerId: roster?.owner_id ?? null, managerName: manager?.display_name ?? `Roster ${row.roster_id ?? ""}`, teamName: manager?.metadata?.team_name ?? `${manager?.display_name ?? `Roster ${row.roster_id ?? ""}`}'s Team`, points, officialPoints, isMine: roster?.owner_id === connection.sleeperUserId, topPlayers };
  };
  const grouped = new Map<number, MatchupRow[]>();
  matchupRows.forEach((row, index) => { const key = row.matchup_id ?? 1000 + index; grouped.set(key, [...(grouped.get(key) ?? []), row]); });
  const ownRosterId = rosters.find((roster) => roster.owner_id === connection.sleeperUserId)?.roster_id;
  const ownMatchupId = ownRosterId == null
    ? undefined
    : matchupRows.find((row) => row.roster_id === ownRosterId)?.matchup_id;
  const scopedGroups = requestedScope === "mine" && ownMatchupId != null
    ? [...grouped.entries()].filter(([matchupId]) => matchupId === ownMatchupId)
    : [...grouped.entries()];
  const matchups = withCurrentNflStatus(
    scopedGroups.map(([matchupId, rows]) => ({ matchupId, teams: rows.map(teamFromRow).sort((a, b) => Number(b.isMine) - Number(a.isMine)), status: "Scheduled" })).sort((a, b) => Number(b.teams.some((team) => team.isMine)) - Number(a.teams.some((team) => team.isMine))),
    week,
    calendar.currentWeek,
    nflGameInProgress,
    nflGames.length > 0 && nflGames.every(game => game.state === 'post'),
  );
  return Response.json({ league: { id: leagueId, name: league.name ?? "League", season, currentWeek: calendar.currentWeek, provider: "Sleeper", projectionSource: "Sleeper Projections", scoring: league.scoring_settings ?? {} }, week, updatedAt: new Date().toISOString(), scoringSource: "sleeper_official", sharedStatsRefreshedAt: statsSnapshot?.refreshedAt ?? null, playerDirectoryRefreshedAt: playerDirectory.refreshedAt, reconciliationIntervalSeconds: SLEEPER_SCOREBOARD_TTL_SECONDS.matchupReconciliation, matchups });
}
