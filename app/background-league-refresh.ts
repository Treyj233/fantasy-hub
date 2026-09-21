import { eq } from 'drizzle-orm';
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

export async function refreshActiveLeagueSnapshots(request: Request, cronSecret: string) {
  const release = await claimRefresh('portfolio-tick', 180_000);
  if (!release) return { skipped: true };
  let completed = false;
  try {
    const db = await getDb(), now = Date.now(), season = new Date().getUTCFullYear();
    const [preferences, leagues, snapshots, jobs, schedule] = await Promise.all([
      db.select({ userId: userPreferences.userId, lastActiveAt: userPreferences.lastActiveAt }).from(userPreferences),
      db.select().from(managedLeagues).where(eq(managedLeagues.status, 'live')),
      db.select({ userId: leagueDataSnapshots.userId, leagueKey: leagueDataSnapshots.leagueKey, refreshedAt: leagueDataSnapshots.refreshedAt }).from(leagueDataSnapshots),
      db.select().from(refreshJobs), loadNflSeasonSchedule(season),
    ]);
    const calendar = fantasyWeek(schedule);
    if (!calendar.ready) return { deferred: 'schedule unavailable' };
    const week = calendar.currentWeek;
    const recent = new Map(preferences.filter(p => now - Date.parse(p.lastActiveAt ?? '') < 30 * 86400_000).map(p => [p.userId, p]));
    const snapshotTimes = new Map(snapshots.map(s => [`${s.userId}:${s.leagueKey}`, Date.parse(s.refreshedAt)]));
    const jobTimes = new Map(jobs.map(j => [j.id, Math.max(j.nextAttempt, j.leaseUntil)]));
    const eligible = leagues.flatMap(record => {
      const key = leagueRefreshKey(record, season), preference = recent.get(record.userId);
      return key && preference ? [{ record, key, interval: accountRefreshInterval(preference.lastActiveAt, now) }] : [];
    });
    const due = eligible.filter(item => now - (snapshotTimes.get(`${item.record.userId}:${item.key}`) ?? 0) >= item.interval &&
      (jobTimes.get(`league:${item.record.userId}:${item.key}`) ?? 0) <= now)
      .sort((a, b) => (jobTimes.get(`league:${a.record.userId}:${a.key}`) ?? 0) - (jobTimes.get(`league:${b.record.userId}:${b.key}`) ?? 0));
    let refreshed = 0, failed = 0;
    let cursor = 0;
    const batch = due.slice(0, REFRESH.jobsPerTick);
    await Promise.all(Array.from({ length: 3 }, async () => {
      while (cursor < batch.length && Date.now() - now < 40_000) {
        const item = batch[cursor++];
        const done = await claimRefresh(`league:${item.record.userId}:${item.key}`);
        if (!done) continue;
        let ok = false;
        try {
          const url = new URL('/api/league', request.url);
          url.search = new URLSearchParams({ id: item.key, week: String(week), refresh: '1' }).toString();
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
