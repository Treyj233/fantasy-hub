import { portfolioStorage } from './portfolio-storage.mjs';
// Durable, account/week scoped cache. Never block rendering or network on disk.
const pages = new Map();
const restores = new Map();
const timers = new Map();
const listeners = new Map();
const failures = new Map();
const keyFor = (identity, leagueId, week) => JSON.stringify([identity, leagueId, week]);
const sourceTime = (value, now) => {
  const parsed = Date.parse(value?.cache?.refreshedAt ?? '');
  return Number.isFinite(parsed) ? Math.min(now, parsed) : now;
};
export function subscribeLeaguePage(identity, leagueId, week, listener) {
  const key = keyFor(identity, leagueId, week);
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(listener);
  return () => { const set = listeners.get(key); set?.delete(listener); if (!set?.size) listeners.delete(key); };
}
export function restoreLeaguePages(identity, storage = portfolioStorage) {
  if (!identity) return Promise.resolve();
  if (restores.has(identity)) return restores.get(identity);
  const request = storage(`league-pages:${identity}`).then(saved => {
    for (const [key, entry] of Array.isArray(saved?.entries) ? saved.entries : []) {
      try {
        if (JSON.parse(key)[0] !== identity || Date.now() - entry.savedAt >= 7 * 86400_000) continue;
        entry.savedAt = sourceTime(entry.value, entry.savedAt);
        entry.checkedAt = Math.min(entry.checkedAt ?? 0, entry.savedAt);
        if (!pages.has(key) || pages.get(key).savedAt < entry.savedAt) pages.set(key, entry);
      } catch { /* Ignore malformed cache entries. */ }
    }
    while (pages.size > 32) pages.delete(pages.keys().next().value);
  }).catch(() => {});
  restores.set(identity, request);
  return request;
}
export function rememberLeaguePage(identity, leagueId, week, value, now = Date.now()) {
  const key = keyFor(identity, leagueId, week);
  const previous = pages.get(key);
  // Reading, navigating, and portfolio analysis must never renew freshness.
  if (previous?.value === value) return;
  const savedAt = sourceTime(value, now);
  if (previous && previous.savedAt > savedAt) return;
  pages.delete(key);
  pages.set(key, { value, savedAt, checkedAt: 0 });
  while (pages.size > 32) pages.delete(pages.keys().next().value);
  for (const listener of listeners.get(key) ?? []) listener(value);
  if (identity && globalThis.indexedDB) {
    clearTimeout(timers.get(identity));
    timers.set(identity, setTimeout(async () => {
      timers.delete(identity);
      await restoreLeaguePages(identity);
      await portfolioStorage(`league-pages:${identity}`, { entries: [...pages].filter(([key]) => JSON.parse(key)[0] === identity) });
    }, 250));
  }
}
export function readLeaguePage(identity, leagueId, week, now = Date.now(), allowStale = false) {
  const key = JSON.stringify([identity, leagueId, week]);
  const entry = pages.get(key);
  if (!entry || now - entry.savedAt >= (allowStale ? 7 * 86400_000 : 15 * 60_000)) return null;
  return entry.value;
}

const pending = new Map();
export function forgetLeaguePage(identity, leagueId, week) {
  pages.delete(JSON.stringify([identity, leagueId, week]));
}
// Consumers share parsed data, never response streams or another consumer's abort signal.
export function loadLeaguePage(identity, leagueId, week, refresh = false) {
  const key = keyFor(identity, leagueId, week);
  const existing = pending.get(key);
  if (existing) {
    if (!refresh || existing.forced) return existing.promise;
    // Manual refresh requested during a saved read upgrades once, not in parallel.
    if (!existing.upgrade) existing.upgrade = existing.promise.catch(() => null).then(data => existing.forced && data ? data : loadLeaguePage(identity, leagueId, week, true));
    return existing.upgrade;
  }
  const entry = pages.get(key);
  if (!refresh && entry && Date.now() - entry.checkedAt < 60_000 && Date.now() - entry.savedAt < 15 * 60_000 && entry.value.projectionsReady !== false)
    return Promise.resolve(entry.value);
  const failure = failures.get(key);
  if (!refresh && failure?.retryAt > Date.now()) {
    const saved = readLeaguePage(identity, leagueId, week, Date.now(), true);
    return saved ? Promise.resolve(saved) : Promise.reject(new Error('Retrying league shortly'));
  }
  const fetchPage = async force => {
    const response = await fetch(`/api/league?id=${encodeURIComponent(leagueId)}&week=${week}${force ? '&refresh=1' : ''}`, { signal: AbortSignal.timeout(45_000), cache: 'no-store' });
    if (!response.ok) throw new Error(`League refresh failed (${response.status})`);
    const data = await response.json();
    if (data.league?.projectionWeek !== week) throw new Error('Waiting for the selected week');
    rememberLeaguePage(identity, leagueId, week, data);
    const stored = pages.get(key);
    if (stored?.value === data) stored.checkedAt = Date.now();
    return stored?.value ?? data;
  };
  const request = (async () => {
    try {
      let data = await fetchPage(refresh);
      if (!refresh && (data.cache?.revalidateRecommended || data.cache?.status === 'stale')) {
        const operation = pending.get(key);
        if (operation) operation.forced = true;
        data = await fetchPage(true);
      }
      failures.delete(key);
      return data;
    } catch (error) {
      const count = (failures.get(key)?.count ?? 0) + 1;
      failures.set(key, { count, retryAt: Date.now() + Math.min(300_000, 30_000 * 2 ** Math.min(count - 1, 4)) });
      // Keep a known-good same-week roster on outages, without changing its age.
      const saved = readLeaguePage(identity, leagueId, week, Date.now(), true);
      if (saved && !refresh) return saved;
      throw error;
    }
  })().finally(() => pending.delete(key));
  pending.set(key, { promise: request, forced: refresh });
  return request;
}
