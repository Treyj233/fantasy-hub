import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("native iOS and installed mobile app are portrait-only", async () => {
  const plist = await readFile(new URL("../ios/App/App/Info.plist", import.meta.url), "utf8");
  const manifest = await readFile(new URL("../app/manifest.ts", import.meta.url), "utf8");
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  assert.match(plist, /UISupportedInterfaceOrientations[\s\S]*UIInterfaceOrientationPortrait/);
  assert.doesNotMatch(plist, /UIInterfaceOrientationLandscapeLeft|UIInterfaceOrientationLandscapeRight|UIInterfaceOrientationPortraitUpsideDown/);
  assert.match(manifest, /orientation: "portrait"/);
  assert.match(source, /orientation\.lock\("portrait"\)/);
});
