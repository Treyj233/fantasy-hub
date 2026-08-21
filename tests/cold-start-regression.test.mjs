import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("native cold launch paints locally before opening the uncached app entry", async () => {
  const [config, shell, nativePage, nextConfig] = await Promise.all([
    readFile(new URL("../capacitor.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../native-shell/index.html", import.meta.url), "utf8"),
    readFile(new URL("../app/native-app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(config, /url:\s*"https:\/\/fantasyhubapp\.com"/);
  assert.match(shell, /requestAnimationFrame/);
  assert.match(shell, /fantasyhubapp\.com\/native-app/);
  assert.match(shell, /nativeBuild=\d+/);
  assert.match(nextConfig, /source: "\/native-app"/);
  assert.match(nextConfig, /private, no-store, no-cache, must-revalidate, max-age=0/);
  assert.doesNotMatch(shell, /<img[^>]+https:\/\//);
  assert.match(nativePage, /force-dynamic/);
  assert.doesNotMatch(nativePage, /force-static/);
  assert.match(nativePage, /clientBootstrap/);
});

test("native sessions carry verified identity claims to avoid launch-time Clerk lookup", async () => {
  const [session, exchange, auth] = await Promise.all([
    readFile(new URL("../app/native-session.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/native-auth/exchange/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/chatgpt-auth.ts", import.meta.url), "utf8"),
  ]);
  assert.match(session, /email\?: string/);
  assert.match(exchange, /verification\?\.status !== "verified"/);
  assert.match(auth, /nativeSession\?\.email && nativeSession\.displayName/);
  assert.match(auth, /existingIdentity\?\.verifiedEmail === normalizedEmail/);
});

test("sign out removes cached private bootstrap data", async () => {
  const source = await readFile(new URL("../app/sign-out/page.tsx", import.meta.url), "utf8");
  assert.match(source, /fantasy-hub-account-bootstrap:/);
  assert.match(source, /fantasy-hub-league-bootstrap:/);
  assert.match(source, /fantasy-hub-native-user/);
});

test("native bootstrap cannot remain indefinitely on the launch splash", async () => {
  const loader = await readFile(new URL("../app/FantasyHubLoader.tsx", import.meta.url), "utf8");
  assert.match(loader, /window\.setTimeout\(\(\) => controller\.abort\(\), 8000\)/);
  assert.match(loader, /if \(response\.status === 401\)/);
  assert.match(loader, /api\/native-auth\/session\?native=ios/);
  assert.match(loader, /window\.location\.replace\("\/native-sign-in"\)/);
  assert.match(loader, /clearNativeBootstrapCache\(\)/);
  assert.match(loader, /window\.localStorage\.removeItem\("fantasy-hub-native-user"\)/);
});

test("cached native shells from every year-cached release retain their entry bundles", async () => {
  const loaders = [
    "FantasyHubLoader-tM1Wf_5h.js",
    "FantasyHubLoader-PW4_0gVA.js",
    "FantasyHubLoader-C9FKp2WB.js",
    "FantasyHubLoader-LdtWeYYP.js",
    "FantasyHubLoader-BsXV-fWr.js",
  ];
  await Promise.all(loaders.map((loader) =>
    access(new URL(`../public/assets/${loader}`, import.meta.url)),
  ));
});
