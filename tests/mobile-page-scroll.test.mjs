import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("mobile pages own vertical scrolling while overlays retain internal scrolling", async () => {
  const globalStyles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const rankingStyles = await readFile(new URL("../app/player-ranks.css", import.meta.url), "utf8");

  assert.match(globalStyles, /On mobile, the page owns vertical scrolling/);
  assert.match(globalStyles, /\.insight-scroll-window,[\s\S]*?\.manager-activity-scroll,[\s\S]*?\.all-leagues-page \.action-queue-groups>section\{[\s\S]*?max-height:none!important;[\s\S]*?overflow-y:visible!important;/);
  assert.match(rankingStyles, /\.weekly-rank-list\s*\{\s*max-height: none;\s*overflow-y: visible;/s);

  assert.match(globalStyles, /\.team-assets-drawer\{[^}]*overflow-y:auto/);
  assert.match(globalStyles, /\.player-panel\{[^}]*overflow-y:auto/);
  assert.match(globalStyles, /\.mobile-category-menu>div\{[^}]*overflow-y:auto/);
});
