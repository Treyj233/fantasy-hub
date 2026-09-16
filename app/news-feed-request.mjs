// One request per feed: newer refreshes supersede older responses.
export function createNewsFeedRequest(fetcher = fetch) {
  let active;
  return {
    cancel() { active?.abort(); active = undefined; },
    async load(signal) {
      active?.abort();
      const controller = new AbortController();
      active = controller;
      const abort = () => controller.abort();
      if (signal?.aborted) abort();
      else signal?.addEventListener('abort', abort, { once: true });
      const timeout = setTimeout(abort, 15_000);
      try {
        const response = await fetcher(`/api/news-notes?refresh=${Date.now()}`, {
          cache: 'no-store', headers: { accept: 'application/json' }, signal: controller.signal,
        });
        const payload = await response.json();
        if (controller.signal.aborted) return { status: 'cancelled' };
        if (!response.ok) throw new Error('News feed unavailable');
        if (!Array.isArray(payload.items)) throw new Error('Invalid news response');
        return { status: 'success', items: payload.items };
      } catch {
        if (signal?.aborted || active !== controller) return { status: 'cancelled' };
        return { status: 'error' };
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', abort);
      }
    },
  };
}
