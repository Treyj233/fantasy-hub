import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { leagueDataSnapshots, managedLeagues } from "../db/schema";
import { providerFetch } from "./api/provider-fetch";

// Repair metadata only: never trigger a portfolio/roster rescan to find a title.
export async function repairLeagueNames(db: Awaited<ReturnType<typeof getDb>>, records: (typeof managedLeagues.$inferSelect)[]) {
  for (const record of records) {
    if (record.status !== "live" || record.identifierType !== "league_id" ||
        (record.leagueName?.trim() && !/^saved league$/i.test(record.leagueName.trim()))) continue;
    try {
      const key = record.provider === "espn" ? `espn:${record.season}:${record.identifier}` : record.identifier;
      const [snapshot] = await db.select({ name: sql<string>`json_extract(${leagueDataSnapshots.payloadJson}, '$.league.name')` })
        .from(leagueDataSnapshots).where(and(eq(leagueDataSnapshots.userId, record.userId), eq(leagueDataSnapshots.leagueKey, key))).limit(1);
      let name = snapshot?.name?.trim();
      if ((!name || /^saved league$/i.test(name)) && record.provider === "sleeper") {
        const response = await providerFetch(`https://api.sleeper.app/v1/league/${encodeURIComponent(record.identifier)}`);
        if (response.ok) {
          const metadata = await response.json() as { name?: string };
          name = metadata.name?.trim();
        }
      }
      if (!name || /^saved league$/i.test(name)) continue;
      await db.update(managedLeagues).set({ leagueName: name }).where(and(eq(managedLeagues.id, record.id), eq(managedLeagues.userId, record.userId)));
      record.leagueName = name;
    } catch { /* A provider outage must not prevent opening already saved leagues. */ }
  }
}
