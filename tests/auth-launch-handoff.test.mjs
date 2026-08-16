import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("an existing Clerk session skips the sign-in screen on launch", async () => {
  const loader = await readFile(new URL("../app/FantasyHubLoader.tsx", import.meta.url), "utf8");
  const signIn = await readFile(new URL("../app/sign-in/[[...sign-in]]/page.tsx", import.meta.url), "utf8");
  assert.match(loader, /const \{ isLoaded, isSignedIn \} = useAuth\(\)/);
  assert.match(loader, /if \(accountUser \|\| !isLoaded \|\| !isSignedIn \|\| sessionRefreshRequested\) return/);
  assert.match(loader, /router\.refresh\(\)/);
  assert.match(loader, /if \(!accountUser && \(!isLoaded \|\| isSignedIn\)\) return <InitialLoadingShell/);
  assert.match(signIn, /const \{ userId \} = await auth\(\)/);
  assert.match(signIn, /if \(userId\) redirect\("\/"\)/);
});
