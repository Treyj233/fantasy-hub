import { eq, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { leagueDataSnapshots, managedLeagues, refreshJobs, userPreferences } from '../db/schema';
import { claimRefresh } from './refresh-coordinator';
import { REFRESH, accountRefreshInterval, leagueRefreshKey } from './refresh-policy.mjs';
import { fetchCachedUpstream } from './api/upstream-cache';
import { getSleeperWeeklyStats } from './api/sleeper-shared-data';
import { loadNflSeasonSchedule } from './nfl-schedule-data';
import { fantasyWeek } from './fantasy-week.mjs';
import { vegasFeed } from './vegas-edge-server';
import { fetchEspnLeague } from './api/espn';
import { prepareWeeklyLeagueResult } from './prepared-weekly-recap';

export async function refreshActiveLeagueSnapshots(request: Request, cronSecret: string) {
  const release = await claimRefresh('portfolio-tick', 180_000);
  if (!release) return { skipped: true };
  let completed = false;
  try {
    const db = await getDb(), now = Date.now(), season = new Date().getUTCFullYear();
    const [preferences, leagues, snapshots, jobs, schedule] = await Promise.all([
      db.select({ userId: userPreferences.userId, lastActiveAt: userPreferences.lastActiveAt }).from(userPreferences),
      db.select().from(managedLeagues).where(eq(managedLeagues.status, 'live')),
      db.select({ userId: leagueDataSnapshots.userId, leagueKey: leagueDataSnapshots.leagueKey, refreshedAt: leagueDataSnapshots.refreshedAt, week: sql<number>`json_extract(${leagueDataSnapshots.payloadJson}, '$.league.projectionWeek')` }).from(leagueDataSnapshots),
      db.select().from(refreshJobs), loadNflSeasonSchedule(season),
    ]);
    const calendar = fantasyWeek(schedule);
    if (!calendar.ready) return { deferred: 'schedule unavailable' };
    const week = calendar.currentWeek;
    const recent = new Map(preferences.filter(p => now - Date.parse(p.lastActiveAt ?? '') < 30 * 86400_000).map(p => [p.userId, p]));
    const snapshotTimes = new Map(snapshots.map(s => [`${s.userId}:${s.leagueKey}`, s.week === week ? Date.parse(s.refreshedAt) : 0]));
    const jobTimes = new Map(jobs.map(j => [j.id, Math.max(j.nextAttempt, j.leaseUntil)]));
    const eligible = leagues.flatMap(record => {
      const key = leagueRefreshKey(record, season), preference = recent.get(record.userId);
      return key && preference ? [{ record, key, interval: accountRefreshInterval(preference.lastActiveAt, now) }] : [];
    });
    const due = eligible.filter(item => now - (snapshotTimes.get(`${item.record.userId}:${item.key}`) ?? 0) >= item.interval &&
      (jobTimes.get(`league:${item.record.userId}:${item.key}:${week}`) ?? 0) <= now)
      .sort((a, b) => (snapshotTimes.get(`${a.record.userId}:${a.key}`) ?? 0) - (snapshotTimes.get(`${b.record.userId}:${b.key}`) ?? 0));
    // Previous-week results are cheap and must be prepared even with no live games.
    if (calendar.completedWeek > 0) {
      const recapDue = eligible.filter(item => item.record.rosterId && (jobTimes.get(`recap:${item.record.id}:${season}:${calendar.completedWeek}`) ?? 0) <= now);
      for (const item of recapDue.slice(0, REFRESH.jobsPerTick)) {
        if (Date.now() - now > 15_000) break;
        const done = await claimRefresh(`recap:${item.record.id}:${season}:${calendar.completedWeek}`);
        if (!done) continue;
        let ok = false;
        try { ok = ['W','L','T','Bye'].includes((await prepareWeeklyLeagueResult(item.record, season, calendar.completedWeek)).outcome); }
        catch { /* One unavailable recap must not prevent refreshing other leagues. */ }
        finally { await done(ok, REFRESH.portfolio); }
      }
    }
    // Prepare the new week's shared projection feed before expensive league models.
    const projections = await fetchCachedUpstream(`https://api.sleeper.com/projections/nfl/${season}/${week}?season_type=regular`, 900).catch(() => null);
    await projections?.body?.cancel();
    if (calendar.completedWeek > 0) await getSleeperWeeklyStats(String(season), calendar.completedWeek).catch(() => null);
    let refreshed = 0, failed = 0;
    let cursor = 0;
    // Reserve one bounded job per Monday tick for the upcoming week. Separate
    // snapshot keys preserve this week's live data while Tuesday gets prepared.
    const monday = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short' }).format(new Date(now)) === 'Mon';
    const nextWeek = week + 1;
    const upcoming = monday && schedule.some(game => game.week === nextWeek)
      ? eligible.filter(item => (jobTimes.get(`league:${item.record.userId}:${item.key}:${nextWeek}`) ?? 0) <= now)
        .sort((a,b) => (jobTimes.get(`league:${a.record.userId}:${a.key}:${nextWeek}`) ?? 0) - (jobTimes.get(`league:${b.record.userId}:${b.key}:${nextWeek}`) ?? 0))
        .slice(0, 1).map(item => ({ ...item, week: nextWeek, interval: REFRESH.portfolio }))
      : [];
    const batch = [...upcoming, ...due.map(item => ({ ...item, week }))].slice(0, REFRESH.jobsPerTick);
    // Full roster models are memory-heavy; serialize them within each tick.
    await Promise.all(Array.from({ length: 1 }, async () => {
      while (cursor < batch.length && Date.now() - now < 40_000) {
        const item = batch[cursor++];
        const done = await claimRefresh(`league:${item.record.userId}:${item.key}:${item.week}`);
        if (!done) continue;
        let ok = false;
        try {
          const url = new URL('/api/league', request.url);
          url.search = new URLSearchParams({ id: item.key, week: String(item.week), refresh: '1' }).toString();
          const response = await fetch(url, { headers: { authorization: `Bearer ${cronSecret}`, 'x-fantasy-hub-sync-user': item.record.userId }, signal: AbortSignal.timeout(18_000) });
          ok = response.ok;
          await response.body?.cancel();
        } catch { /* Preserve the last successful snapshot. */ }
        await done(ok, item.interval);
        if (ok) refreshed++; else failed++;
      }
    }));
    // Schedule-only gating: scoring must not wait for Highlightly play-by-play.
    const games = schedule.filter(game => game.week === week);
    const live = games.some(game => {
      const elapsed = now - Date.parse(game.date);
      return elapsed >= 0 && elapsed < 6 * 3600_000 && !/final|finished|cancel|postpon/i.test(game.status ?? '');
    });
    const nearKickoff = games.some(game => { const left = Date.parse(game.date) - now; return left > 0 && left <= 2 * 3600_000; });
    const keys = [...new Set(eligible.map(i => i.key))].sort((a,b) =>
      (jobTimes.get(`${live ? 'score' : 'roster'}:${a}:${week}`) ?? 0) - (jobTimes.get(`${live ? 'score' : 'roster'}:${b}:${week}`) ?? 0));
    let warmed = 0;
    cursor = 0;
    await Promise.all(Array.from({ length: 3 }, async () => {
      while ((live || nearKickoff) && cursor < keys.length && Date.now() - now < 65_000) {
        const key = keys[cursor++];
        const kind = live ? 'score' : 'roster';
        const done = await claimRefresh(`${kind}:${key}:${week}`, 30_000);
        if (!done) continue;
        let ok = false;
        try {
          if (key.startsWith('espn:')) {
            await fetchEspnLeague(key.split(':')[2], season, week);
            ok = true;
          } else {
            const response = await fetchCachedUpstream(`https://api.sleeper.app/v1/league/${key}/${live ? `matchups/${week}` : 'rosters'}`, live ? 30 : 300);
            ok = response.ok; await response.body?.cancel();
          }
        } catch { /* Retry with backoff, without erasing known scores. */ }
        await done(ok, live ? REFRESH.live : REFRESH.roster);
        if (ok) warmed++;
      }
    }));
    if (live) await getSleeperWeeklyStats(String(season), week).catch(() => null);
    const vegas = await vegasFeed(true).catch(() => null);
    completed = true;
    return { due: due.length, refreshed, failed, warmed, vegasUsage: vegas?.usage ?? null };
  } finally { await release(completed, 0); }
}
