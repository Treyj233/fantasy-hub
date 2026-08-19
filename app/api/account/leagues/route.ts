import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { managedLeagues, sleeperConnections } from "../../../../db/schema";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { fetchEspnLeagueForUser, normalizeEspnLeague } from "../../espn";

type SleeperLeague = { league_id?: string; previous_league_id?: string | null; name?: string; season?: string; total_rosters?: number; avatar?: string | null; settings?: { type?: number }; scoring_settings?: { rec?: number }; roster_positions?: string[] };

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const db = await getDb();
  const [connection] = await db.select().from(sleeperConnections).where(eq(sleeperConnections.userId, user.userId)).limit(1);
  const savedRecords = await db.select().from(managedLeagues).where(eq(managedLeagues.userId, user.userId));
  const forceRefresh = new URL(request.url).searchParams.get("refresh") === "1";
  const savedSleeper = savedRecords.filter((record) => record.provider === "sleeper" && record.status === "live" && record.identifierType === "league_id");
  const savedEspn = savedRecords.filter((record) => record.provider === "espn" && record.status === "live");
  const savedShape = (record: typeof managedLeagues.$inferSelect) => {
    let meta: { teams?: number; format?: string; scoring?: string; starterCount?: number } = {};
    try { meta = JSON.parse(record.leagueMetaJson || "{}"); } catch { /* Keep safe defaults for older records. */ }
    return { id: record.provider === "espn" ? `espn:${record.season}:${record.identifier}` : record.identifier, sourceId: record.identifier, provider: record.provider, name: record.leagueName ?? "Saved League", season: record.season ?? String(new Date().getUTCFullYear()), teams: meta.teams ?? 0, format: meta.format ?? "Redraft", scoring: meta.scoring ?? "Platform scoring", rosterId: record.rosterId ?? "", starterCount: meta.starterCount ?? 0 };
  };
  if (!forceRefresh && (savedSleeper.length || (!connection && savedEspn.length)))
    return Response.json({ connection: connection ?? null, leagues: [...savedSleeper.map(savedShape), ...savedEspn.map(savedShape)] });
  const currentSeason = new Date().getUTCFullYear();
  const currentLeagueResponse = connection
    ? await fetch(`https://api.sleeper.app/v1/user/${connection.sleeperUserId}/leagues/nfl/${currentSeason}`, { cache: "no-store" })
    : null;
  const leagueDiscoverySucceeded = Boolean(currentLeagueResponse?.ok);
  const currentLeagueRecords = currentLeagueResponse?.ok
    ? await currentLeagueResponse.json() as SleeperLeague[]
    : [];
  const uniqueLeagueRecords = Array.from(new Map(currentLeagueRecords.filter((league) => league.league_id).map((league) => [league.league_id!, league])).values());
  // Only the active fantasy season belongs in the primary league list.
  // Historical records remain archived and are never reintroduced as fallbacks.
  const leagueCandidates = (await Promise.all(uniqueLeagueRecords
    .sort((a, b) => Number(b.season ?? 0) - Number(a.season ?? 0))
    .map(async (league) => {
    if (!league.league_id) return null;
    const rosterResponse = await fetch(`https://api.sleeper.app/v1/league/${league.league_id}/rosters`, { cache: "no-store" });
    const rosters = rosterResponse.ok ? await rosterResponse.json() as { roster_id?: number; owner_id?: string; players?: string[] }[] : [];
    const myRoster = rosters.find((roster) => roster.owner_id === connection.sleeperUserId);
    if (!myRoster) return null;
    const receptionValue = league.scoring_settings?.rec ?? 0;
    return { id: league.league_id, name: league.name ?? "Unnamed League", season: league.season, teams: league.total_rosters ?? rosters.length, format: league.settings?.type === 2 ? "Dynasty" : league.settings?.type === 1 ? "Keeper" : "Redraft", scoring: receptionValue >= .75 ? "PPR" : receptionValue >= .25 ? "Half PPR" : "Standard", rosterId: String(myRoster.roster_id ?? ""), starterCount: (league.roster_positions ?? []).filter((slot) => slot !== "BN").length };
  }))).filter((league): league is NonNullable<typeof league> => Boolean(league));
  const sleeperLeagues = leagueCandidates.sort((a, b) => a.name.localeCompare(b.name));
  const now = new Date().toISOString();
  await Promise.all(sleeperLeagues.map((league) => db.insert(managedLeagues).values({ id: crypto.randomUUID(), userId: user.userId, provider: "sleeper", identifierType: "league_id", identifier: league.id, rosterId: league.rosterId, leagueName: league.name, season: league.season ?? null, leagueMetaJson: JSON.stringify({ teams: league.teams, format: league.format, scoring: league.scoring, starterCount: league.starterCount }), status: "live", createdAt: now, updatedAt: now }).onConflictDoUpdate({ target: [managedLeagues.userId, managedLeagues.provider, managedLeagues.identifierType, managedLeagues.identifier], set: { rosterId: league.rosterId, leagueName: league.name, season: league.season ?? null, leagueMetaJson: JSON.stringify({ teams: league.teams, format: league.format, scoring: league.scoring, starterCount: league.starterCount }), status: "live", updatedAt: now } })));
  if (leagueDiscoverySucceeded) {
    const currentLeagueIds = new Set(sleeperLeagues.map((league) => league.id));
    await Promise.all(savedSleeper
      .filter((record) => !currentLeagueIds.has(record.identifier))
      .map((record) => db.update(managedLeagues)
        .set({ status: "archived", updatedAt: now })
        .where(and(eq(managedLeagues.id, record.id), eq(managedLeagues.userId, user.userId)))));
  }
  const espnRecords = savedEspn;
  const espnLeagues = (await Promise.all(espnRecords.map(async (record) => {
    if (!record.rosterId) return null;
    try {
      const normalized = await normalizeEspnLeague(await fetchEspnLeagueForUser(user.userId, record.identifier, Number(record.season)));
      const rosterSlots = normalized.rankingContext.rosterSlots;
      const summary = { id: `espn:${normalized.league.season}:${record.identifier}`, sourceId: record.identifier, provider: "espn", name: normalized.league.name, season: normalized.league.season, teams: normalized.league.teams, format: normalized.rankingContext.format, scoring: normalized.rankingContext.scoring, rosterId: record.rosterId, starterCount: rosterSlots.filter((slot) => !["Bench", "IR"].includes(slot)).length };
      await db.update(managedLeagues).set({ leagueName: summary.name, season: summary.season, leagueMetaJson: JSON.stringify({ teams: summary.teams, format: summary.format, scoring: summary.scoring, starterCount: summary.starterCount }), updatedAt: now }).where(and(eq(managedLeagues.id, record.id), eq(managedLeagues.userId, user.userId)));
      return summary;
    } catch {
      return record.leagueName && record.season ? { id: `espn:${record.season}:${record.identifier}`, sourceId: record.identifier, provider: "espn", name: record.leagueName, season: record.season, teams: 0, format: "Redraft", scoring: "ESPN scoring", rosterId: record.rosterId, starterCount: 0 } : null;
    }
  }))).filter((league): league is NonNullable<typeof league> => Boolean(league));
  return Response.json({ connection: connection ?? null, leagues: [...sleeperLeagues.map((league) => ({ ...league, sourceId: league.id, provider: "sleeper" })), ...espnLeagues] });
}
