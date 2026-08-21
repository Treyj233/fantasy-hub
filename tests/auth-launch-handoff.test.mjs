import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("an existing Clerk session skips the sign-in screen on launch", async () => {
  const loader = await readFile(new URL("../app/FantasyHubLoader.tsx", import.meta.url), "utf8");
  const signIn = await readFile(new URL("../app/sign-in/[[...sign-in]]/page.tsx", import.meta.url), "utf8");
  assert.match(loader, /const \{ isLoaded, isSignedIn \} = useAuth\(\)/);
  assert.match(loader, /const sessionRefreshRequested = useRef\(false\)/);
  assert.match(loader, /if \(accountUser \|\| !isLoaded \|\| !isSignedIn \|\| sessionRefreshRequested\.current\) return/);
  assert.match(loader, /sessionRefreshRequested\.current = true/);
  assert.match(loader, /router\.refresh\(\)/);
  assert.match(loader, /if \(!accountUser && \(!isLoaded \|\| isSignedIn\)\) return <InitialLoadingShell/);
  assert.match(signIn, /Promise\.all\(\[auth\(\), cookies\(\)\]\)/);
  assert.match(signIn, /nativeSignedOut/);
  assert.match(signIn, /forceNativeReset/);
  assert.match(signIn, /if \(userId && \(nativeSignedOut \|\| forceNativeReset\)\) return <NativeSessionReset \/>/);
  assert.match(signIn, /if \(userId\) redirect\(nativeIos \? "\/native-auth-return" : "\/"\)/);
  assert.match(signIn, /nativeIos \? <div className="native-auth-card-stack"><NativeAppleSignIn \/>\{emailSignIn\}<\/div> : emailSignIn/);
  assert.match(signIn, /appearance=\{nativeIos \? nativeEmailOnlyClerkAppearance : chargersClerkAppearance\}/);
  assert.match(signIn, /!nativeIos \? <a className="clerk-chatgpt-option"/);
});

test("native sign-in clears stale Clerk state without a server redirect", async () => {
  const nativeSignIn = await readFile(new URL("../app/native-sign-in/page.tsx", import.meta.url), "utf8");
  assert.match(nativeSignIn, /useAuth/);
  assert.match(nativeSignIn, /void signOut\(\)/);
  assert.match(nativeSignIn, /path="\/native-sign-in"/);
  assert.match(nativeSignIn, /<NativeAppleSignIn \/>/);
});
