import { activateScheduledScoreboard, kickoffState } from './kickoff-status.mjs';
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
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
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
    entry = { listeners: new Set(), latest: null, stop: null, kickoffTimer: null };
    portfolios.set(key, entry);
  }
  const subscriber = { listener, onRefreshStart };
  entry.listeners.add(subscriber);
  if (entry.latest) listener(entry.latest);
  if (!entry.stop) {
    const publish = (parallel, complete = false) => {
      entry.latest = entry.latest.map(([id, data]) => [id, activateScheduledScoreboard(data)]);
      for (const sub of entry.listeners) sub.listener(entry.latest, parallel?.get(sub), complete);
      clearTimeout(entry.kickoffTimer);
      const next = entry.latest.flatMap(([, data]) => data?.kickoffGames ?? [])
        .filter(game => kickoffState(game) === 'pre' && !/postpon|cancel|suspend|delay/i.test(game.status ?? ''))
        .map(game => Date.parse(game.date)).filter(time => time > Date.now());
      if (next.length) entry.kickoffTimer = setTimeout(() => publish(), Math.min(2_147_483_647, Math.max(0, Math.min(...next) - Date.now())));
    };
    entry.stop = startVisiblePolling(async signal => {
      // Optional parallel work (e.g. play feed) starts alongside scores, not after.
      const parallel = new Map([...entry.listeners].map(sub => [sub, sub.onRefreshStart?.(signal)]));
      const previous = new Map(entry.latest ?? []);
      const results = ids.map(id => [id, previous.get(id) ?? null]);
      let cursor = 0;
      let finished = 0;
      await Promise.all(Array.from({ length: Math.min(3, ids.length) }, async () => {
        while (cursor < ids.length && !signal.aborted) {
          const index = cursor++;
          const id = ids[index];
          try {
            results[index] = [id, await fetchLiveJson(`/api/scoreboard?leagueId=${encodeURIComponent(id)}&week=${week}&scope=mine`, signal)];
          } catch { results[index] = [id, previous.get(id) ?? null]; }
          if (signal.aborted) return;
          finished++;
          entry.latest = results.slice();
          publish(parallel, finished === ids.length);
        }
      }));
      if (signal.aborted) return;
    });
  }
  return () => {
    if (!entry.listeners.delete(subscriber)) return;
    if (!entry.listeners.size) {
      entry.stop?.();
      clearTimeout(entry.kickoffTimer);
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
