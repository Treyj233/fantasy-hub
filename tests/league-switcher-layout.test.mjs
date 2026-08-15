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
  assert.match(css, /\.league-drawer\{position:absolute;z-index:1;top:0;right:0;bottom:0;[^}]*env\(safe-area-inset-top\)/);
});
