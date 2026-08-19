export function safeLocalStorageSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    const isLargeCache =
      key.startsWith("fantasy-hub-league-bootstrap:") ||
      key.startsWith("fantasy-hub-portfolio-scans:");
    if (isLargeCache) return false;
    // Identity, active-league, and preference keys are tiny and essential.
    // If the quota is full, discard reconstructable payload caches and retry.
    try {
      for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
        const storedKey = window.localStorage.key(index);
        if (
          storedKey?.startsWith("fantasy-hub-league-bootstrap:") ||
          storedKey?.startsWith("fantasy-hub-portfolio-scans:")
        )
          window.localStorage.removeItem(storedKey);
      }
      window.localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }
}

export function cacheActiveLeagueBootstrap(leagueId: string, value: string) {
  const activeKey = `fantasy-hub-league-bootstrap:${leagueId}`;
  // League payloads include rankings and waiver data and can be several MB.
  // Keep only the active league on-device; server snapshots make other league
  // switches fast without exhausting WKWebView's localStorage quota.
  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith("fantasy-hub-league-bootstrap:") && key !== activeKey)
        window.localStorage.removeItem(key);
    }
  } catch {
    // Storage cleanup is an optimization and must never block live data.
  }
  if (safeLocalStorageSet(activeKey, value)) return;
  try {
    window.localStorage.removeItem(activeKey);
  } catch {
    // A fresh API response remains usable even when caching is unavailable.
  }
}

export function readSessionCache<T>(key: string): T | null {
  try {
    return JSON.parse(window.sessionStorage.getItem(key) ?? "null") as T | null;
  } catch {
    try { window.sessionStorage.removeItem(key); } catch { /* Ignore unavailable storage. */ }
    return null;
  }
}

export function writeSessionCache(key: string, value: unknown) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Matchup caching is optional; live data must continue rendering.
  }
}
