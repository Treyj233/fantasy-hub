import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("a new Clerk identity reconnects to existing Fantasy Hub account data by verified email", async () => {
  const source = await readFile(new URL("../app/chatgpt-auth.ts", import.meta.url), "utf8");

  assert.match(source, /lower\(\$\{subscriptions\.email\}\) = \$\{normalizedEmail\}/);
  assert.match(source, /connection\?\.userId \?\? preferenceRows\[0\]\?\.userId \?\? subscriptionRows\[0\]\?\.userId \?\? emailIdentityRows\[0\]\?\.canonicalUserId \?\? existingIdentity\?\.canonicalUserId/);
  assert.match(source, /db\.update\(accountIdentities\)\.set\(\{ canonicalUserId, verifiedEmail: normalizedEmail/);
});
