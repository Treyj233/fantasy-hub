import { portfolioStorage } from './portfolio-storage.mjs';
// Durable, account/week scoped cache. Never block rendering or network on disk.
const pages = new Map();
const restores = new Map();
const timers = new Map();
export function restoreLeaguePages(identity, storage = portfolioStorage) {
  if (!identity) return Promise.resolve();
  if (restores.has(identity)) return restores.get(identity);
  const request = storage(`league-pages:${identity}`).then(saved => {
    for (const [key, entry] of Array.isArray(saved?.entries) ? saved.entries : []) {
      try {
        if (JSON.parse(key)[0] !== identity || Date.now() - entry.savedAt >= 7 * 86400_000) continue;
        if (!pages.has(key) || pages.get(key).savedAt < entry.savedAt) pages.set(key, entry);
      } catch { /* Ignore malformed cache entries. */ }
    }
    while (pages.size > 32) pages.delete(pages.keys().next().value);
  }).catch(() => {});
  restores.set(identity, request);
  return request;
}
export function rememberLeaguePage(identity, leagueId, week, value, now = Date.now()) {
  const key = JSON.stringify([identity, leagueId, week]);
  pages.delete(key);
  pages.set(key, { value, savedAt: now });
  while (pages.size > 32) pages.delete(pages.keys().next().value);
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
  const key = JSON.stringify([identity, leagueId, week, refresh]);
  if (pending.has(key)) return pending.get(key);
  const cached = readLeaguePage(identity, leagueId, week);
  if (!refresh && cached && cached.projectionsReady !== false) return Promise.resolve(cached);
  const request = (async () => {
    const response = await fetch(`/api/league?id=${encodeURIComponent(leagueId)}&week=${week}${refresh ? '&refresh=1' : ''}`, { signal: AbortSignal.timeout(45_000) });
    if (!response.ok) throw new Error('League data is still syncing');
    const data = await response.json();
    if (data.league?.projectionWeek !== week) throw new Error('Waiting for the selected week');
    rememberLeaguePage(identity, leagueId, week, data);
    return data;
  })().finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}
