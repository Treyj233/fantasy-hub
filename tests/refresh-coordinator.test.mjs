import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { and, eq, lte, sql } from 'drizzle-orm';
import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
import { retryDelay } from '../app/refresh-policy.mjs';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../drizzle/0021_new_darkhawk.sql', import.meta.url), 'utf8'));
  const refreshJobs = sqliteTable('refresh_jobs', { id: text('id').primaryKey(), leaseUntil: integer('lease_until').default(0), nextAttempt: integer('next_attempt').default(0), failures: integer('failures').default(0), token: text('token').default('') });
  const providerBudgets = sqliteTable('provider_budgets', { id: text('id').primaryKey(), windowStart: integer('window_start'), used: integer('used').default(0), blockedUntil: integer('blocked_until').default(0) });
  const db = drizzle(async (query, params, method) => {
    const statement = sqlite.prepare(query);
    if (method === 'run') { statement.run(...params); return { rows: [] }; }
    return { rows: statement.all(...params).map(row => Object.values(row)) };
  });
  const source = readFileSync(new URL('../app/refresh-coordinator.ts', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace(/export /g, '');
  const compiled = ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 });
  const api = new Function('getDb', 'refreshJobs', 'providerBudgets', 'retryDelay', 'and', 'eq', 'lte', 'sql', compiled+'; return { claimRefresh, takeProviderToken, blockProvider };')(
    async () => db, refreshJobs, providerBudgets, retryDelay, and, eq, lte, sql);
  return { ...api, close: () => sqlite.close() };
}
test('durable leases prevent duplicate workers and late completion cannot release a newer lease', async t => {
  const f = fixture(); t.after(f.close);
  let now = 1000000; t.mock.method(Date, 'now', () => now);
  const first = await f.claimRefresh('league:1', 1000);
  assert.equal(typeof first, 'function');
  assert.equal(await f.claimRefresh('league:1', 1000), null);
  now += 1001;
  const second = await f.claimRefresh('league:1', 1000);
  await first(true, 0);
  assert.equal(await f.claimRefresh('league:1', 1000), null);
  await second(false, 0);
  assert.equal(await f.claimRefresh('league:1', 1000), null);
  now += retryDelay(1)+1;
  assert.equal(typeof await f.claimRefresh('league:1'), 'function');
});
test('distributed provider budget remains below 500/minute, limits bursts, honors provider backoff', async t => {
  const f = fixture(); t.after(f.close);
  let now = 1000000; t.mock.method(Date, 'now', () => now);
  let granted = 0;
  const first = await Promise.all(Array.from({length:40},()=>f.takeProviderToken('sleeper',500)));
  assert.ok(first.filter(Boolean).length <= 25);
  granted += first.filter(Boolean).length;
  for(let i=0;i<599;i++) { now += 100; if(await f.takeProviderToken('sleeper',500)) granted++; }
  assert.ok(granted <= 500, `granted ${granted}`);
  assert.ok(granted > 400);
  await f.blockProvider('sleeper',60000);
  now += 1000;
  assert.equal(await f.takeProviderToken('sleeper',500),false);
  now += 60000;
  assert.equal(await f.takeProviderToken('sleeper',500),true);
});
