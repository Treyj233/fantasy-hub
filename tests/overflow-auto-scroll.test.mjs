import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("clipped single-line dashboard text auto-scrolls without affecting fitting text", async () => {
  const source = await readFile(new URL("../app/use-overflow-auto-scroll.ts", import.meta.url), "utf8");
  const fallback = await readFile(new URL("../public/auto-scroll-overflow.js", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /element\.scrollWidth - element\.clientWidth/);
  assert.match(source, /overflow > 3/);
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(source, /MutationObserver/);
  assert.match(source, /ResizeObserver/);
  assert.match(styles, /prefers-reduced-motion:reduce/);
  assert.match(styles, /\.fh-marquee-track/);
  assert.match(fallback, /track\.append\(first, second\)/);
  assert.match(fallback, /second\.setAttribute\("aria-hidden", "true"\)/);
  assert.match(fallback, /const loopDistance = state\.first\.getBoundingClientRect\(\)\.width/);
  assert.match(fallback, /const firstCycleDuration = 5000 \+ scrollDuration/);
  assert.match(fallback, /const pauseDuration = age < firstCycleDuration \? 5000 : 20000/);
  assert.match(fallback, /elapsed < pauseDuration \? 0/);
  assert.match(fallback, /translate3d/);
  assert.doesNotMatch(fallback, /element\.scrollLeft = position/);
});

test("existing marquees measure the original name, not the moving track overflow", async () => {
  const fallback = await readFile(new URL("../public/auto-scroll-overflow.js", import.meta.url), "utf8");
  assert.match(fallback, /const textWidth = state \? state\.first\.getBoundingClientRect\(\)\.width : element\.scrollWidth/);
  assert.match(fallback, /const overflow = textWidth - element\.clientWidth/);
  assert.match(fallback, /\[data-no-auto-scroll\], \.fh-marquee-track/);
});
