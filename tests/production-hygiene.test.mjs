import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("submission-only App Store screenshots are excluded from public runtime assets", () => {
  assert.equal(existsSync(new URL("../public/marketing/app-store/original-masters", import.meta.url)), false);
  assert.equal(existsSync(new URL("../public/marketing/app-store/generated-masters", import.meta.url)), false);
  assert.equal(existsSync(new URL("../public/marketing/app-store/iphone-6.5", import.meta.url)), false);
  assert.equal(existsSync(new URL("../marketing-assets/app-store/iphone-6.5", import.meta.url)), true);
});

test("overflow animation does not scan every element in the application", () => {
  assert.doesNotMatch(source, /querySelectorAll<HTMLElement>\("\.app-shell \*"\)/);
});

test("league switching preserves the current usable roster during refresh", () => {
  const importStart = source.indexOf("async function importLeague");
  const requestStart = source.indexOf("const response = await fetch", importStart);
  const setup = source.slice(importStart, requestStart);
  assert.doesNotMatch(setup, /setPlayers\(\[\]\)/);
  assert.match(setup, /setImportState\("loading"\)/);
});

test("global readability floors remain overridable by component styles", () => {
  assert.doesNotMatch(
    styles,
    /\.page-content :is\(span,small,em,label,th\)\{[^}]*!important/,
  );
});

test("shared overlays enforce safe-area and overscroll behavior", () => {
  assert.match(styles, /Shared overlay contract/);
  assert.match(styles, /env\(safe-area-inset-top\)/);
  assert.match(styles, /overscroll-behavior:none/);
});
