import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { decisionMemory, sleeperConnections } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";
import { requirePro } from "../../entitlements";

type DecisionInput = { id?: string; leagueId?: string; week?: number; category?: string; recommendation?: string; alternatives?: unknown[]; information?: Record<string, unknown>; confidence?: number; userSelection?: string | null };

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const paywall = await requirePro(user.userId, user.email);
  if (paywall) return paywall;
  const body = await request.json().catch(() => ({})) as DecisionInput;
  if (!body.id || !body.leagueId || !body.category || !body.recommendation || !Number.isInteger(body.week)) return Response.json({ error: "Incomplete decision record" }, { status: 400 });
  const db = await getDb();
  const now = new Date().toISOString();
  const id = `${user.userId}:${body.id}`;
  const [existing] = await db.select({ userSelection: decisionMemory.userSelection }).from(decisionMemory).where(and(eq(decisionMemory.id, id), eq(decisionMemory.userId, user.userId))).limit(1);
  const values = { id, userId: user.userId, leagueId: body.leagueId, week: body.week!, category: body.category, recommendation: body.recommendation, alternativesJson: JSON.stringify(body.alternatives ?? []), informationJson: JSON.stringify(body.information ?? {}), confidence: Math.max(0, Math.min(100, body.confidence ?? 50)), userSelection: body.userSelection ?? existing?.userSelection ?? null, updatedAt: now };
  await db.insert(decisionMemory).values(values).onConflictDoUpdate({ target: decisionMemory.id, set: { recommendation: values.recommendation, alternativesJson: values.alternativesJson, informationJson: values.informationJson, confidence: values.confidence, userSelection: values.userSelection, updatedAt: now } });
  return Response.json({ saved: true, id: values.id });
}

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const paywall = await requirePro(user.userId, user.email);
  if (paywall) return paywall;
  const leagueId = new URL(request.url).searchParams.get("leagueId")?.trim();
  if (!leagueId || !/^\d{6,24}$/.test(leagueId)) return Response.json({ error: "Select a Sleeper league first" }, { status: 400 });
  const db = await getDb();
  const [connection] = await db.select().from(sleeperConnections).where(eq(sleeperConnections.userId, user.userId)).limit(1);
  if (!connection) return Response.json({ error: "Connect a Sleeper account first" }, { status: 409 });

  type SleeperPlayer = { full_name?: string; first_name?: string; last_name?: string; position?: string };
  type Matchup = { roster_id?: number; starters?: string[]; players_points?: Record<string, number> };
  type Transaction = { transaction_id?: string; type?: string; status?: string; status_updated?: number; created?: number; roster_ids?: number[]; adds?: Record<string, number> | null; drops?: Record<string, number> | null; settings?: { waiver_bid?: number } | null; draft_picks?: { season?: string; round?: number; previous_owner_id?: number; owner_id?: number }[] };
  const [leagueResponse, rostersResponse, playersResponse] = await Promise.all([
    fetch(`https://api.sleeper.app/v1/league/${leagueId}`, { next: { revalidate: 60 } }).catch(() => null),
    fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`, { next: { revalidate: 300 } }).catch(() => null),
    fetch("https://api.sleeper.app/v1/players/nfl", { next: { revalidate: 86400 } }).catch(() => null),
  ]);
  if (!leagueResponse?.ok || !rostersResponse?.ok) return Response.json({ error: "Sleeper activity is temporarily unavailable" }, { status: 502 });
  const league = await leagueResponse.json() as { leg?: number; name?: string };
  const rosters = await rostersResponse.json() as { roster_id?: number; owner_id?: string }[];
  const players = playersResponse?.ok ? await playersResponse.json().catch(() => ({})) as Record<string, SleeperPlayer> : {};
  const week = Math.max(1, Math.min(18, league.leg ?? 1));
  const myRosterId = rosters.find((roster) => roster.owner_id === connection.sleeperUserId)?.roster_id;
  if (!myRosterId) return Response.json({ error: "Your Sleeper roster could not be identified in this league" }, { status: 409 });
  const [matchupsResponse, transactionsResponse] = await Promise.all([
    fetch(`https://api.sleeper.app/v1/league/${leagueId}/matchups/${week}`, { next: { revalidate: 30 } }).catch(() => null),
    fetch(`https://api.sleeper.app/v1/league/${leagueId}/transactions/${week}`, { next: { revalidate: 60 } }).catch(() => null),
  ]);
  const matchups = matchupsResponse?.ok ? await matchupsResponse.json().catch(() => []) as Matchup[] : [];
  const transactions = transactionsResponse?.ok ? await transactionsResponse.json().catch(() => []) as Transaction[] : [];
  const myMatchup = matchups.find((row) => row.roster_id === myRosterId);
  const starterIds = new Set(myMatchup?.starters ?? []);
  const playerPoints = myMatchup?.players_points ?? {};
  const playerName = (id: string) => players[id]?.full_name ?? (`${players[id]?.first_name ?? ""} ${players[id]?.last_name ?? ""}`.trim() || `Player ${id}`);
  const safeJson = <T,>(value: string, fallback: T): T => { try { return JSON.parse(value) as T; } catch { return fallback; } };
  let rows = await db.select().from(decisionMemory).where(and(eq(decisionMemory.userId, user.userId), eq(decisionMemory.leagueId, leagueId))).orderBy(desc(decisionMemory.createdAt));
  const unresolvedWinPaths = rows.filter((row) => row.category === "win_path" && !row.resultJson && row.week < week);
  for (const row of unresolvedWinPaths) {
    const response = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/matchups/${row.week}`, { next: { revalidate: 3600 } }).catch(() => null);
    const historicalMatchups = response?.ok ? await response.json().catch(() => []) as Matchup[] : [];
    const points = historicalMatchups.find((matchup) => matchup.roster_id === myRosterId)?.players_points ?? {};
    const targets = safeJson<{ id?: string; name?: string; targetTotal?: number }[]>(row.alternativesJson, []);
    const resolvedPlayers = targets.flatMap((target) => {
      if (!target.id || !target.name || typeof target.targetTotal !== "number") return [];
      const actualPoints = Number((points[target.id] ?? 0).toFixed(1));
      const targetTotal = Number(target.targetTotal.toFixed(1));
      const difference = Number((actualPoints - targetTotal).toFixed(1));
      return [{ id: target.id, name: target.name, actualPoints, targetTotal, difference, outcome: difference > .05 ? "over" : difference < -.05 ? "short" : "met" }];
    });
    await db.update(decisionMemory).set({ resultJson: JSON.stringify({ players: resolvedPlayers }), processGrade: "Outcome recorded", updatedAt: new Date().toISOString() }).where(and(eq(decisionMemory.id, row.id), eq(decisionMemory.userId, user.userId)));
  }
  if (unresolvedWinPaths.length) rows = await db.select().from(decisionMemory).where(and(eq(decisionMemory.userId, user.userId), eq(decisionMemory.leagueId, leagueId))).orderBy(desc(decisionMemory.createdAt));
  const startSit = rows.filter((row) => row.category === "start_sit" && row.week === week).flatMap((row) => {
    const alternatives = safeJson<{ id?: string; name?: string; position?: string; projection?: number }[]>(row.alternativesJson, []);
    const actual = alternatives.find((option) => option.id && starterIds.has(option.id));
    const recommended = alternatives.find((option) => option.name === row.recommendation);
    if (!actual || !recommended) return [];
    const actualPoints = Number((playerPoints[actual.id ?? ""] ?? 0).toFixed(1));
    const recommendedPoints = Number((playerPoints[recommended.id ?? ""] ?? 0).toFixed(1));
    return [{ id: row.id, actual: actual.name ?? "Unknown starter", recommended: recommended.name ?? row.recommendation, position: actual.position ?? recommended.position ?? "FLEX", actualPoints, recommendedPoints, followedRecommendation: actual.id === recommended.id, confidence: Math.round(row.confidence) }];
  });
  const completed = transactions.filter((transaction) => transaction.status === "complete" && (transaction.roster_ids?.includes(myRosterId) || Object.values(transaction.adds ?? {}).includes(myRosterId) || Object.values(transaction.drops ?? {}).includes(myRosterId)));
  const waiverMoves = completed.filter((transaction) => transaction.type === "waiver" || transaction.type === "free_agent").map((transaction) => ({
    id: transaction.transaction_id ?? `move-${transaction.created ?? 0}`,
    type: transaction.type === "waiver" ? "Waiver claim" : "Free-agent move",
    added: Object.entries(transaction.adds ?? {}).filter(([, rosterId]) => rosterId === myRosterId).map(([id]) => playerName(id)),
    dropped: Object.entries(transaction.drops ?? {}).filter(([, rosterId]) => rosterId === myRosterId).map(([id]) => playerName(id)),
    faab: Math.max(0, Math.round(transaction.settings?.waiver_bid ?? 0)),
    timestamp: transaction.status_updated ?? transaction.created ?? null,
  }));
  const trades = completed.filter((transaction) => transaction.type === "trade").map((transaction) => ({
    id: transaction.transaction_id ?? `trade-${transaction.created ?? 0}`,
    received: Object.entries(transaction.adds ?? {}).filter(([, rosterId]) => rosterId === myRosterId).map(([id]) => playerName(id)),
    sent: Object.entries(transaction.drops ?? {}).filter(([, rosterId]) => rosterId === myRosterId).map(([id]) => playerName(id)),
    picksReceived: (transaction.draft_picks ?? []).filter((pick) => pick.owner_id === myRosterId).map((pick) => `${pick.season ?? "Future"} Round ${pick.round ?? "—"}`),
    picksSent: (transaction.draft_picks ?? []).filter((pick) => pick.previous_owner_id === myRosterId).map((pick) => `${pick.season ?? "Future"} Round ${pick.round ?? "—"}`),
    timestamp: transaction.status_updated ?? transaction.created ?? null,
  }));
  const winPathReports = rows.filter((row) => row.category === "win_path").map((row) => ({ ...row, result: row.resultJson ? safeJson<Record<string, unknown>>(row.resultJson, {}) : null }));
  return Response.json({ league: { name: league.name ?? "Sleeper league", week }, observed: { startSit, waiverMoves, trades }, winPathReports, summary: { total: startSit.length + waiverMoves.length + trades.length, startSit: startSit.length, waiverMoves: waiverMoves.length, trades: trades.length, source: "Sleeper" } });
}
