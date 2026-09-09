import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Mission Hub personalization is presented as a primary conversion action", async () => {
  const [source, styles] = await Promise.all([
    readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(source, /Customize Your Hub/);
  assert.doesNotMatch(source, /<em aria-hidden="true">→<\/em>/);
  assert.match(source, /Team colors, themes &amp; icons/);
  assert.match(source, /aria-label="Personalize your Fantasy Hub/);
  assert.match(styles, /@keyframes personalize-hub-pulse/);
  assert.match(styles, /font-family:var\(--font-geist-sans\),Arial,sans-serif/);
  assert.match(styles, /@media\(prefers-reduced-motion:reduce\).*personalize-hub/s);
  assert.match(styles, /@media\(max-width:700px\).*\.personalize-hub\{[^}]*width:100%/s);
});
