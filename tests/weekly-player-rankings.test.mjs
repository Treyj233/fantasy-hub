import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("weekly player rankings are Pro-gated, week-aware, and position limited", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/player-ranks.css", import.meta.url), "utf8");
  const start = source.indexOf("function PlayerRanks(");
  const end = source.indexOf("function AdpPage(", start);
  const rankings = source.slice(start, end);

  assert.match(rankings, /useState<"season" \| "weekly">\("season"\)/);
  assert.match(rankings, /PRO · WEEK \{Math\.max\(1, week\)\}/);
  assert.match(rankings, /Weekly Player Rankings are a Pro experience/);
  assert.match(rankings, /\{ position: "QB", limit: 24/);
  assert.match(rankings, /\{ position: "RB", limit: 24/);
  assert.match(rankings, /\{ position: "WR", limit: 36/);
  assert.match(rankings, /\{ position: "TE", limit: 24/);
  assert.match(rankings, /projectionScore \* \.45 \+ ceilingScore \* \.25 \+ matchupScore \* \.2 \+ weatherScore \* \.1/);
  assert.match(rankings, /const matchupScore = player\.matchupStrength\?\.score \?\? 50/);
  assert.match(rankings, /<div className="weekly-matchup"><MatchupBadge player=\{player\} \/><\/div>/);
  assert.match(source, /weatherAdjustment: Math\.max\(-\.22, windPenalty \+ rainPenalty \+ coldPenalty\)/);
  assert.match(styles, /\.weekly-matchup > \.matchup-team/);
  assert.match(styles, /\.weekly-position-grid\s*\{[^}]*grid-template-columns: 1fr 1fr/s);
  assert.match(styles, /@media \(max-width: 980px\)[\s\S]*?\.weekly-position-grid \{ grid-template-columns: 1fr; \}/);
});
