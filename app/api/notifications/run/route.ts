import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../../db";
import { leagueDataSnapshots, managedLeagues, pushAlertDeliveries, pushAlertStates, pushDevices, userPreferences } from "../../../../db/schema";
import { sendApplePush, type ApplePushCategory } from "../../../apns";
import { parsePushPreferences, type PushAlertKey } from "../../../push-preferences";
import { getNflGames } from "../../../highlightly-nfl";

type Alert = { key: string; preference: PushAlertKey; category: ApplePushCategory; title: string; body: string; path?: string; urgent?: boolean };
type LeaguePayload = { league?: { currentWeek?: number }; teams?: { id?: string; matchupId?: number | null; teamName?: string; roster?: { id: string; name: string; team: string; role: string; projection?: number }[] }[] };
type Matchup = { roster_id?: number; matchup_id?: number | null; points?: number; custom_points?: number | null; players_points?: Record<string, number> };
type AlertState = { playerPoints?: Record<string, number>; initialized?: boolean };

async function secret() {
  let env: Record<string, unknown> = process.env as Record<string, unknown>;
  try { env = (await import("cloudflare:workers")).env as unknown as Record<string, unknown>; } catch { /* local */ }
  return String(env.PUSH_CRON_SECRET ?? "");
}

function authorized(request: Request, expected: string) {
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || supplied.length !== expected.length) return false;
  let mismatch = 0;
  for (let index = 0; index < supplied.length; index += 1) mismatch |= supplied.charCodeAt(index) ^ expected.charCodeAt(index);
  return mismatch === 0;
}

const normalizeTeam = (team?: string) => ({ JAC: "JAX", WSH: "WAS", LA: "LAR" })[team ?? ""] ?? team ?? "";
const score = (row?: Matchup) => Number((row?.custom_points ?? row?.points ?? 0).toFixed(2));

async function deliver(userId: string, devices: (typeof pushDevices.$inferSelect)[], preferencesJson: string | undefined, alert: Alert) {
  const preferences = parsePushPreferences(preferencesJson);
  if (!preferences[alert.preference]) return { sent: 0, skipped: 1, failed: 0 };
  const db = await getDb();
  const [existing] = await db.select({ key: pushAlertDeliveries.eventKey }).from(pushAlertDeliveries).where(eq(pushAlertDeliveries.eventKey, alert.key)).limit(1);
  if (existing) return { sent: 0, skipped: 1, failed: 0 };
  const results = await Promise.allSettled(devices.map((device) => sendApplePush(device.token, {
    title: alert.title, body: alert.body, path: alert.path ?? "/", category: alert.category,
    threadId: alert.key.split(":").slice(0, 3).join(":"), interruptionLevel: alert.urgent ? "time-sensitive" : "active",
  })));
  const sent = results.filter((result) => result.status === "fulfilled").length;
  const failed = results.length - sent;
  await Promise.all(results.map(async (result, index) => {
    if (result.status !== "rejected") return;
    const error = result.reason as { status?: number; reason?: string };
    if (error.status === 410 || /BadDeviceToken|Unregistered|DeviceTokenNotForTopic/.test(error.reason ?? ""))
      await db.delete(pushDevices).where(eq(pushDevices.token, devices[index].token));
  }));
  if (sent) await db.insert(pushAlertDeliveries).values({ eventKey: alert.key, userId, category: alert.category, title: alert.title, sentCount: sent, failedCount: failed });
  return { sent, skipped: 0, failed };
}

