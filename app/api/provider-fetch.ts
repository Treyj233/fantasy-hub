import { blockProvider, takeProviderToken } from '../refresh-coordinator';
import { REFRESH } from '../refresh-policy.mjs';

const pending = new Map<string, Promise<Response>>();
const recent = new Map<string, { body: string; until: number }>();
export async function providerFetch(input: string | URL | Request, init: RequestInit & { cf?: { cacheTtl?: number } } = {}): Promise<Response> {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  const sleeper = ['api.sleeper.app', 'api.sleeper.com'].includes(url.hostname);
  const espn = url.hostname === 'lm-api-reads.fantasy.espn.com';
  if (!sleeper && !espn) return fetch(input, init);
  if (new Headers(init.headers).has('cookie') || new Headers(init.headers).has('authorization')) return fetch(input, init);
  // Both aliases use the same public data. Never cache authenticated requests.
  if (sleeper && url.pathname.startsWith('/v1/')) url.hostname = 'api.sleeper.app';
  const directory = sleeper && /^\/v1\/players\/nfl$/.test(url.pathname);
  if (directory) url.searchParams.delete('active');
  const requestedTtl = directory ? 86400 : init.cf?.cacheTtl ?? (typeof init.next?.revalidate === 'number' ? init.next.revalidate : undefined) ??
    (/\/matchups\//.test(url.pathname) ? 30 : /\/rosters$/.test(url.pathname) ? 300 : /\/league\/\d+(\/users|\/traded_picks)?$/.test(url.pathname) ? 21600 : 60);
  const ttl = Math.min(requestedTtl, /\/matchups\//.test(url.pathname) ? 30 : /\/rosters$/.test(url.pathname) ? 300 : Infinity);
  const key = url.href, now = Date.now();
  const saved = recent.get(key);
  if (saved && saved.until > now && init.cache !== 'reload') return new Response(saved.body, { headers: { 'content-type': 'application/json' } });
  const existing = pending.get(key);
  if (existing) return (await existing).clone();
  const request = (async () => {
    const cache = (globalThis.caches as CacheStorage & { default?: Cache } | undefined)?.default;
    const cacheRequest = new Request(url.href);
    if (cache && init.cache !== 'reload') {
      const cached = await cache.match(cacheRequest).catch(() => undefined);
      if (cached) return cached;
    }
    if (!await takeProviderToken(sleeper ? 'sleeper' : 'espn', sleeper ? REFRESH.sleeperPerMinute : 30)) {
      return new Response('Provider refresh budget busy', { status: 429, headers: { 'retry-after': '60' } });
    }
    // The wrapper owns cache policy. Cloudflare rejects Next's no-store together
    // with a positive cf.cacheTtl, and does not support browser reload mode.
    const { cache: _cache, next: _next, ...upstreamInit } = init;
    const response = await fetch(url.href, { ...upstreamInit, signal: init.signal ?? AbortSignal.timeout(15_000),
      cf: { cacheEverything: true, cacheTtl: init.cache === 'reload' ? 0 : ttl, cacheTtlByStatus: { '200-299': init.cache === 'reload' ? 0 : ttl, '400-599': 0 } },
    } as RequestInit);
    if (response.status === 429) {
      const seconds = Number(response.headers.get('retry-after'));
      await blockProvider(sleeper ? 'sleeper' : 'espn', Math.min(3600, Math.max(60, Number.isFinite(seconds) ? seconds : 60)) * 1000);
    }
    if (response.ok) {
      if (cache && ttl > 0) {
        const cached = new Response(response.clone().body, { headers: {
          'content-type': 'application/json', 'cache-control': `public, max-age=${ttl}`,
        } });
        await cache.put(cacheRequest, cached).catch(() => {});
      }
      const body = await response.clone().text();
      // The large directory stays in the edge cache, not a per-isolate map.
      if (body.length < 500_000) {
        recent.set(key, { body, until: now + ttl * 1000 });
        while (recent.size > 64) recent.delete(recent.keys().next().value!);
      }
    }
    return response;
  })();
  pending.set(key, request);
  try { return (await request).clone(); } finally { pending.delete(key); }
}
