import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("signing out returns directly to the same-origin sign-in page", async () => {
  const source = await readFile(new URL("../app/sign-out/page.tsx", import.meta.url), "utf8");

  assert.match(source, /signOut\(\{ redirectUrl: "\/sign-in" \}\)/);
  assert.doesNotMatch(source, /redirectUrl: "\/"/);
  assert.doesNotMatch(source, /setTimeout/);
  assert.match(source, /Sign out did not finish/);
});
