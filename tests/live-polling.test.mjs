import test from 'node:test';
import assert from 'node:assert/strict';
import { startVisiblePolling, subscribeLiveScoreboards, reconcileScoreboards, fetchLiveJson } from '../app/live-polling.mjs';

const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
function setup(t) {
  const original = globalThis.document;
  const document = new EventTarget();
  document.visibilityState = 'visible';
  globalThis.document = document;
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  t.after(() => { globalThis.document = original; });
  return state => { document.visibilityState = state; document.dispatchEvent(new Event('visibilitychange')); };
}

test('polling starts immediately, retains 30s cadence, and never overlaps', async t => {
  setup(t);
  let calls = 0;
  let finish;
  const stop = startVisiblePolling(() => { calls++; return new Promise(resolve => { finish = resolve; }); });
  t.after(stop);
  assert.equal(calls, 1);
  t.mock.timers.tick(60_000);
  assert.equal(calls, 1);
  finish(); await flush();
  t.mock.timers.tick(1);
  assert.equal(calls, 2);
  stop(); finish(); await flush();
  t.mock.timers.tick(60_000);
  assert.equal(calls, 2);
});

test('hidden and disposed pollers abort; returning to foreground refreshes', async t => {
  const visibility = setup(t);
  let calls = 0;
  let signal;
  const stop = startVisiblePolling(async next => { calls++; signal = next; });
  t.after(stop); await flush();
  visibility('hidden');
  assert.equal(signal.aborted, true);
  t.mock.timers.tick(60_000); await flush();
  assert.equal(calls, 1);
  visibility('visible'); await flush();
  assert.equal(calls, 2);
  stop(); assert.equal(signal.aborted, true);
});

test('two portfolio consumers share every league request and one refresh timer', async t => {
  setup(t);
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => { requests++; return { ok: true, json: async () => ({ matchups: [] }) }; });
  let header;
  let scoreboard;
  const stopHeader = subscribeLiveScoreboards(['a', 'b'], 1, rows => { header = rows; });
  const stopScoreboard = subscribeLiveScoreboards(['b', 'a'], 1, rows => { scoreboard = rows; });
  t.after(stopHeader); t.after(stopScoreboard);
  await flush();
  assert.equal(requests, 2);
  assert.equal(header, scoreboard);
  t.mock.timers.tick(30_000); await flush();
  assert.equal(requests, 4);
  stopScoreboard();
  t.mock.timers.tick(30_000); await flush();
  assert.equal(requests, 6);
  stopHeader();
  t.mock.timers.tick(30_000); await flush();
  assert.equal(requests, 6);
});

test('changing weeks creates independent data; last unsubscribe aborts requests', async t => {
  setup(t);
  const signals = [];
  t.mock.method(globalThis, 'fetch', (url, options) => {
    signals.push(options.signal);
    return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
  });
  const stopOne = subscribeLiveScoreboards(['a'], 1, () => assert.fail('aborted response delivered'));
  const stopTwo = subscribeLiveScoreboards(['a'], 2, () => assert.fail('aborted response delivered'));
  assert.equal(signals.length, 2);
  stopOne(); assert.equal(signals[0].aborted, true); assert.equal(signals[1].aborted, false);
  stopTwo(); await flush();
  assert.equal(signals[1].aborted, true);
});

test('live fetch has a bounded timeout', async t => {
  setup(t);
  t.mock.method(globalThis, 'fetch', (url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  }));
  const result = assert.rejects(fetchLiveJson('/test'), { name: 'AbortError' });
  t.mock.timers.tick(12_000);
  await result;
});

test('foreground return during an aborted refresh retries without waiting another interval', async t => {
  const visibility = setup(t);
  let finish;
  let calls = 0;
  const stop = startVisiblePolling(() => { calls++; return new Promise(resolve => { finish = resolve; }); });
  visibility('hidden'); visibility('visible');
  assert.equal(calls, 1);
  finish(); await flush(); t.mock.timers.tick(1);
  assert.equal(calls, 2);
  stop(); finish(); await flush();
});

test('parallel feed work starts before scoreboard requests complete', async t => {
  setup(t);
  let started = false;
  let received;
  t.mock.method(globalThis, 'fetch', async () => {
    assert.equal(started, true);
    return { ok: true, json: async () => ({ matchups: [] }) };
  });
  const feed = Promise.resolve(['play']);
  const stop = subscribeLiveScoreboards(['parallel'], 1, (rows, pending) => { received = pending; }, () => { started = true; return feed; });
  await flush();
  assert.equal(received, feed);
  stop();
});

test('unchanged scores retain identity but score, status, clock and roster changes update', () => {
  const data = { updatedAt: 'old', matchups: [{ status: 'Live', clock: '12:00', points: 5, players: ['a'] }] };
  const previous = { a: data, b: { matchups: [] } };
  assert.equal(reconcileScoreboards(previous, [['a', { ...data, updatedAt: 'new' }], ['b', previous.b]]), previous);
  for (const change of [{ points: 6 }, { status: 'Final' }, { clock: '11:59' }, { players: ['b'] }]) {
    const next = reconcileScoreboards(previous, [['a', { matchups: [{ ...data.matchups[0], ...change }] }], ['b', previous.b]]);
    assert.notEqual(next, previous);
    assert.equal(next.b, previous.b);
  }
  assert.equal(reconcileScoreboards(previous, [['a', null], ['b', previous.b]]), previous);
  assert.deepEqual(Object.keys(reconcileScoreboards(previous, [['a', data]])), ['a']);
});
