import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { sleeperConnections } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";

type MatchupRow = { roster_id?: number; matchup_id?: number | null; points?: number; custom_points?: number | null };

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const leagueId = new URL(request.url).searchParams.get("leagueId")?.trim();
  if (!leagueId || !/^\d{6,24}$/.test(leagueId)) return Response.json({ error: "Select a league first" }, { status: 400 });
  const db = await getDb();
  const [connection] = await db.select().from(sleeperConnections).where(eq(sleeperConnections.userId, user.userId)).limit(1);
  if (!connection) return Response.json({ error: "Connect a Sleeper account first" }, { status: 409 });
  const [leagueResponse, rostersResponse] = await Promise.all([
    fetch(`https://api.sleeper.app/v1/league/${leagueId}`, { next: { revalidate: 300 } }),
    fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`, { next: { revalidate: 300 } }),
  ]);
  if (!leagueResponse.ok || !rostersResponse.ok) return Response.json({ error: "League simulation details unavailable" }, { status: 502 });
  const league = await leagueResponse.json() as { name?: string; season?: string; leg?: number; total_rosters?: number; roster_positions?: string[]; scoring_settings?: Record<string, number>; settings?: { playoff_week_start?: number; playoff_teams?: number; type?: number } };
  const rosters = await rostersResponse.json() as { roster_id?: number; owner_id?: string }[];
  if (!rosters.some((roster) => roster.owner_id === connection.sleeperUserId)) return Response.json({ error: "This league is not attached to your connected account" }, { status: 403 });
  const playoffWeekStart = Math.max(2, Math.min(18, league.settings?.playoff_week_start ?? 15));
  const regularSeasonWeeks = playoffWeekStart - 1;
  const weeklyResponses = await Promise.all(Array.from({ length: regularSeasonWeeks }, (_, index) => fetch(`https://api.sleeper.app/v1/league/${leagueId}/matchups/${index + 1}`, { next: { revalidate: 300 } })));
  const weeklyRows = await Promise.all(weeklyResponses.map(async (response) => response.ok ? await response.json() as MatchupRow[] : []));
  const weeks = weeklyRows.map((rows, index) => {
    const grouped = new Map<number, MatchupRow[]>();
    rows.forEach((row, rowIndex) => { const key = row.matchup_id ?? 1000 + rowIndex; grouped.set(key, [...(grouped.get(key) ?? []), row]); });
    return { week: index + 1, matchups: [...grouped.values()].filter((pair) => pair.length === 2).map((pair) => ({ teams: pair.map((row) => String(row.roster_id ?? "")), points: pair.map((row) => Number((row.custom_points ?? row.points ?? 0).toFixed(2))) })) };
  });
  return Response.json({
    league: { name: league.name ?? "League", season: league.season ?? String(new Date().getUTCFullYear()), currentWeek: league.leg ?? 1, totalTeams: league.total_rosters ?? rosters.length, playoffTeams: Math.max(2, Math.min(rosters.length, league.settings?.playoff_teams ?? 6)), playoffWeekStart, regularSeasonWeeks, format: league.settings?.type === 2 ? "Dynasty" : league.settings?.type === 1 ? "Keeper" : "Redraft", starterSlots: (league.roster_positions ?? []).filter((slot) => slot !== "BN" && slot !== "IR" && slot !== "TAXI"), scoringRuleCount: Object.values(league.scoring_settings ?? {}).filter((value) => value !== 0).length },
    weeks,
  });
}
