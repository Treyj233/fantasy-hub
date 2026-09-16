import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const bundled = await build({ entryPoints: ['app/native-screen-analytics.ts'], bundle: true, write: false, format: 'esm', plugins: [{ name: 'native-test-runtime', setup(builder) {
  builder.onResolve({ filter: /native-runtime$/ }, () => ({ path: 'runtime', namespace: 'test' }));
  builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `export const isNativeIosApp=()=>globalThis.__fhRuntime.native; export const nativeLogAppsFlyerEvent=(...args)=>globalThis.__fhRuntime.log(...args); export const nativeRequestReview=()=>globalThis.__fhRuntime.review();` }));
} }] });
const { trackNativeScreen } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
function setup(t) {
  const originals = { document: globalThis.document, window: globalThis.window, runtime: globalThis.__fhRuntime };
  const events = []; let reviews = 0;
  globalThis.document = Object.assign(new EventTarget(), { visibilityState: 'visible', documentElement: { dataset: {} }, querySelector: () => null });
  globalThis.window = new EventTarget();
  globalThis.__fhRuntime = { native: true, log: (...args) => events.push(args), review: () => reviews++ };
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'] });
  t.mock.method(performance, 'now', () => Date.now());
  t.after(() => { globalThis.document = originals.document; globalThis.window = originals.window; globalThis.__fhRuntime = originals.runtime; });
  return { events, reviews: () => reviews };
}
test('one view event per navigation; cleanup reports foreground duration', t => {
  const state = setup(t);
  const stop = trackNativeScreen('Player Rankings', 'weekly');
  t.mock.timers.tick(4000); stop();
  assert.equal(state.events.filter(([name]) => name === 'af_screen_view').length, 1);
  assert.equal(state.events[1][1].foreground_seconds, 4);
  assert.equal(state.events[0][1].section, 'weekly');
  t.mock.timers.tick(90000); assert.equal(state.reviews(), 0);
});
test('background time is excluded and review requests are canceled while hidden', t => {
  const state = setup(t); const stop = trackNativeScreen('My Team');
  t.mock.timers.tick(5000);
  document.visibilityState = 'hidden'; document.dispatchEvent(new Event('visibilitychange'));
  t.mock.timers.tick(120000); assert.equal(state.reviews(), 0);
  document.visibilityState = 'visible'; document.dispatchEvent(new Event('visibilitychange'));
  t.mock.timers.tick(2000); stop();
  assert.deepEqual(state.events.filter(([name]) => name === 'fh_screen_engagement').map(([, value]) => value.foreground_seconds), [5, 2]);
});
test('review waits for meaningful use and does not interrupt an open dialog', t => {
  const state = setup(t); const stop = trackNativeScreen('Team Review');
  t.mock.timers.tick(59999); assert.equal(state.reviews(), 0);
  document.querySelector = () => ({});
  t.mock.timers.tick(1); assert.equal(state.reviews(), 0); stop();
});
test('web sessions never send native analytics', t => {
  const state = setup(t); globalThis.__fhRuntime.native = false;
  trackNativeScreen('My Team')(); assert.equal(state.events.length, 0);
});
test('native review and purchase bridges enforce rate limits and verified deduplication', () => {
  const source = readFileSync('ios/App/App/SceneDelegate.swift', 'utf8');
  assert.match(source, /7 \* 86400/); assert.match(source, /120 \* 86400/);
  assert.match(source, /AppStore.requestReview\(in: scene\)/);
  assert.match(source, /case \.verified\(let transaction\)/);
  assert.match(source, /fh.analytics.purchase/);
  assert.match(source, /transaction\.price/); assert.match(source, /transaction\.currency/);
  assert.doesNotMatch(source, /values\["af_revenue"\]/);
});
test('every launch stage ships the same real FH logo and navy background', () => {
  const original = readFileSync('public/marketing/app-store/fh-blue-app-mark.png');
  assert.deepEqual(readFileSync('native-shell/fh-blue-app-mark.png'), original);
  assert.deepEqual(readFileSync('ios/App/App/Assets.xcassets/LaunchMark.imageset/fh-blue-app-mark.png'), original);
  assert.match(readFileSync('capacitor.config.ts', 'utf8'), /backgroundColor: "#001f47"/);
  assert.match(readFileSync('native-shell/index.html', 'utf8'), /nativeBuild=46/);
});
