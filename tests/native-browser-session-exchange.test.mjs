import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("native Apple auth exchanges its token for a durable signed Fantasy Hub session", async () => {
  const [route, installRoute, session, auth, swift, signInPage] = await Promise.all([
    readFile(new URL("../app/api/native-auth/exchange/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/native-auth/install/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/native-session.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/chatgpt-auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../ios/App/App/SceneDelegate.swift", import.meta.url), "utf8"),
    readFile(new URL("../app/sign-in/[[...sign-in]]/native-apple-sign-in.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(route, /verifyToken\(token/);
  assert.match(route, /createNativeSession/);
  assert.match(installRoute, /verifyNativeSession/);
  assert.match(installRoute, /verifiedEmail !== expectedEmail/);
  assert.match(installRoute, /status: 303/);
  assert.match(installRoute, /fh_native_selected_session=\$\{session\}/);
  assert.match(session, /crypto\.subtle\.sign\("HMAC"/);
  assert.match(session, /iat: Math\.floor\(Date\.now\(\) \/ 1000\)/);
  assert.match(session, /v: identity \? 3 : 1/);
  assert.match(session, /crypto\.subtle\.verify/);
  assert.match(auth, /getAll\("fh_native_session"\)/);
  assert.match(auth, /getAll\("fh_native_selected_session"\)/);
  assert.match(auth, /nativeSessions\.sort/);
  assert.match(auth, /const nativeSession[\s\S]*const signedOutValue[\s\S]*nativeSessionPredatesSignOut[\s\S]*if \(nativeSession\?\.email && nativeSession\.displayName\)/);
  assert.match(swift, /api\/native-auth\/exchange/);
  assert.doesNotMatch(swift, /name: "__session"/);
  assert.match(swift, /name: "fh_native_session"/);
  assert.match(signInPage, /window\.location\.replace\("\/native-app\?handoff=1"\)/);
  assert.match(signInPage, /Create account with Apple/);
  assert.match(signInPage, /Start securely with Apple without leaving the app/);
});
