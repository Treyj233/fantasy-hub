import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("native Apple authentication returns from the web flow to the iOS app", async () => {
  const hub = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const signIn = await readFile(new URL("../app/sign-in/[[...sign-in]]/page.tsx", import.meta.url), "utf8");
  const signUp = await readFile(new URL("../app/sign-up/[[...sign-up]]/page.tsx", import.meta.url), "utf8");
  const callback = await readFile(new URL("../app/native-auth-return/page.tsx", import.meta.url), "utf8");
  const callbackClient = await readFile(new URL("../app/native-auth-return/return-client.tsx", import.meta.url), "utf8");
  const runtime = await readFile(new URL("../app/native-runtime.ts", import.meta.url), "utf8");
  assert.match(hub, /const nativeIos = isNativeIosApp\(\)/);
  assert.match(hub, /const signInHref = nativeIos \? "\/sign-in\?native=ios" : "\/sign-in"/);
  assert.match(signIn, /forceRedirectUrl=\{nativeIos \? "\/native-auth-return" : "\/"\}/);
  assert.match(signUp, /forceRedirectUrl=\{nativeIos \? "\/native-auth-return" : "\/"\}/);
  assert.match(signUp, /<NativeAppleSignIn mode="sign-up" \/>/);
  assert.match(signUp, /nativeEmailOnlyClerkAppearance/);
  assert.match(callback, /fantasyhub:\/\/auth\/complete\?ticket=/);
  assert.match(callbackClient, /window\.location\.replace\(appUrl\)/);
  assert.match(callbackClient, /fetch\("\/api\/native-auth\/session", \{ method: "POST" \}\)/);
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
