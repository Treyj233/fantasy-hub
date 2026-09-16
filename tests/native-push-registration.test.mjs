import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

async function runtime({ permission = 'granted', optOut = false, fail = false } = {}) {
  const source = await readFile(new URL('../app/native-runtime.ts', import.meta.url), 'utf8');
  const code = ts.transpileModule(source.replace(/^import .*;\n/gm, ''), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const storage = new Map(optOut ? [['fantasy-hub-push-opt-out', 'true']] : []);
  const calls = [];
  const listeners = new Map();
  const context = {
    exports: {}, setTimeout, clearTimeout, URL, console,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    registerPlugin: () => ({}),
    Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' },
    PushNotifications: {
      checkPermissions: async () => ({ receive: permission }),
      requestPermissions: async () => { calls.push('permission'); return { receive: 'granted' }; },
      addListener: async (name, callback) => { listeners.set(name, callback); return { remove: async () => listeners.delete(name) }; },
      register: async () => { calls.push('register'); listeners.get('registration')({ value: 'a'.repeat(64) }); },
      unregister: async () => calls.push('unregister'),
    },
    fetch: async (url, options) => { calls.push({ url, ...options }); return { ok: !fail, json: async () => ({ enabled: true }) }; },
  };
  vm.runInNewContext(code, context);
  return { api: context.exports, storage, calls, listeners };
}
test('default flow requests permission and registers this device', async () => {
  const r = await runtime({ permission: 'prompt' });
  await r.api.syncDefaultNativePushNotifications();
  assert.ok(r.calls.includes('permission'));
  assert.ok(r.calls.includes('register'));
  assert.equal(r.storage.get('fantasy-hub-push-token'), 'a'.repeat(64));
  assert.equal(r.listeners.size, 0);
});
test('default flow preserves explicit opt-out and OS denial', async () => {
  for (const options of [{ optOut: true }, { permission: 'denied' }]) {
    const r = await runtime(options);
    await r.api.syncDefaultNativePushNotifications();
    assert.equal(r.calls.length, 0);
  }
});
test('turning off targets only the current token and remembers the choice', async () => {
  const r = await runtime();
  r.storage.set('fantasy-hub-push-token', 'b'.repeat(64));
  await r.api.disableNativePushNotifications();
  const request = r.calls.find(call => call.method === 'DELETE');
  assert.equal(JSON.parse(request.body).token, 'b'.repeat(64));
  assert.equal(r.storage.get('fantasy-hub-push-opt-out'), 'true');
});
test('registration failures reject and clean up listeners', async () => {
  const r = await runtime({ fail: true });
  await assert.rejects(r.api.enableNativePushNotifications(), /Unable to save/);
  assert.equal(r.listeners.size, 0);
  assert.equal(r.storage.has('fantasy-hub-push-token'), false);
});
