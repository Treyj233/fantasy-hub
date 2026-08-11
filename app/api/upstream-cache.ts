type CloudflareRequestInit = RequestInit & {
  cf?: {
    cacheEverything?: boolean;
    cacheKey?: string;
    cacheTtl?: number;
    cacheTtlByStatus?: Record<string, number>;
  };
};

/**
 * Share public provider responses at the edge so every signed-in user does not
 * create a fresh provider request for the same league, week, or player pool.
 */
export function fetchCachedUpstream(
  url: string,
  ttlSeconds: number,
  init: RequestInit = {},
) {
  const options: CloudflareRequestInit = {
    ...init,
    cf: {
      cacheEverything: true,
      cacheKey: url,
      cacheTtl: ttlSeconds,
      cacheTtlByStatus: {
        "200-299": ttlSeconds,
        "404": Math.min(30, ttlSeconds),
        "500-599": 0,
      },
    },
  };
  return fetch(url, options);
}
