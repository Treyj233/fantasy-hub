import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { managedLeagues, sleeperConnections } from "../../../../db/schema";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { fetchEspnLeagueForUser, normalizeEspnLeague } from "../../espn";

type SleeperLeague = { league_id?: string; previous_league_id?: string | null; name?: string; season?: string; total_rosters?: number; avatar?: string | null; settings?: { type?: number }; scoring_settings?: { rec?: number }; roster_positions?: string[] };

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const db = await getDb();
  const [connection] = await db.select().from(sleeperConnections).where(eq(sleeperConnections.userId, user.userId)).limit(1);
  const currentSeason = new Date().getUTCFullYear();
  const seasons = [String(currentSeason), String(currentSeason - 1)];
  const leagueGroups = connection ? await Promise.all(seasons.map(async (season) => {
    const response = await fetch(`https://api.sleeper.app/v1/user/${connection.sleeperUserId}/leagues/nfl/${season}`, { next: { revalidate: 300 } });
    return response.ok ? await response.json() as SleeperLeague[] : [];
  })) : [];
  const uniqueLeagueRecords = Array.from(new Map(leagueGroups.flat().filter((league) => league.league_id).map((league) => [league.league_id!, league])).values());
  const previousLeagueIds = new Set(uniqueLeagueRecords.map((league) => league.previous_league_id).filter((id): id is string => Boolean(id)));
  const currentLeagueRecords = uniqueLeagueRecords
    .filter((league) => !league.league_id || !previousLeagueIds.has(league.league_id))
    .sort((a, b) => Number(b.season ?? 0) - Number(a.season ?? 0));
  const latestNamedLeagueRecords = currentLeagueRecords.filter((league, index, records) => {
    const identity = `${league.name?.trim().toLowerCase() ?? ""}|${league.settings?.type ?? 0}|${league.total_rosters ?? 0}`;
    return records.findIndex((candidate) => `${candidate.name?.trim().toLowerCase() ?? ""}|${candidate.settings?.type ?? 0}|${candidate.total_rosters ?? 0}` === identity) === index;
  });
  const sleeperLeagues = (await Promise.all(latestNamedLeagueRecords.map(async (league) => {
    if (!league.league_id) return null;
    const rosterResponse = await fetch(`https://api.sleeper.app/v1/league/${league.league_id}/rosters`, { next: { revalidate: 300 } });
    const rosters = rosterResponse.ok ? await rosterResponse.json() as { roster_id?: number; owner_id?: string }[] : [];
    const myRoster = rosters.find((roster) => roster.owner_id === connection.sleeperUserId);
    if (!myRoster) return null;
    const receptionValue = league.scoring_settings?.rec ?? 0;
    return { id: league.league_id, name: league.name ?? "Unnamed League", season: league.season, teams: league.total_rosters ?? rosters.length, format: league.settings?.type === 2 ? "Dynasty" : league.settings?.type === 1 ? "Keeper" : "Redraft", scoring: receptionValue >= .75 ? "PPR" : receptionValue >= .25 ? "Half PPR" : "Standard", rosterId: String(myRoster.roster_id ?? ""), starterCount: (league.roster_positions ?? []).filter((slot) => slot !== "BN").length };
  }))).filter((league): league is NonNullable<typeof league> => Boolean(league)).sort((a, b) => Number(b.season ?? 0) - Number(a.season ?? 0) || a.name.localeCompare(b.name));
  const espnRecords = await db.select().from(managedLeagues).where(and(eq(managedLeagues.userId, user.userId), eq(managedLeagues.provider, "espn"), eq(managedLeagues.status, "live")));
  const espnLeagues = (await Promise.all(espnRecords.map(async (record) => {
    if (!record.rosterId) return null;
    try {
      const normalized = normalizeEspnLeague(await fetchEspnLeagueForUser(user.userId, record.identifier, Number(record.season)));
      const rosterSlots = normalized.rankingContext.rosterSlots;
      return { id: `espn:${normalized.league.season}:${record.identifier}`, sourceId: record.identifier, provider: "espn", name: normalized.league.name, season: normalized.league.season, teams: normalized.league.teams, format: normalized.rankingContext.format, scoring: normalized.rankingContext.scoring, rosterId: record.rosterId, starterCount: rosterSlots.filter((slot) => !["Bench", "IR"].includes(slot)).length };
    } catch {
      return record.leagueName && record.season ? { id: `espn:${record.season}:${record.identifier}`, sourceId: record.identifier, provider: "espn", name: record.leagueName, season: record.season, teams: 0, format: "Redraft", scoring: "ESPN scoring", rosterId: record.rosterId, starterCount: 0 } : null;
    }
  }))).filter((league): league is NonNullable<typeof league> => Boolean(league));
  return Response.json({ connection: connection ?? null, leagues: [...sleeperLeagues.map((league) => ({ ...league, sourceId: league.id, provider: "sleeper" })), ...espnLeagues] });
}
