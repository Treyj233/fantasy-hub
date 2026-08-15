import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("My Leagues uses a compact two-row draggable layout", async () => {
  const ui = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.league-pills\{display:grid;grid-template-rows:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /\.league-pills button b,.league-pills button small\{[^}]*text-overflow:ellipsis;white-space:nowrap/);
  assert.match(css, /-webkit-touch-callout:none/);
  assert.match(css, /\.league-drag-preview/);
  assert.match(ui, /setDragImage\(dragPreview/);
  assert.match(ui, /reorderConnectedLeague\(draggedLeagueId, targetLeagueId, position\)/);
});

test("mobile league switching moves into an accessible right-edge drawer", async () => {
  const ui = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(ui, /className="context-league-button"[\s\S]*?aria-expanded=\{leagueDrawerOpen\}/);
  assert.match(ui, /clientX < window\.innerWidth - 24[\s\S]*?horizontalTravel > 48[\s\S]*?setLeagueDrawerOpen\(true\)/);
  assert.match(ui, /leagueDrawerOpen && createPortal\([\s\S]*?className="league-drawer"[\s\S]*?visibleLeagues\.map[\s\S]*?openConnectedLeague\(league\)[\s\S]*?document\.body/);
  assert.match(css, /@media\(max-width:700px\)\{\s*\.league-switcher\{display:none\}/);
  assert.match(ui, /className="league-edge-handle"[\s\S]*?aria-label="Swipe or tap to switch leagues"/);
  assert.match(css, /\.league-edge-handle\{position:fixed;z-index:63;right:0;top:48%;[^}]*var\(--green\)[^}]*var\(--gold\)/);
  assert.match(css, /\.league-drawer\{position:absolute;z-index:1;top:max\(54px,calc\(env\(safe-area-inset-top\) \+ 10px\)\);right:0;bottom:max\(20px,calc\(env\(safe-area-inset-bottom\) \+ 8px\)\)/);
  assert.match(css, /html\[data-native-platform="ios"\] \.league-drawer\{top:max\(64px,calc\(env\(safe-area-inset-top\) \+ 18px\)\)\}/);
});

test("live matchup shortcut lives in the persistent active-team card", async () => {
  const ui = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.doesNotMatch(ui, /className=\{`league-drawer-live/);
  assert.match(ui, /className=\{`team-active-live[\s\S]*?setScoreboardScope\("all"\)[\s\S]*?setView\("Scoreboard"\)/);
  assert.match(css, /\.team-active-live\{display:grid;[^}]*flex:0 0 auto/);
  assert.match(css, /\.team-picker-strip>div\{padding-right:92px\}[\s\S]*?\.team-picker-strip \.team-active-live\{position:absolute;top:11px;right:11px;width:auto;[^}]*padding:6px 7px/);
});
