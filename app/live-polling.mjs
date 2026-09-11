// One non-overlapping refresh at a time; stop network work when hidden/unmounted.
export function startVisiblePolling(refresh, intervalMs = 30_000) {
  let stopped = false;
  let running = false;
  let controller;
  let timer;
  let resumeRequested = false;
  const run = async () => {
    if (stopped || running || document.visibilityState !== 'visible') return;
    clearTimeout(timer);
    running = true;
    controller = new AbortController();
    const started = Date.now();
    try { await refresh(controller.signal); }
    catch (error) { if (!controller.signal.aborted) console.warn('Live refresh failed', error); }
    finally {
      running = false;
      if (!stopped && document.visibilityState === 'visible') {
        timer = setTimeout(run, resumeRequested ? 0 : Math.max(0, intervalMs - (Date.now() - started)));
        resumeRequested = false;
      }
    }
  };
  const visibility = () => {
    clearTimeout(timer);
    if (document.visibilityState !== 'visible') controller?.abort();
    else { resumeRequested = running; void run(); }
  };
  document.addEventListener('visibilitychange', visibility);
  void run();
  return () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    controller?.abort();
    document.removeEventListener('visibilitychange', visibility);
  };
}

export async function fetchLiveJson(url, signal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 12_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Live request failed (${response.status})`);
    return await response.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

const portfolios = new Map();
// Only mounted subscribers retain data. No cross-session or persistent cache.
export function subscribeLiveScoreboards(leagueIds, week, listener, onRefreshStart) {
  const ids = [...new Set(leagueIds)].sort();
  const key = JSON.stringify([ids, week]);
  let entry = portfolios.get(key);
  if (!entry) {
    entry = { listeners: new Set(), latest: null, stop: null };
    portfolios.set(key, entry);
  }
  const subscriber = { listener, onRefreshStart };
  entry.listeners.add(subscriber);
  if (entry.latest) listener(entry.latest);
  if (!entry.stop) {
    entry.stop = startVisiblePolling(async signal => {
      // Optional parallel work (e.g. play feed) starts alongside scores, not after.
      const parallel = new Map([...entry.listeners].map(sub => [sub, sub.onRefreshStart?.(signal)]));
      const results = new Array(ids.length);
      let cursor = 0;
      await Promise.all(Array.from({ length: Math.min(3, ids.length) }, async () => {
        while (cursor < ids.length && !signal.aborted) {
          const index = cursor++;
          const id = ids[index];
          try {
            results[index] = [id, await fetchLiveJson(`/api/scoreboard?leagueId=${encodeURIComponent(id)}&week=${week}&scope=mine`, signal)];
          } catch { results[index] = [id, null]; }
        }
      }));
      if (signal.aborted) return;
      entry.latest = results;
      for (const sub of entry.listeners) sub.listener(results, parallel.get(sub));
    });
  }
  return () => {
    if (!entry.listeners.delete(subscriber)) return;
    if (!entry.listeners.size) {
      entry.stop?.();
      portfolios.delete(key);
    }
  };
}

// Compare meaningful scoreboard data, ignoring only the transport timestamp.
export function reconcileScoreboards(previous, results) {
  let changed = Object.keys(previous).length !== results.length;
  const next = {};
  for (const [id, incoming] of results) {
    const old = previous[id];
    // Keep a usable snapshot through a transient provider failure.
    const candidate = incoming ?? old ?? null;
    const fingerprint = value => {
      if (!value) return 'null';
      const { updatedAt, ...data } = value;
      return JSON.stringify(data);
    };
    next[id] = old !== undefined && fingerprint(old) === fingerprint(candidate) ? old : candidate;
    if (next[id] !== old) changed = true;
  }
  return changed ? next : previous;
}
