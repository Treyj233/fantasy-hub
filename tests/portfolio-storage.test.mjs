import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { portfolioStorage, portfolioKey } from '../app/portfolio-storage.mjs';

function disk() {
  const rows = new Map();
  return { open() {
    const open = {};
    queueMicrotask(() => {
      open.result = { close() {}, transaction() {
        const transaction = { objectStore() { return {
          get(key) { return { result: structuredClone(rows.get(key)) }; },
          put(value, key) { rows.set(key, structuredClone(value)); return {}; },
        }; } };
        queueMicrotask(() => transaction.oncomplete());
        return transaction;
      } };
      open.onsuccess();
    });
    return open;
  } };
}

test('cold-open portfolio persists independently of localStorage and isolates accounts', async () => {
  const factory = disk();
  const snapshot = { version: 2, savedAt: 123, scans: [{ week: 2, league: { id: 'one' }, roster: [{ name: 'Player' }] }] };
  assert.equal(await portfolioStorage('Owner@example.com', snapshot, factory), true);
  const { portfolioStorage: reopened } = await import('../app/portfolio-storage.mjs?cold-open');
  assert.deepEqual(await reopened('owner@example.com', undefined, factory), snapshot);
  assert.equal(await reopened('other@example.com', undefined, factory), null);
  assert.equal(portfolioKey(' Owner@example.com '), 'portfolio:owner@example.com');
});

test('unavailable or blocked storage does not prevent startup', async () => {
  assert.equal(await portfolioStorage('owner', undefined, null), null);
  assert.equal(await portfolioStorage('owner', undefined, { open() { throw Error('blocked'); } }), null);
});

test('portfolio scanning waits for persistence restoration and saves under stable account identity', () => {
  const source = readFileSync(new URL('../app/FantasyHub.tsx', import.meta.url), 'utf8');
  assert.match(source, /if \(!cacheReady \|\| !leagues.length\) return/);
  assert.match(source, /cacheReady=\{portfolioCacheReady && calendar.ready\}/);
  assert.match(source, /void portfolioStorage\(accountUser.email, \{/);
  assert.match(source, /cachedScansRef.current.filter\(scan => leagueIds.has\(scan.league.id\)\)/);
});
