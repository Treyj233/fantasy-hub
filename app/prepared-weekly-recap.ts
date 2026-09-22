import { and, eq } from 'drizzle-orm';
import { getDb } from '../db';
import { leagueDataSnapshots, managedLeagues } from '../db/schema';
import { providerFetch } from './api/provider-fetch';
import { fetchEspnLeagueForUser, normalizeEspnScoreboard } from './api/espn';
import { recapResult } from './weekly-recap.mjs';

type Result = { outcome: string; points?: number; opponentPoints?: number };
export async function prepareWeeklyLeagueResult(record: typeof managedLeagues.$inferSelect, season: number, week: number): Promise<Result> {
  const db = await getDb();
  const leagueKey = `weekly-recap:${season}:${week}:${record.provider}:${record.identifier}:${record.rosterId}`;
  const [saved] = await db.select().from(leagueDataSnapshots).where(and(eq(leagueDataSnapshots.userId, record.userId), eq(leagueDataSnapshots.leagueKey, leagueKey))).limit(1);
  let previous: Result | null = null;
  try { previous = saved ? JSON.parse(saved.payloadJson) : null; } catch { /* Retry malformed cache. */ }
  if (previous && saved && Date.now() - Date.parse(saved.refreshedAt) < 15 * 60_000) return previous;
  try {
    let result: Result;
    if (record.provider === 'espn') {
      result = recapResult(normalizeEspnScoreboard(await fetchEspnLeagueForUser(record.userId, record.identifier, season, week), record.rosterId!, week), week, record.rosterId);
    } else {
      const response = await providerFetch(`https://api.sleeper.app/v1/league/${record.identifier}/matchups/${week}`);
      if (!response.ok) throw new Error('Scores still syncing');
      const rows = await response.json() as { roster_id: number; matchup_id: number | null; points: number; custom_points?: number | null }[];
      const mine = rows.find(row => String(row.roster_id) === record.rosterId);
      if (!mine) return previous ?? { outcome: 'Pending' };
      const opponent = mine.matchup_id == null ? null : rows.find(row => row.roster_id !== mine.roster_id && row.matchup_id === mine.matchup_id);
      if (!opponent) result = { outcome: 'Bye' };
      else {
        const points = mine.custom_points ?? mine.points;
        const opponentPoints = opponent.custom_points ?? opponent.points;
        if (!Number.isFinite(points) || !Number.isFinite(opponentPoints)) return previous ?? { outcome: 'Pending' };
        result = { outcome: points > opponentPoints ? 'W' : points < opponentPoints ? 'L' : 'T', points, opponentPoints };
      }
    }
    if (!['W', 'L', 'T', 'Bye'].includes(result.outcome)) return previous ?? result;
    const refreshedAt = new Date().toISOString(), payloadJson = JSON.stringify(result);
    await db.insert(leagueDataSnapshots).values({ id: crypto.randomUUID(), userId: record.userId, leagueKey, payloadJson, refreshedAt })
      .onConflictDoUpdate({ target: [leagueDataSnapshots.userId, leagueDataSnapshots.leagueKey], set: { payloadJson, refreshedAt } });
    return result;
  } catch { return previous ?? { outcome: 'Pending' }; }
}
