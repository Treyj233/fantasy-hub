import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Team Rankings groups assets by position and removes mobile horizontal scrolling", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const start = source.indexOf("function TeamRankings(");
  const end = source.indexOf("function PlayerRanks(", start);
  const rankings = source.slice(start, end);
  assert.match(rankings, /team-position-rooms/);
  assert.match(rankings, /\[\.\.\.positions, "OTHER"\]/);
  assert.match(rankings, /team-position-room/);
  assert.match(rankings, /data-position=\{position\}/);
  assert.match(rankings, /role="dialog" aria-modal="true"/);
  assert.match(rankings, /className="team-assets-close"/);
  assert.match(rankings, /createPortal\(drawer, document\.body\)/);
  assert.match(rankings, /className="team-assets-modal-layer"/);
  assert.match(rankings, /className="team-assets-mobile-open"/);
  assert.doesNotMatch(rankings, /team-rank-head/);
  assert.doesNotMatch(rankings, /% OF LEAGUE/);
  assert.match(rankings, /\.slice\(0, 4\)/);
  assert.match(rankings, /rank-elite/);
  assert.match(rankings, /rank-trailing/);
  assert.match(rankings, /aria-controls=\{`team-assets-\$\{team\.id\}`\}/);
  assert.match(styles, /\.team-rank-table\{width:100%;overflow-x:hidden!important/);
  assert.match(styles, /\.team-rank-row,.team-rank-row\.dynasty\{position:relative;display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.match(styles, /\.team-position-room \.team-assets-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(styles, /min-width:0!important/);
  assert.match(styles, /\.team-rank-row \.team-rank-toggle\{min-height:44px/);
  assert.match(styles, /\.team-assets-modal-layer\{position:fixed;z-index:2147483599;inset:0;display:block;background:var\(--chalk\)/);
  assert.match(styles, /\.team-assets-drawer\{position:absolute;z-index:1;inset:max\(54px,calc\(env\(safe-area-inset-top\) \+ 10px\)\)/);
  assert.match(styles, /\.team-assets-mobile-open\{display:block;grid-column:1\/-1/);
  assert.match(styles, /font-family:Impact,"Arial Black",ui-rounded,sans-serif/);
  assert.match(styles, /\.room-rank\.rank-elite b/);
  assert.match(styles, /\.room-rank\.rank-trailing b/);
  assert.match(styles, /\.team-rank-row \.room-rank\{[^}]*background:rgb\(var\(--brand-primary-rgb,11 134 80\) \/ \.14\)/);
  assert.match(styles, /\.team-rank-row \.core-assets button\{background:rgb\(var\(--brand-primary-rgb,11 134 80\) \/ \.14\)/);
  assert.doesNotMatch(rankings, /<i>\{expanded \? "−" : "\+"\}<\/i>/);
});

test("standard player popouts stay inside the iPhone safe viewport", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /className="player-modal-layer"/);
  assert.match(source, /className="modal-backdrop player-modal-backdrop"/);
  assert.match(styles, /\.player-modal-layer\{position:fixed;z-index:2147483599;inset:0;background:var\(--chalk\)/);
  assert.match(styles, /\.modal-backdrop\.player-modal-backdrop\{position:absolute;z-index:1;inset:max\(54px,calc\(env\(safe-area-inset-top\) \+ 10px\)\)/);
});

test("League Analytics typography stays scoped and collision-safe", async () => {
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(styles, /\.dynasty-page :is\(\.dynasty-hero h2,\.panel-header h3,\.window-score strong,\.dynasty-metrics \.metric strong\)/);
  assert.match(styles, /\.dynasty-page \.panel-header h3\{[^}]*text-overflow:ellipsis;white-space:nowrap/);
  assert.match(styles, /\.dynasty-page \.panel-header h3\{font-style:normal\}/);
  assert.match(styles, /\.dynasty-page :is\(\.allocation-grid article>span,[^}]*white-space:nowrap/);
});

test("Season Simulator is compact and does not expose its random seed", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const start = source.indexOf("function Simulator(");
  const simulator = source.slice(start);
  assert.doesNotMatch(simulator, /Seed \{result\.seed\.toLocaleString\(\)\}/);
  assert.match(styles, /\.simulator-live\{gap:10px\}/);
  assert.match(styles, /\.simulator-live \.win-distribution>div:last-child\{height:170px/);
  assert.match(styles, /@media\(max-width:700px\)\{\.simulator-live\{gap:8px\}/);
});
