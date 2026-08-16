import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const load = async (path) => readFile(new URL(path, import.meta.url), "utf8");

test("navigation is consolidated into five user-centered destinations", async () => {
  const source = await load("../app/FantasyHub.tsx");
  assert.match(source, /\["Home", "Game Day", "Manage Team", "Analyze League", "Utilities"\]/);
});

test("Mission Hub prioritizes five decisions and progressively discloses depth", async () => {
  const source = await load("../app/FantasyHub.tsx");
  assert.match(source, /prioritizedInbox\.slice\(0, 3\)/);
  assert.match(source, /<details className="mission-deep-dive">/);
});

test("tools share one compact league and freshness context", async () => {
  const source = await load("../app/FantasyHub.tsx");
  assert.match(source, /className=\{`tool-context-bar/);
  assert.match(source, /leagueRefreshedAt/);
});

test("modal dialogs receive shared focus and escape behavior with an iPad-safe scroll-lock exemption", async () => {
  const source = await load("../app/use-overlay-guard.ts");
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /event\.key !== "Escape"/);
  assert.match(source, /hasAttribute\("data-preserve-page-scroll"\)/);
  assert.match(source, /document\.body\.style\.overflow = dialog && !preservePageScroll \? "hidden"/);
  assert.match(source, /document\.documentElement\.style\.overflow = dialog && !preservePageScroll \? "hidden"/);
  assert.match(source, /document\.documentElement\.style\.overflow = previousHtmlOverflow/);
});

test("native navigation and league switching use restrained haptics", async () => {
  const source = await load("../app/FantasyHub.tsx");
  assert.match(source, /nativeImpact/);
});

test("product monitoring reports slow refreshes and recoverable failures", async () => {
  const source = await load("../app/use-product-monitoring.ts");
  assert.match(source, /league_refresh_slow/);
  assert.match(source, /recoverable_data_error/);
});
