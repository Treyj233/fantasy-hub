import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { sleeperConnections } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";

type MatchupRow = { roster_id?: number; matchup_id?: number | null; points?: number; custom_points?: number | null; players?: string[]; starters?: string[]; players_points?: Record<string, number> };
type SourcePlayer = { full_name?: string; first_name?: string; last_name?: string; position?: string; team?: string };
type PlayerStats = { player_id?: string; stats?: Record<string, number> };
type PlayerProjection = { player_id?: string; stats?: Record<string, number> };

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const url = new URL(request.url);
  const leagueId = url.searchParams.get("leagueId")?.trim();
  const requestedWeek = Number(url.searchParams.get("week"));
  if (!leagueId || !/^\d{6,24}$/.test(leagueId)) return Response.json({ error: "Select a league first" }, { status: 400 });
  const db = await getDb();
  const [connection] = await db.select().from(sleeperConnections).where(eq(sleeperConnections.userId, user.userId)).limit(1);
  if (!connection) return Response.json({ error: "Connect a Sleeper account first" }, { status: 409 });

  const leagueResponse = await fetch(`https://api.sleeper.app/v1/league/${leagueId}`, { next: { revalidate: 30 } });
  if (!leagueResponse.ok) return Response.json({ error: "League unavailable" }, { status: 404 });
  const league = await leagueResponse.json() as { name?: string; season?: string; leg?: number; total_rosters?: number; roster_positions?: string[]; scoring_settings?: Record<string, number> };
  const week = Number.isInteger(requestedWeek) && requestedWeek >= 1 && requestedWeek <= 18 ? requestedWeek : Math.max(1, league.leg ?? 1);
  const season = league.season ?? String(new Date().getUTCFullYear());
  const [matchupsResponse, rostersResponse, usersResponse, playersResponse, statsResponse, projectionsResponse] = await Promise.all([
    fetch(`https://api.sleeper.app/v1/league/${leagueId}/matchups/${week}`, { next: { revalidate: 15 } }),
    fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`, { next: { revalidate: 300 } }),
    fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`, { next: { revalidate: 300 } }),
    fetch("https://api.sleeper.app/v1/players/nfl?active=true", { next: { revalidate: 86400 } }),
    fetch(`https://api.sleeper.com/stats/nfl/regular/${season}/${week}`, { next: { revalidate: 30 } }).catch(() => null),
    fetch(`https://api.sleeper.com/projections/nfl/${season}/${week}?season_type=regular`, { next: { revalidate: 900 } }).catch(() => null),
  ]);
  if (!matchupsResponse.ok || !rostersResponse.ok || !usersResponse.ok || !playersResponse.ok) return Response.json({ error: "Weekly scores unavailable" }, { status: 502 });
  const matchupRows = await matchupsResponse.json() as MatchupRow[];
  const rosters = await rostersResponse.json() as { roster_id?: number; owner_id?: string }[];
  const users = await usersResponse.json() as { user_id?: string; display_name?: string; metadata?: { team_name?: string } }[];
  const players = await playersResponse.json() as Record<string, SourcePlayer>;
  const statsPayload: unknown = statsResponse?.ok ? await statsResponse.json().catch(() => []) : [];
  const statsRows: PlayerStats[] = Array.isArray(statsPayload) ? statsPayload : Object.entries(statsPayload && typeof statsPayload === "object" ? statsPayload as Record<string, { stats?: Record<string, number> }> : {}).map(([playerId, value]) => ({ player_id: playerId, stats: value.stats ?? value as Record<string, number> }));
  const statsByPlayer = new Map(statsRows.flatMap((row) => row.player_id ? [[row.player_id, row.stats ?? {}]] : []));
  const projectionPayload: unknown = projectionsResponse?.ok ? await projectionsResponse.json().catch(() => []) : [];
  const projectionRows: PlayerProjection[] = Array.isArray(projectionPayload) ? projectionPayload : [];
  const receptionValue = league.scoring_settings?.rec ?? 1;
  const projectionKey = receptionValue >= .75 ? "pts_ppr" : receptionValue >= .25 ? "pts_half_ppr" : "pts_std";
  const projectionsByPlayer = new Map(projectionRows.flatMap((row) => {
    const value = row.stats?.[projectionKey];
    return row.player_id && typeof value === "number" ? [[row.player_id, Number(value.toFixed(2))]] : [];
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
      const player = players[playerId];
      const stats = statsByPlayer.get(playerId) ?? {};
      const starterIndex = starterOrder.get(playerId);
      const isStarter = starterIndex !== undefined;
      return { id: playerId, name: (player?.full_name ?? `${player?.first_name ?? ""} ${player?.last_name ?? ""}`.trim()) || "Unknown player", position: player?.position ?? "FLEX", lineupSlot: isStarter ? (starterSlots[starterIndex] ?? player?.position ?? "FLEX") : "BN", lineupOrder: isStarter ? starterIndex : starterSlots.length + (rosterOrder.get(playerId) ?? 999), nflTeam: player?.team ?? "FA", points: Number((scoring[playerId] ?? 0).toFixed(2)), projection: projectionsByPlayer.get(playerId) ?? null, isStarter, yards: Math.round((stats.pass_yd ?? 0) + (stats.rush_yd ?? 0) + (stats.rec_yd ?? 0)), touchdowns: (stats.pass_td ?? 0) + (stats.rush_td ?? 0) + (stats.rec_td ?? 0), receptions: stats.rec ?? 0, targets: stats.rec_tgt ?? 0 };
    }).sort((a, b) => a.lineupOrder - b.lineupOrder);
    return { rosterId: String(row.roster_id ?? ""), ownerId: roster?.owner_id ?? null, managerName: manager?.display_name ?? `Roster ${row.roster_id ?? ""}`, teamName: manager?.metadata?.team_name ?? `${manager?.display_name ?? `Roster ${row.roster_id ?? ""}`}'s Team`, points: Number((row.custom_points ?? row.points ?? 0).toFixed(2)), isMine: roster?.owner_id === connection.sleeperUserId, topPlayers };
  };
  const grouped = new Map<number, MatchupRow[]>();
  matchupRows.forEach((row, index) => { const key = row.matchup_id ?? 1000 + index; grouped.set(key, [...(grouped.get(key) ?? []), row]); });
  const matchups = [...grouped.entries()].map(([matchupId, rows]) => ({ matchupId, teams: rows.map(teamFromRow).sort((a, b) => Number(b.isMine) - Number(a.isMine)), status: week < (league.leg ?? week) ? "Final" : week === (league.leg ?? week) ? "Live" : "Scheduled" })).sort((a, b) => Number(b.teams.some((team) => team.isMine)) - Number(a.teams.some((team) => team.isMine)));
  return Response.json({ league: { id: leagueId, name: league.name ?? "League", season, currentWeek: league.leg ?? week, provider: "Sleeper", projectionSource: "Sleeper Projections" }, week, updatedAt: new Date().toISOString(), matchups });
}
