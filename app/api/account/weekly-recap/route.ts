import { and, eq } from 'drizzle-orm';
import { getDb } from '../../../../db';
import { managedLeagues } from '../../../../db/schema';
import { getChatGPTUser } from '../../../chatgpt-auth';
import { currentFantasyWeek } from '../../../current-fantasy-week';
import { prepareWeeklyLeagueResult } from '../../../prepared-weekly-recap';

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401 });
  const url = new URL(request.url);
  const season = Number(url.searchParams.get('season')), week = Number(url.searchParams.get('week'));
  if (!Number.isInteger(season) || season < 2020 || season > 2035 || !Number.isInteger(week) || week < 1 || week > 18)
    return Response.json({ error: 'Invalid week' }, { status: 400 });
  const calendar = await currentFantasyWeek(season);
  if (!calendar.ready || week > calendar.completedWeek) return Response.json({ results: [] });
  const db = await getDb();
  const records = (await db.select().from(managedLeagues).where(and(eq(managedLeagues.userId, user.userId), eq(managedLeagues.status, 'live'))))
    .filter(record => record.identifierType === 'league_id' && record.rosterId && (!record.season || Number(record.season) === season));
  const results = [];
  for (let index = 0; index < records.length; index += 2) {
    results.push(...await Promise.all(records.slice(index, index + 2).map(async record => ({
      id: record.provider === 'espn' ? `espn:${season}:${record.identifier}` : record.identifier,
      ...await prepareWeeklyLeagueResult(record, season, week),
    }))));
  }
  return Response.json({ results }, { headers: { 'Cache-Control': 'private, no-store' } });
}
