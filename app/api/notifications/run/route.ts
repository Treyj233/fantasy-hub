import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../../db";
import { espnLeagueSnapshots, leagueDataSnapshots, managedLeagues, pushAlertDeliveries, pushAlertStates, pushDevices, userPreferences } from "../../../../db/schema";
import { sendApplePush, type ApplePushCategory } from "../../../apns";
import { parsePushPreferences, type PushAlertKey } from "../../../push-preferences";
import { getNflGames } from "../../../highlightly-nfl";
import { loadNflSeasonSchedule } from "../../../nfl-schedule-data";
import { fantasyWeek } from "../../../fantasy-week.mjs";
import { notificationGameState, unavailableStarter, dangerousFantasyWeather, matchupFinished } from "../../../push-alert-rules.mjs";
import { fetchEspnLeague, normalizeEspnScoreboard, type EspnPayload } from "../../espn";
import { fetchCachedUpstream } from "../../upstream-cache";
import { forecastFor } from "../../weather/route";

type Alert = { key: string; preference: PushAlertKey; category: ApplePushCategory; title: string; body: string; path?: string; urgent?: boolean };
type LeaguePayload = { league?: { currentWeek?: number }; teams?: { id?: string; matchupId?: number | null; teamName?: string; roster?: { id: string; name: string; team: string; role: string; projection?: number }[] }[] };
type Matchup = { roster_id?: number; matchup_id?: number | null; points?: number; custom_points?: number | null; players_points?: Record<string, number>; starters?: string[] };
type AlertPlayer = { id: string; name: string; team: string; status?: string };
type AlertState = { playerPoints?: Record<string, number>; initialized?: boolean; period?: string };
const ACTIVE_ACCOUNT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const BACKGROUND_REFRESH_INTERVAL_MS = 30 * 60 * 1000;

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

async function refreshActiveLeagueSnapshots(request: Request, cronSecret: string) {
  const db = await getDb();
  const [preferences, snapshots] = await Promise.all([
    db.select({ userId: userPreferences.userId, activeLeagueId: userPreferences.activeLeagueId, lastActiveAt: userPreferences.lastActiveAt }).from(userPreferences),
    db.select({ userId: leagueDataSnapshots.userId, leagueKey: leagueDataSnapshots.leagueKey, refreshedAt: leagueDataSnapshots.refreshedAt }).from(leagueDataSnapshots),
  ]);
  const refreshedAt = new Map(snapshots.map((snapshot) => [`${snapshot.userId}:${snapshot.leagueKey}`, new Date(snapshot.refreshedAt).getTime()]));
  const due = preferences.filter((preference) => {
    if (!preference.activeLeagueId || !preference.lastActiveAt) return false;
    if (Date.now() - new Date(preference.lastActiveAt).getTime() > ACTIVE_ACCOUNT_WINDOW_MS) return false;
    return Date.now() - (refreshedAt.get(`${preference.userId}:${preference.activeLeagueId}`) ?? 0) >= BACKGROUND_REFRESH_INTERVAL_MS;
  });
  let refreshed = 0;
  let failed = 0;
  for (let index = 0; index < due.length; index += 3) {
    const batch = due.slice(index, index + 3);
    const results = await Promise.all(batch.map(async (preference) => {
      const url = new URL("/api/league", request.url);
      url.searchParams.set("id", preference.activeLeagueId!);
      url.searchParams.set("refresh", "1");
      const response = await fetch(url, {
        headers: { authorization: `Bearer ${cronSecret}`, "x-fantasy-hub-sync-user": preference.userId },
      });
      await response.body?.cancel();
      return response.ok;
    }).map((result) => result.catch(() => false)));
    refreshed += results.filter(Boolean).length;
    failed += results.filter((result) => !result).length;
  }
  return { due: due.length, refreshed, failed };
}

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
  if (sent) await db.insert(pushAlertDeliveries).values({ eventKey: alert.key, userId, category: alert.category, title: alert.title, sentCount: sent, failedCount: failed }).onConflictDoNothing();
  return { sent, skipped: 0, failed };
}

