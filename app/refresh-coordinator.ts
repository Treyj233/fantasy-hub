import { and, eq, lte, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { refreshJobs, providerBudgets } from '../db/schema';
import { retryDelay } from './refresh-policy.mjs';

export async function claimRefresh(id: string, leaseMs = 120_000) {
  const db = await getDb();
  const now = Date.now(), token = crypto.randomUUID();
  await db.insert(refreshJobs).values({ id }).onConflictDoNothing();
  const rows = await db.update(refreshJobs).set({ token, leaseUntil: now + leaseMs })
    .where(and(eq(refreshJobs.id, id), lte(refreshJobs.leaseUntil, now), lte(refreshJobs.nextAttempt, now)))
    .returning({ failures: refreshJobs.failures });
  if (!rows.length) return null;
  return async (success: boolean, interval: number) => {
    const failures = success ? 0 : rows[0].failures + 1;
    await db.update(refreshJobs).set({ leaseUntil: 0, token: '', failures,
      nextAttempt: Date.now() + (success ? interval : retryDelay(failures)) })
      .where(and(eq(refreshJobs.id, id), eq(refreshJobs.token, token)));
  };
}

// Atomic cross-isolate budget. A rolling token bucket avoids boundary bursts.
export async function takeProviderToken(id: string, perMinute: number) {
  const db = await getDb(), now = Date.now();
  const burst = Math.min(25, Math.floor(perMinute / 2));
  const spacing = Math.ceil(60_000 / (perMinute - burst));
  await db.insert(providerBudgets).values({ id, windowStart: now - burst * spacing, used: 0 }).onConflictDoNothing();
  const rows = await db.update(providerBudgets).set({
    windowStart: sql`max(${providerBudgets.windowStart}, ${now - burst * spacing}) + ${spacing}`,
    used: sql`${providerBudgets.used} + 1`,
  }).where(and(eq(providerBudgets.id, id), lte(providerBudgets.blockedUntil, now),
    lte(providerBudgets.windowStart, now - spacing))).returning({ id: providerBudgets.id });
  return rows.length > 0;
}
export async function blockProvider(id: string, milliseconds: number) {
  const db = await getDb();
  await db.update(providerBudgets).set({ blockedUntil: Date.now() + milliseconds }).where(eq(providerBudgets.id, id));
}
