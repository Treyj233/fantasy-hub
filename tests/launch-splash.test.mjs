import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("launch and account restoration use the animated FH logo splash", async () => {
  const splash = await readFile(new URL("../app/LaunchSplash.tsx", import.meta.url), "utf8");
  const loader = await readFile(new URL("../app/FantasyHubLoader.tsx", import.meta.url), "utf8");
  const hub = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(splash, /fh-blue-app-mark\.png/);
  assert.match(splash, /Preparing your hub/);
  assert.match(loader, /function InitialLoadingShell\(\) \{\s*return <LaunchSplash/);
  assert.match(hub, /function AccountLoading\(\) \{\s*return <LaunchSplash/);
  assert.doesNotMatch(loader, /Opening your Command Center/);
  assert.doesNotMatch(hub, /Loading your leagues/);
  assert.match(css, /@keyframes launch-logo-orbit/);
  assert.match(css, /linear-gradient\(155deg,#092f70,#001f47 64%,#00152f\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\).*launch-splash/);
});
