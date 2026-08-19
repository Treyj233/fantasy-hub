import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("signing out clears native and browser sessions with branded feedback", async () => {
  const source = await readFile(new URL("../app/sign-out/page.tsx", import.meta.url), "utf8");

  assert.match(source, /signOut\(\{ redirectUrl: "\/sign-in" \}\)/);
  assert.match(source, /nativeIos \? "\?native=ios" : ""/);
  assert.match(source, /method: "DELETE"/);
  assert.match(source, /nativeAppleSignOut/);
  assert.match(
    source,
    /if \(nativeIos\) \{[\s\S]*?await signOut\(\);[\s\S]*?await nativeAppleSignOut\(\);/,
  );
  assert.match(source, /window\.location\.replace\("\/native-sign-in"\)/);
  assert.match(source, /chargers-entry-shell/);
  assert.doesNotMatch(source, /redirectUrl: "\/"/);
  assert.doesNotMatch(source, /setTimeout/);
  assert.match(source, /Sign out did not finish/);
});

test("native sign-out survives a force-close even when a WebView session cookie is stale", async () => {
  const [route, auth, runtime] = await Promise.all([
    readFile(new URL("../app/api/native-auth/session/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/chatgpt-auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/native-runtime.ts", import.meta.url), "utf8"),
  ]);

  assert.match(route, /fh_native_signed_out=1/);
  assert.match(route, /Max-Age=31536000/);
  assert.match(auth, /fh_native_signed_out/);
  assert.match(auth, /return null/);
  assert.match(runtime, /fetch\("\/api\/native-auth\/session", \{ method: "POST" \}\)/);
  assert.match(route, /fh_native_signed_out=;/);
});
