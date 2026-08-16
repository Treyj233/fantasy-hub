import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("native Apple auth exchanges its token for a durable signed Fantasy Hub session", async () => {
  const [route, session, auth, swift, signInPage] = await Promise.all([
    readFile(new URL("../app/api/native-auth/exchange/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/native-session.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/chatgpt-auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../ios/App/App/SceneDelegate.swift", import.meta.url), "utf8"),
    readFile(new URL("../app/native-sign-in/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(route, /verifyToken\(token/);
  assert.match(route, /createNativeSession/);
  assert.match(session, /crypto\.subtle\.sign\("HMAC"/);
  assert.match(session, /crypto\.subtle\.verify/);
  assert.match(auth, /cookies\(\).*fh_native_session/s);
  assert.match(swift, /api\/native-auth\/exchange/);
  assert.doesNotMatch(swift, /name: "__session"/);
  assert.match(swift, /name: "fh_native_session"/);
  assert.match(signInPage, /window\.location\.replace\(result\.redirect\)/);
});
