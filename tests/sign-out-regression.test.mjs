import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("signing out clears native and browser sessions with branded feedback", async () => {
  const source = await readFile(new URL("../app/sign-out/page.tsx", import.meta.url), "utf8");

  assert.match(source, /signOut\(\{ redirectUrl: "\/sign-in" \}\)/);
  assert.match(source, /fetch\("\/api\/native-auth\/session", \{ method: "DELETE" \}\)/);
  assert.match(source, /nativeAppleSignOut/);
  assert.match(source, /window\.location\.replace\("\/native-sign-in"\)/);
  assert.match(source, /chargers-entry-shell/);
  assert.doesNotMatch(source, /redirectUrl: "\/"/);
  assert.doesNotMatch(source, /setTimeout/);
  assert.match(source, /Sign out did not finish/);
});