async function evaluateSleeperLeague(record: typeof managedLeagues.$inferSelect, week: number) {
  const leagueId = record.identifier;
  const leagueResponse = await fetch(`https://api.sleeper.app/v1/league/${leagueId}`, { cache: "no-store" });
  if (!leagueResponse.ok) return null;
  const league = await leagueResponse.json() as { leg?: number; name?: string };
  const rows = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/matchups/${week}`, { cache: "no-store" }).then((response) => response.ok ? response.json() as Promise<Matchup[]> : []);
  const rosterId = Number(record.rosterId);
  const mine = rows.find((row) => row.roster_id === rosterId);
  const opponent = rows.find((row) => row.matchup_id != null && row.matchup_id === mine?.matchup_id && row.roster_id !== rosterId);
  return { league, week, mine, opponent };
}

async function evaluateEspnLeague(record: typeof managedLeagues.$inferSelect, season: number, week: number) {
  // Fetch live public data; never treat an old extension snapshot as live scoring.
  const leagueId = record.identifier.replace(/^espn:/, '');
  const payload = await fetchEspnLeague(leagueId, season, week).catch(async () => {
    const db = await getDb();
    const [snapshot] = await db.select().from(espnLeagueSnapshots).where(and(eq(espnLeagueSnapshots.userId, record.userId), eq(espnLeagueSnapshots.leagueId, leagueId), eq(espnLeagueSnapshots.season, String(season)))).limit(1);
    if (!snapshot || Date.now() - Date.parse(snapshot.syncedAt) > 120_000) return null;
    return JSON.parse(snapshot.payloadJson) as EspnPayload;
  });
  if (!payload) return null;
  if (payload.seasonId !== season || payload.scoringPeriodId !== week) return null;
  const board = normalizeEspnScoreboard(payload, record.rosterId ?? '', week);
  const matchup = board.matchups.find(row => row.teams.some(team => team.isMine));
  const mine = matchup?.teams.find(team => team.isMine);
  const opponent = matchup?.teams.find(team => !team.isMine);
  if (!mine || !opponent) return null;
  const statuses = new Map<string, string | undefined>(payload.teams?.flatMap(team => (team.roster?.entries ?? []).map(entry => [`espn-player:${entry.playerPoolEntry?.player?.id}`, entry.playerPoolEntry?.player?.injuryStatus] as const)));
  const shape = (team: typeof mine): Matchup => ({ points: team.points, starters: team.topPlayers.filter(player => player.isStarter).map(player => player.id), players_points: Object.fromEntries(team.topPlayers.map(player => [player.id, player.points])) });
  const players = [...mine.topPlayers, ...opponent.topPlayers].filter(player => player.isStarter).map(player => ({ id: player.id, name: player.name, team: player.nflTeam, status: statuses.get(player.id) }));
  return { league: { name: board.league.name }, week, mine: shape(mine), opponent: shape(opponent), players };
}

export async function POST(request: Request) {
  const cronSecret = await secret();
  if (!authorized(request, cronSecret)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const startedAt = Date.now();
  const db = await getDb();
  const backgroundRefresh = await refreshActiveLeagueSnapshots(request, cronSecret).catch(() => ({ due: 0, refreshed: 0, failed: 1 }));
  const devices = await db.select().from(pushDevices).where(eq(pushDevices.enabled, true));
  const userIds = [...new Set(devices.map((device) => device.userId))];
  if (!userIds.length) return Response.json({ ok: true, users: 0, sent: 0, failed: 0, backgroundRefresh });
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
  const season = new Date().getUTCFullYear();
  const schedule = await loadNflSeasonSchedule(season);
  const calendar = fantasyWeek(schedule);
  if (!calendar.ready) return Response.json({ ok: false, error: "Schedule unavailable; alerts deferred" }, { status: 503 });
  const week = calendar.currentWeek;
  const liveGames = await getNflGames({ season, week, cacheSeconds: 20 }).catch(() => []);
  const games = schedule.filter(game => game.week === week).map(game => {
    const live = liveGames.find(candidate => normalizeTeam(candidate.home.abbreviation) === game.home.abbreviation && normalizeTeam(candidate.away.abbreviation) === game.away.abbreviation);
    return { ...game, state: live?.state, status: live?.status ?? game.status, venueDetail: live?.venue };
  });
  const playerResponse = await fetchCachedUpstream("https://api.sleeper.app/v1/players/nfl", 300).catch(() => null);
  const playerDirectory = playerResponse?.ok ? await playerResponse.json() as Record<string, { full_name?: string; team?: string; injury_status?: string; status?: string }> : {};
  const weather = new Map<string, Awaited<ReturnType<typeof forecastFor>>>();
  for (const game of games) {
    const minutes = (Date.parse(game.date) - Date.now()) / 60_000;
    if (minutes >= 0 && minutes <= 90 && game.venueDetail && !/allegiant|at&t|superdome|ford field|lucas oil|mercedes-benz|nrg stadium|state farm stadium|u\.s\. bank/i.test(game.venue)) {
      weather.set(game.id, await forecastFor(game.date, game.venueDetail).catch(() => null));
    }
  }
  let sent = 0, failed = 0, skipped = 0;
  for (const userId of userIds) {
    const userDevices = devices.filter((device) => device.userId === userId);
    const preference = preferences.find((item) => item.userId === userId)?.pushPreferencesJson;
    for (const record of leagues.filter((league) => league.userId === userId && ["sleeper", "espn"].includes(league.provider) && league.identifierType === "league_id" && (!league.season || Number(league.season) === season))) {
      const live = await (record.provider === 'espn' ? evaluateEspnLeague(record, season, week) : evaluateSleeperLeague(record, week)).catch(() => null);
      if (!live?.mine || !live.opponent) continue;
      const snapshotRow = snapshots.find((item) => item.userId === userId && item.leagueKey === record.identifier);
      let payload: LeaguePayload = {};
      try { payload = JSON.parse(snapshotRow?.payloadJson ?? "{}") as LeaguePayload; } catch { /* no cached roster */ }
      const myTeam = payload.teams?.find((team) => team.id === record.rosterId);
      const opponentTeam = payload.teams?.find((team) => team.matchupId != null && team.matchupId === myTeam?.matchupId && team.id !== myTeam?.id);
      const cachedPlayers = [...(myTeam?.roster ?? []), ...(opponentTeam?.roster ?? [])];
      const relevantPlayers: AlertPlayer[] = 'players' in live ? live.players : [...(live.mine.starters ?? []), ...(live.opponent.starters ?? [])].filter(id => id !== '0').map(id => {
        const player = playerDirectory[id];
        const cached = cachedPlayers.find(item => item.id === id);
        return { id, name: player?.full_name ?? cached?.name ?? id, team: player?.team ?? cached?.team ?? '', status: player?.injury_status ?? player?.status };
      });
      const relevantTeams = new Set(relevantPlayers.map((player) => normalizeTeam(player.team)).filter(Boolean));
      const relevantGames = games.filter((game) => relevantTeams.has(game.away.abbreviation) || relevantTeams.has(game.home.abbreviation));
      const leagueName = record.leagueName ?? live.league.name ?? "Fantasy matchup";
      const base = `${userId}:${record.provider}:${record.identifier}:${season}:${live.week}`;
      const alerts: Alert[] = [];
      for (const game of relevantGames) {
        const kickoff = new Date(game.date ?? "").getTime();
        const minutes = (kickoff - Date.now()) / 60_000;
        if (minutes >= 10 && minutes <= 20) alerts.push({ key: `${base}:kickoff:${game.id}`, preference: "kickoffSoon", category: "KICKOFF_SOON", title: "Kickoff in 15 minutes", body: `${leagueName} has relevant starters locking soon.`, path: "/", urgent: true });
        if (notificationGameState(game) === "in" && minutes >= -20) alerts.push({ key: `${base}:slate:${game.id}`, preference: "slateStarted", category: "SLATE_STARTED", title: "Your NFL window is live", body: `${leagueName} has reached its scheduled kickoff window.`, path: "/" });
        if (minutes >= 0 && minutes <= 90 && dangerousFantasyWeather(weather.get(game.id))) alerts.push({ key: `${base}:weather:${game.id}`, preference: "weatherRisk", category: "WEATHER_RISK", title: "Weather watch", body: `${game.away.abbreviation} at ${game.home.abbreviation}: wind or heavy precipitation may affect starters in ${leagueName}.` });
      }
      for (const player of relevantPlayers.filter(player => live.mine?.starters?.includes(player.id))) {
        const game = relevantGames.find(game => [game.home.abbreviation, game.away.abbreviation].includes(normalizeTeam(player.team)));
        const minutes = game ? (Date.parse(game.date) - Date.now()) / 60_000 : -1;
        if (minutes < 0 || minutes > 90 || !unavailableStarter(player.status)) continue;
        alerts.push({ key: `${base}:injury:${player.id}:${player.status}`, preference: "injuryStatus", category: "INJURY_STATUS", title: `${player.name}: ${player.status}`, body: `A starter in ${leagueName} has an availability concern. Check your lineup before kickoff.` });
        if (minutes <= 20) alerts.push({ key: `${base}:lineup:${player.id}`, preference: "lineupUrgency", category: "LINEUP_URGENCY", title: "Review your starting lineup", body: `${player.name} is ${player.status} and locks soon in ${leagueName}.`, urgent: true });
      }
      const currentPoints = { ...(live.mine.players_points ?? {}), ...(live.opponent.players_points ?? {}) };
      const stateLeagueKey = `${record.provider}:${record.identifier}`;
      const stateKey = `${userId}:${stateLeagueKey}`;
      const [stored] = await db.select().from(pushAlertStates).where(eq(pushAlertStates.stateKey, stateKey)).limit(1);
      let state: AlertState = {};
      try { state = JSON.parse(stored?.payloadJson ?? "{}") as AlertState; } catch { /* baseline */ }
      if (state.initialized && state.period === base) for (const player of relevantPlayers) {
        const delta = (currentPoints[player.id] ?? 0) - (state.playerPoints?.[player.id] ?? 0);
        if (delta >= 5 && state.playerPoints?.[player.id] != null) alerts.push({ key: `${base}:big-play:${player.id}:${currentPoints[player.id]}`, preference: "bigPlays", category: "BIG_PLAY", title: `${player.name}: scoring update`, body: `+${delta.toFixed(1)} points since the last update in ${leagueName}. Your matchup is now ${score(live.mine).toFixed(1)}–${score(live.opponent).toFixed(1)}.`, path: "/", urgent: true });
      }
      const difference = score(live.mine) - score(live.opponent);
      const anyLive = relevantGames.some((game) => notificationGameState(game) === "in");
      const allFinal = matchupFinished(games);
      if (anyLive && Math.abs(difference) <= 5) alerts.push({ key: `${base}:close`, preference: "closeGame", category: "CLOSE_GAME", title: "Close matchup alert", body: `${leagueName} is separated by ${Math.abs(difference).toFixed(1)} points: ${score(live.mine).toFixed(1)}–${score(live.opponent).toFixed(1)}.`, urgent: true });
      const canStillScore = relevantPlayers.some(player => live.mine?.starters?.includes(player.id) && !unavailableStarter(player.status) && relevantGames.some(game => [game.home.abbreviation, game.away.abbreviation].includes(normalizeTeam(player.team)) && notificationGameState(game) !== 'post'));
      if (anyLive && canStillScore && difference < 0) alerts.push({ key: `${base}:path:${Math.floor(Date.now() / 3600000)}`, preference: "pathToVictory", category: "PATH_TO_VICTORY", title: "Your live scoring gap", body: `You trail by ${Math.abs(difference).toFixed(1)} in ${leagueName}, with starters still to finish. Your opponent can also add points.`, path: "/" });
      if (allFinal) alerts.push({ key: `${base}:result`, preference: "matchupResults", category: "MATCHUP_RESULT", title: difference > 0 ? "Matchup won" : difference === 0 ? "Matchup tied" : "Matchup final", body: `${leagueName}: ${score(live.mine).toFixed(1)}–${score(live.opponent).toFixed(1)}. Subject to stat corrections.`, path: "/" });
      for (const alert of alerts) { const result = await deliver(userId, userDevices, preference, alert); sent += result.sent; failed += result.failed; skipped += result.skipped; }
      const nextState = { initialized: true, playerPoints: currentPoints, period: base };
      await db.insert(pushAlertStates).values({ stateKey, userId, leagueKey: stateLeagueKey, payloadJson: JSON.stringify(nextState), updatedAt: new Date().toISOString() }).onConflictDoUpdate({ target: pushAlertStates.stateKey, set: { payloadJson: JSON.stringify(nextState), updatedAt: new Date().toISOString() } });
    }
  }
  console.log(JSON.stringify({ event: "push_evaluator_complete", users: userIds.length, sent, failed, skipped, durationMs: Date.now() - startedAt }));
  return Response.json({ ok: true, users: userIds.length, sent, failed, skipped, backgroundRefresh, durationMs: Date.now() - startedAt });
}