async function evaluateSleeperLeague(record: typeof managedLeagues.$inferSelect) {
  const leagueId = record.identifier;
  const leagueResponse = await fetch(`https://api.sleeper.app/v1/league/${leagueId}`, { cache: "no-store" });
  if (!leagueResponse.ok) return null;
  const league = await leagueResponse.json() as { leg?: number; name?: string };
  const week = Math.max(1, Math.min(18, league.leg ?? 1));
  const rows = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/matchups/${week}`, { cache: "no-store" }).then((response) => response.ok ? response.json() as Promise<Matchup[]> : []);
  const rosterId = Number(record.rosterId);
  const mine = rows.find((row) => row.roster_id === rosterId);
  const opponent = rows.find((row) => row.matchup_id != null && row.matchup_id === mine?.matchup_id && row.roster_id !== rosterId);
  return { league, week, mine, opponent };
}

export async function POST(request: Request) {
  if (!authorized(request, await secret())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const startedAt = Date.now();
  const db = await getDb();
  const devices = await db.select().from(pushDevices).where(eq(pushDevices.enabled, true));
  const userIds = [...new Set(devices.map((device) => device.userId))];
  if (!userIds.length) return Response.json({ ok: true, users: 0, sent: 0, failed: 0 });
  const [preferences, leagues, snapshots] = await Promise.all([
    db.select().from(userPreferences).where(inArray(userPreferences.userId, userIds)),
    db.select().from(managedLeagues).where(and(inArray(managedLeagues.userId, userIds), eq(managedLeagues.status, "live"))),
    db.select().from(leagueDataSnapshots).where(inArray(leagueDataSnapshots.userId, userIds)),
  ]);
  const testEmail = String((await request.json().catch(() => ({})) as { testEmail?: unknown }).testEmail ?? "").trim().toLowerCase();
  if (testEmail) {
    const preference = preferences.find((item) => item.email.toLowerCase() === testEmail);
    if (!preference) return Response.json({ error: "No push-enabled account found for that email" }, { status: 404 });
    const userDevices = devices.filter((device) => device.userId === preference.userId);
    if (!userDevices.length) return Response.json({ error: "No enabled iOS device is registered for that account" }, { status: 404 });
    const results = await Promise.allSettled(userDevices.map((device) => sendApplePush(device.token, {
      title: "Fantasy Hub notifications connected",
      body: "APNs accepted this test notification. Game-day alerts are ready.",
      path: "/",
      category: "GENERAL",
      threadId: "fantasy-hub-validation",
    })));
    return Response.json({ ok: results.some((result) => result.status === "fulfilled"), sent: results.filter((result) => result.status === "fulfilled").length, failed: results.filter((result) => result.status === "rejected").length });
  }
  const games = await getNflGames({ date: new Date().toISOString().slice(0, 10), cacheSeconds: 20 }).catch(() => []);
  let sent = 0, failed = 0, skipped = 0;
  for (const userId of userIds) {
    const userDevices = devices.filter((device) => device.userId === userId);
    const preference = preferences.find((item) => item.userId === userId)?.pushPreferencesJson;
    for (const record of leagues.filter((league) => league.userId === userId && league.provider === "sleeper" && league.identifierType === "league_id")) {
      const live = await evaluateSleeperLeague(record).catch(() => null);
      if (!live?.mine || !live.opponent) continue;
      const snapshotRow = snapshots.find((item) => item.userId === userId && item.leagueKey === record.identifier);
      let payload: LeaguePayload = {};
      try { payload = JSON.parse(snapshotRow?.payloadJson ?? "{}") as LeaguePayload; } catch { /* no cached roster */ }
      const myTeam = payload.teams?.find((team) => team.id === record.rosterId);
      const opponentTeam = payload.teams?.find((team) => team.matchupId != null && team.matchupId === myTeam?.matchupId && team.id !== myTeam?.id);
      const relevantPlayers = [...(myTeam?.roster ?? []), ...(opponentTeam?.roster ?? [])].filter((player) => player.role !== "Bench");
      const relevantTeams = new Set(relevantPlayers.map((player) => normalizeTeam(player.team)).filter(Boolean));
      const relevantGames = games.filter((game) => relevantTeams.has(game.away.abbreviation) || relevantTeams.has(game.home.abbreviation));
      const leagueName = record.leagueName ?? live.league.name ?? "Fantasy matchup";
      const base = `${userId}:${record.identifier}:${live.week}`;
      const alerts: Alert[] = [];
      for (const game of relevantGames) {
        const kickoff = new Date(game.date ?? "").getTime();
        const minutes = (kickoff - Date.now()) / 60_000;
        if (minutes >= 10 && minutes <= 20) alerts.push({ key: `${base}:kickoff:${game.id}`, preference: "kickoffSoon", category: "KICKOFF_SOON", title: "Kickoff in 15 minutes", body: `${leagueName} has relevant starters locking soon.`, path: "/", urgent: true });
        if (game.state === "in") alerts.push({ key: `${base}:slate:${game.id}`, preference: "slateStarted", category: "SLATE_STARTED", title: "Your NFL window is live", body: `${leagueName} now has players on the field.`, path: "/" });
      }
      const currentPoints = { ...(live.mine.players_points ?? {}), ...(live.opponent.players_points ?? {}) };
      const stateKey = `${userId}:${record.identifier}`;
      const [stored] = await db.select().from(pushAlertStates).where(eq(pushAlertStates.stateKey, stateKey)).limit(1);
      let state: AlertState = {};
      try { state = JSON.parse(stored?.payloadJson ?? "{}") as AlertState; } catch { /* baseline */ }
      if (state.initialized) for (const player of relevantPlayers) {
        const delta = (currentPoints[player.id] ?? 0) - (state.playerPoints?.[player.id] ?? 0);
        if (delta >= 5) alerts.push({ key: `${base}:big-play:${player.id}:${currentPoints[player.id]}`, preference: "bigPlays", category: "BIG_PLAY", title: `${player.name} made a big play`, body: `+${delta.toFixed(1)} points in ${leagueName}. Your matchup is now ${score(live.mine).toFixed(1)}–${score(live.opponent).toFixed(1)}.`, path: "/", urgent: true });
      }
      const difference = score(live.mine) - score(live.opponent);
      const anyLive = relevantGames.some((game) => game.state === "in");
      const allFinal = relevantGames.length > 0 && relevantGames.every((game) => game.state === "post");
      if (anyLive && Math.abs(difference) <= 5) alerts.push({ key: `${base}:close`, preference: "closeGame", category: "CLOSE_GAME", title: "Close matchup alert", body: `${leagueName} is separated by ${Math.abs(difference).toFixed(1)} points: ${score(live.mine).toFixed(1)}–${score(live.opponent).toFixed(1)}.`, urgent: true });
      if (anyLive && difference < 0) alerts.push({ key: `${base}:path:${Math.ceil(Math.abs(difference))}`, preference: "pathToVictory", category: "PATH_TO_VICTORY", title: "Your path to victory", body: `You need about ${(Math.abs(difference) + .1).toFixed(1)} more points to lead ${leagueName}.`, path: "/" });
      if (allFinal) alerts.push({ key: `${base}:result`, preference: "matchupResults", category: "MATCHUP_RESULT", title: difference >= 0 ? "Matchup won" : "Matchup final", body: `${leagueName}: ${score(live.mine).toFixed(1)}–${score(live.opponent).toFixed(1)}.`, path: "/" });
      for (const alert of alerts) { const result = await deliver(userId, userDevices, preference, alert); sent += result.sent; failed += result.failed; skipped += result.skipped; }
      const nextState = { initialized: true, playerPoints: currentPoints };
      await db.insert(pushAlertStates).values({ stateKey, userId, leagueKey: record.identifier, payloadJson: JSON.stringify(nextState), updatedAt: new Date().toISOString() }).onConflictDoUpdate({ target: pushAlertStates.stateKey, set: { payloadJson: JSON.stringify(nextState), updatedAt: new Date().toISOString() } });
    }
  }
  console.log(JSON.stringify({ event: "push_evaluator_complete", users: userIds.length, sent, failed, skipped, durationMs: Date.now() - startedAt }));
  return Response.json({ ok: true, users: userIds.length, sent, failed, skipped, durationMs: Date.now() - startedAt });
}
