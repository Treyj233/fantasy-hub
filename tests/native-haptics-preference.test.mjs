import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("native vibrations can be disabled per device and all impacts honor the preference", async () => {
  const [runtime, hub] = await Promise.all([
    readFile(new URL("../app/native-runtime.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(runtime, /fantasy-hub-vibrations-enabled/);
  assert.match(runtime, /!isNativeIosApp\(\) \|\| !nativeHapticsEnabled\(\)/);
  assert.match(runtime, /setNativeHapticsEnabled/);
  assert.match(hub, /role="switch" aria-checked=\{vibrationsEnabled\}/);
  assert.match(hub, /if \(next\) void nativeImpact\("medium"\)/);
});
