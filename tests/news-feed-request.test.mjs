import test from 'node:test';
import assert from 'node:assert/strict';
import { createNewsFeedRequest } from '../app/news-feed-request.mjs';

test('news refresh accepts valid results including an empty feed', async () => {
  const request = createNewsFeedRequest(async () => ({ ok: true, json: async () => ({ items: [] }) }));
  assert.deepEqual(await request.load(), { status: 'success', items: [] });
});
test('failed and malformed responses cannot be presented as updated', async () => {
  for (const response of [{ ok: false, json: async () => ({ items: [] }) }, { ok: true, json: async () => ({}) }]) {
    assert.deepEqual(await createNewsFeedRequest(async () => response).load(), { status: 'error' });
  }
});
test('a newer news refresh supersedes stale responses even when transport ignores abort', async () => {
  const resolvers = [];
  const request = createNewsFeedRequest(() => new Promise(resolve => resolvers.push(resolve)));
  const old = request.load();
  const current = request.load();
  resolvers[1]({ ok: true, json: async () => ({ items: [{ id: 'new' }] }) });
  assert.equal((await current).items[0].id, 'new');
  resolvers[0]({ ok: true, json: async () => ({ items: [{ id: 'old' }] }) });
  assert.deepEqual(await old, { status: 'cancelled' });
});
test('hidden/unmounted feed cancels requests without a user-facing error', async () => {
  const request = createNewsFeedRequest((_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  }));
  const pending = request.load();
  request.cancel();
  assert.deepEqual(await pending, { status: 'cancelled' });
});
test('polling cancellation is propagated to the network', async () => {
  const controller = new AbortController();
  let networkSignal;
  const request = createNewsFeedRequest((_url, { signal }) => new Promise((_resolve, reject) => {
    networkSignal = signal;
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  }));
  const pending = request.load(controller.signal);
  controller.abort();
  assert.equal(networkSignal.aborted, true);
  assert.deepEqual(await pending, { status: 'cancelled' });
});
