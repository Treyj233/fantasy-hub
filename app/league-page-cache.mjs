// Session-only, account/week scoped preloading. Large full league payloads never
// fan out into localStorage (which is particularly constrained in WKWebView).
const pages = new Map();
export function rememberLeaguePage(identity, leagueId, week, value, now = Date.now()) {
  const key = JSON.stringify([identity, leagueId, week]);
  pages.delete(key);
  pages.set(key, { value, savedAt: now });
  while (pages.size > 4) pages.delete(pages.keys().next().value);
}
export function readLeaguePage(identity, leagueId, week, now = Date.now()) {
  const key = JSON.stringify([identity, leagueId, week]);
  const entry = pages.get(key);
  if (!entry || now - entry.savedAt >= 15 * 60_000) { pages.delete(key); return null; }
  return entry.value;
}
