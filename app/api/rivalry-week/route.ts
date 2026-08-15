import { and, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { rivalryPreferences, sleeperConnections } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";
import { requirePro } from "../../entitlements";

type Roster = { roster_id?: number; owner_id?: string };
type Manager = { user_id?: string; display_name?: string; metadata?: { team_name?: string } };
type Matchup = { roster_id?: number; matchup_id?: number | null };

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const paywall = await requirePro(user.userId, user.email);
  if (paywall) return paywall;
  const leagueId = new URL(request.url).searchParams.get("leagueId")?.trim();
  if (!leagueId || !/^\d{6,24}$/.test(leagueId)) return Response.json({ active: false });

  const db = await getDb();
  const [[connection], [saved]] = await Promise.all([
    db.select().from(sleeperConnections).where(eq(sleeperConnections.userId, user.userId)).limit(1),
    db.select().from(rivalryPreferences).where(and(eq(rivalryPreferences.userId, user.userId), eq(rivalryPreferences.leagueId, leagueId))).limit(1),
  ]);
  if (!connection || !saved) return Response.json({ active: false });
  let rivalIds: number[] = [];
  try {
    rivalIds = (JSON.parse(saved.rosterIdsJson) as unknown[]).filter((id): id is number => typeof id === "number" && Number.isInteger(id)).slice(0, 3);
  } catch { /* A malformed preference should behave like no selected rivals. */ }
  if (!rivalIds.length) return Response.json({ active: false });

  const leagueResponse = await fetch(`https://api.sleeper.app/v1/league/${leagueId}`, { next: { revalidate: 60 } });
  if (!leagueResponse.ok) return Response.json({ active: false });
  const league = await leagueResponse.json() as { leg?: number; season?: string };
  const week = Math.min(18, Math.max(1, league.leg ?? 1));
  const [rostersResponse, managersResponse, matchupsResponse] = await Promise.all([
    fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`, { next: { revalidate: 300 } }),
    fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`, { next: { revalidate: 300 } }),
    fetch(`https://api.sleeper.app/v1/league/${leagueId}/matchups/${week}`, { next: { revalidate: 30 } }),
  ]);
  if (!rostersResponse.ok || !managersResponse.ok || !matchupsResponse.ok) return Response.json({ active: false });
  const rosters = await rostersResponse.json() as Roster[];
  const managers = await managersResponse.json() as Manager[];
  const matchups = await matchupsResponse.json() as Matchup[];
  const mine = rosters.find((roster) => roster.owner_id === connection.sleeperUserId);
  const myMatchup = matchups.find((matchup) => matchup.roster_id === mine?.roster_id);
  if (!mine?.roster_id || myMatchup?.matchup_id == null) return Response.json({ active: false });
  const opponentMatchup = matchups.find((matchup) => matchup.matchup_id === myMatchup.matchup_id && matchup.roster_id !== mine.roster_id);
  if (!opponentMatchup?.roster_id || !rivalIds.includes(opponentMatchup.roster_id)) return Response.json({ active: false });
  const opponentRoster = rosters.find((roster) => roster.roster_id === opponentMatchup.roster_id);
  const manager = managers.find((candidate) => candidate.user_id === opponentRoster?.owner_id);
  return Response.json({
    active: true,
    leagueId,
    week,
    season: league.season ?? "",
    opponentRosterId: opponentMatchup.roster_id,
    opponentName: manager?.metadata?.team_name ?? manager?.display_name ?? `Team ${opponentMatchup.roster_id}`,
    managerName: manager?.display_name ?? "League rival",
  });
}
