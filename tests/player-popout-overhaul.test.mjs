import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("player popout presents a dense decision-first intelligence dashboard", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const start = source.indexOf("function PlayerPanel(");
  const end = source.indexOf("function Metric(", start);
  const panel = source.slice(start, end);

  assert.match(panel, /className="player-command-hero"/);
  assert.match(panel, /FANTASY HUB VERDICT/);
  assert.match(panel, /className="player-range-track"/);
  assert.match(panel, /className="player-decision-rail"/);
  assert.match(panel, /className="player-matchup-intel"/);
  assert.match(panel, /<MatchupBadge player=\{player\} \/>/);
  assert.match(panel, /aria-label="Close player details"/);
  assert.match(styles, /\.player-dossier\{width:min\(920px,100%\)/);
  assert.match(styles, /\.player-decision-rail\{display:grid;grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(styles, /@media\(max-width:700px\)[\s\S]*?\.player-command-hero\{grid-template-columns:minmax\(0,1fr\) 104px/);
});
