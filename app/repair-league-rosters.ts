import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { managedLeagues, leagueDataSnapshots, sleeperConnections } from '../db/schema';
import { providerFetch } from './api/provider-fetch';
import { resolveLeagueOwner } from './league-owner.mjs';

// Older manually connected leagues may have a name but no owned roster ID.
// Repair from a saved snapshot first; provider access is only for missing IDs.
export async function repairLeagueRosters(db: Awaited<ReturnType<typeof getDb>>, records: (typeof managedLeagues.$inferSelect)[]) {
  const connections = new Map<string, string>();
  for (const record of records) {
    if (record.provider !== 'sleeper' || record.status !== 'live' || record.identifierType !== 'league_id' || record.rosterId) continue;
    try {
      if (!connections.has(record.userId)) {
        const [connection] = await db.select().from(sleeperConnections).where(eq(sleeperConnections.userId, record.userId)).limit(1);
        connections.set(record.userId, connection?.sleeperUserId ?? '');
      }
      const owner = connections.get(record.userId);
      if (!owner) continue;
      const [saved] = await db.select({ teams: sql<string>`json_extract(${leagueDataSnapshots.payloadJson}, '$.teams')` }).from(leagueDataSnapshots)
        .where(and(eq(leagueDataSnapshots.userId, record.userId), eq(leagueDataSnapshots.leagueKey, record.identifier))).limit(1);
      let team = resolveLeagueOwner(JSON.parse(saved?.teams ?? '[]'), null, owner);
      if (!team) {
        const response = await providerFetch(`https://api.sleeper.app/v1/league/${record.identifier}/rosters`);
        if (response.ok) team = resolveLeagueOwner(await response.json(), null, owner);
      }
      const rosterId = team?.id ?? team?.roster_id;
      if (rosterId == null) continue;
      await db.update(managedLeagues).set({ rosterId: String(rosterId) }).where(and(eq(managedLeagues.id, record.id), eq(managedLeagues.userId, record.userId)));
      record.rosterId = String(rosterId);
    } catch { /* Keep the connection; retry independently on the next refresh. */ }
  }
}
