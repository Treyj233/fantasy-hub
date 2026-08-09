import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { sleeperConnections } from "../../../../db/schema";
import { getChatGPTUser } from "../../../chatgpt-auth";

type SleeperLeague = { league_id?: string; name?: string; season?: string; total_rosters?: number; avatar?: string | null; settings?: { type?: number }; scoring_settings?: { rec?: number }; roster_positions?: string[] };

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const db = await getDb();
  const [connection] = await db.select().from(sleeperConnections).where(eq(sleeperConnections.userId, user.userId)).limit(1);
  if (!connection) return Response.json({ error: "Connect a Sleeper account first" }, { status: 409 });
  const currentSeason = new Date().getUTCFullYear();
  const seasons = [String(currentSeason), String(currentSeason - 1)];
  const leagueGroups = await Promise.all(seasons.map(async (season) => {
    const response = await fetch(`https://api.sleeper.app/v1/user/${connection.sleeperUserId}/leagues/nfl/${season}`, { next: { revalidate: 300 } });
    return response.ok ? await response.json() as SleeperLeague[] : [];
  }));
  const leagues = (await Promise.all(leagueGroups.flat().map(async (league) => {
    if (!league.league_id) return null;
    const rosterResponse = await fetch(`https://api.sleeper.app/v1/league/${league.league_id}/rosters`, { next: { revalidate: 300 } });
    const rosters = rosterResponse.ok ? await rosterResponse.json() as { roster_id?: number; owner_id?: string }[] : [];
    const myRoster = rosters.find((roster) => roster.owner_id === connection.sleeperUserId);
    if (!myRoster) return null;
    const receptionValue = league.scoring_settings?.rec ?? 0;
    return { id: league.league_id, name: league.name ?? "Unnamed League", season: league.season, teams: league.total_rosters ?? rosters.length, format: league.settings?.type === 2 ? "Dynasty" : league.settings?.type === 1 ? "Keeper" : "Redraft", scoring: receptionValue >= .75 ? "PPR" : receptionValue >= .25 ? "Half PPR" : "Standard", rosterId: String(myRoster.roster_id ?? ""), starterCount: (league.roster_positions ?? []).filter((slot) => slot !== "BN").length };
  }))).filter((league): league is NonNullable<typeof league> => Boolean(league)).sort((a, b) => Number(b.season ?? 0) - Number(a.season ?? 0) || a.name.localeCompare(b.name));
  return Response.json({ connection, leagues });
}
