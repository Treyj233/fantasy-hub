import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("native Apple auth exchanges its token for a real Clerk browser session", async () => {
  const [route, swift, page] = await Promise.all([
    readFile(new URL("../app/api/native-auth/exchange/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../ios/App/App/SceneDelegate.swift", import.meta.url), "utf8"),
    readFile(new URL("../app/native-sign-in/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(route, /verifyToken\(token/);
  assert.match(route, /signInTokens\.createSignInToken/);
  assert.match(swift, /api\/native-auth\/exchange/);
  assert.doesNotMatch(swift, /name: "__session"/);
  assert.match(page, /window\.location\.replace\(result\.redirect\)/);
});
