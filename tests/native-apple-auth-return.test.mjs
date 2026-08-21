import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("native Apple authentication returns from the web flow to the iOS app", async () => {
  const hub = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const signIn = await readFile(new URL("../app/sign-in/[[...sign-in]]/page.tsx", import.meta.url), "utf8");
  const signUp = await readFile(new URL("../app/sign-up/[[...sign-up]]/page.tsx", import.meta.url), "utf8");
  const callback = await readFile(new URL("../app/native-auth-return/page.tsx", import.meta.url), "utf8");
  const callbackClient = await readFile(new URL("../app/native-auth-return/return-client.tsx", import.meta.url), "utf8");
  const authIntent = await readFile(new URL("../app/native-auth-intent.tsx", import.meta.url), "utf8");
  const nativeEmailSignIn = await readFile(new URL("../app/native-email-sign-in.tsx", import.meta.url), "utf8");
  const runtime = await readFile(new URL("../app/native-runtime.ts", import.meta.url), "utf8");
  assert.match(hub, /const nativeIos = isNativeIosApp\(\)/);
  assert.match(hub, /const signInHref = nativeIos \? "\/native-sign-in" : "\/sign-in"/);
  assert.match(signIn, /forceRedirectUrl=\{nativeIos \? "\/native-auth-return" : "\/"\}/);
  assert.match(signUp, /forceRedirectUrl=\{nativeIos \? "\/native-auth-return" : "\/"\}/);
  assert.match(signUp, /<NativeAppleSignIn mode="sign-up" \/>/);
  assert.match(signUp, /nativeEmailOnlyClerkAppearance/);
  assert.match(callback, /<NativeAuthReturnClient \/>/);
  assert.match(callbackClient, /window\.location\.replace\("\/native-app\?handoff=1"\)/);
  assert.match(callbackClient, /useClerk/);
  assert.match(callbackClient, /client\.signIn\.createdSessionId \?\? client\.signUp\.createdSessionId/);
  assert.match(callbackClient, /window\.localStorage\.getItem\(NATIVE_AUTH_EMAIL_KEY\) \?\? clerkIdentifier/);
  assert.match(callbackClient, /sessions\.find\(\(session\) => session\.id === createdSessionId\)/);
  assert.match(callbackClient, /sessions\.length === 1 \? sessions\[0\] : undefined/);
  assert.match(callbackClient, /session\.user\?\.primaryEmailAddress\?\.emailAddress/);
  assert.match(callbackClient, /const matchingSession = enteredEmail/);
  assert.match(callbackClient, /setActive\(\{ session: matchingSession\.id \}\)/);
  assert.match(callbackClient, /matchingSession\.getToken\(\{ skipCache: true \}\)/);
  assert.match(callbackClient, /"Authorization": `Bearer \$\{sessionToken\}`/);
  assert.match(callbackClient, /window\.localStorage\.removeItem\("fantasy-hub-native-user"\)/);
  assert.match(callbackClient, /window\.localStorage\.removeItem\("fantasy-hub-active-league"\)/);
  assert.doesNotMatch(authIntent, /useSignIn/);
  assert.doesNotMatch(authIntent, /signIn\.identifier/);
  assert.match(authIntent, /document\.addEventListener\("input", rememberTypedEmail, true\)/);
  assert.match(nativeEmailSignIn, /window\.localStorage\.setItem\(NATIVE_AUTH_EMAIL_KEY, normalized\)/);
  assert.match(nativeEmailSignIn, /initialValues=\{\{ emailAddress: confirmedEmail \}\}/);
  assert.match(callbackClient, /body: JSON\.stringify\(\{ expectedEmail \}\)/);
  assert.match(callbackClient, /setError\(cause instanceof Error \? cause\.message/);
  assert.match(runtime, /url\.hostname === "auth" && url\.pathname === "\/complete"/);
  assert.match(runtime, /`\/native-auth-ticket\?ticket=\$\{encodeURIComponent\(ticket\)\}`/);
});

test("native email authentication keeps the production Clerk handoff inside the app", async () => {
  const sourceConfig = await readFile(new URL("../capacitor.config.ts", import.meta.url), "utf8");
  const iosConfig = await readFile(new URL("../ios/App/App/capacitor.config.json", import.meta.url), "utf8");
  const xcodeProject = await readFile(new URL("../ios/App/App.xcodeproj/project.pbxproj", import.meta.url), "utf8");

  for (const config of [sourceConfig, iosConfig]) {
    assert.match(config, /clerk\.fantasyhubapp\.com/);
    assert.doesNotMatch(config, /clerk\.fantasyhub\.com/);
  }
  assert.match(xcodeProject, /CLERK_FRONTEND_API_DOMAIN = clerk\.fantasyhubapp\.com/);
});
