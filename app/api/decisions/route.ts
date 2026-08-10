import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { decisionMemory, sleeperConnections } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";

type DecisionInput = { id?: string; leagueId?: string; week?: number; category?: string; recommendation?: string; alternatives?: unknown[]; information?: Record<string, unknown>; confidence?: number; userSelection?: string | null };

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
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
  const leagueId = new URL(request.url).searchParams.get("leagueId")?.trim();
  if (!leagueId) return Response.json({ error: "Select a league first" }, { status: 400 });
  const db = await getDb();
  const [connection] = await db.select().from(sleeperConnections).where(eq(sleeperConnections.userId, user.userId)).limit(1);
  const rows = await db.select().from(decisionMemory).where(and(eq(decisionMemory.userId, user.userId), eq(decisionMemory.leagueId, leagueId))).orderBy(desc(decisionMemory.createdAt));
  if (!connection) return Response.json({ decisions: [], summary: null });
  const unresolvedStartSit = rows.filter((row) => row.category === "start_sit" && row.userSelection && !row.resultJson);
  if (unresolvedStartSit.length) {
    const leagueResponse = await fetch(`https://api.sleeper.app/v1/league/${leagueId}`, { next: { revalidate: 60 } }).catch(() => null);
    const rostersResponse = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`, { next: { revalidate: 300 } }).catch(() => null);
    const league = leagueResponse?.ok ? await leagueResponse.json().catch(() => ({})) as { leg?: number } : {};
    const rosters = rostersResponse?.ok ? await rostersResponse.json().catch(() => []) as { roster_id?: number; owner_id?: string }[] : [];
    const myRosterId = rosters.find((roster) => roster.owner_id === connection.sleeperUserId)?.roster_id;
    const completed = unresolvedStartSit.filter((row) => row.week < (league.leg ?? row.week));
    const matchupByWeek = new Map<number, { roster_id?: number; players_points?: Record<string, number> }[]>();
    await Promise.all([...new Set(completed.map((row) => row.week))].map(async (week) => { const response = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/matchups/${week}`, { next: { revalidate: 3600 } }).catch(() => null); matchupByWeek.set(week, response?.ok ? await response.json().catch(() => []) : []); }));
    for (const row of completed) {
      const alternatives = JSON.parse(row.alternativesJson) as { id?: string; name?: string; projection?: number }[];
      const selected = alternatives.find((item) => item.name === row.userSelection);
      const recommended = alternatives.find((item) => item.name === row.recommendation);
      const points = matchupByWeek.get(row.week)?.find((item) => item.roster_id === myRosterId)?.players_points ?? {};
      if (!selected?.id || !recommended?.id) continue;
      const selectedPoints = Number((points[selected.id] ?? 0).toFixed(2));
      const recommendedPoints = Number((points[recommended.id] ?? 0).toFixed(2));
      const processGrade = row.userSelection === row.recommendation || (selected.projection ?? 0) >= (recommended.projection ?? 0) * .9 ? "Reasonable" : "Questionable with available evidence";
      await db.update(decisionMemory).set({ resultJson: JSON.stringify({ selectedPoints, recommendedPoints, pointsLeft: Math.max(0, Number((recommendedPoints - selectedPoints).toFixed(2))), outcome: selectedPoints > recommendedPoints ? "User selection outscored the model pick" : selectedPoints < recommendedPoints ? "Model pick outscored the user selection" : "Selections tied" }), processGrade, updatedAt: new Date().toISOString() }).where(and(eq(decisionMemory.id, row.id), eq(decisionMemory.userId, user.userId)));
    }
  }
  const refreshedRows = unresolvedStartSit.length ? await db.select().from(decisionMemory).where(and(eq(decisionMemory.userId, user.userId), eq(decisionMemory.leagueId, leagueId))).orderBy(desc(decisionMemory.createdAt)) : rows;
  const parsed = refreshedRows.map((row) => ({ ...row, alternatives: JSON.parse(row.alternativesJson), information: JSON.parse(row.informationJson), result: row.resultJson ? JSON.parse(row.resultJson) : null }));
  const selected = parsed.filter((row) => row.userSelection);
  const resolved = parsed.filter((row) => row.result);
  const byCategory = ["start_sit", "waiver", "trade"].map((category) => { const items = parsed.filter((row) => row.category === category); return { category, total: items.length, selected: items.filter((row) => row.userSelection).length, resolved: items.filter((row) => row.result).length, averageConfidence: items.length ? Math.round(items.reduce((sum, row) => sum + row.confidence, 0) / items.length) : null }; });
  const startSitResults = parsed.filter((row) => row.category === "start_sit" && row.result) as (typeof parsed[number] & { result: { pointsLeft?: number; recommendedPoints?: number } })[];
  return Response.json({ decisions: parsed, summary: { total: parsed.length, selected: selected.length, resolved: resolved.length, processReasonable: parsed.filter((row) => row.processGrade === "Reasonable").length, pointsLeftOnBench: Number(startSitResults.reduce((sum, row) => sum + (row.result.pointsLeft ?? 0), 0).toFixed(1)), byCategory, projectionAccuracy: null, strongestPosition: null, weakestPosition: null, note: "Outcome grades appear only after Fantasy Hub observes a final result. Process quality is evaluated from the saved information available at decision time." } });
}
