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
  assert.match(styles, /\.team-rank-table\{width:100%;overflow-x:hidden!important/);
  assert.match(styles, /\.team-rank-row,.team-rank-row\.dynasty\{position:relative;display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.match(styles, /\.team-position-room \.team-assets-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(styles, /min-width:0!important/);
});
