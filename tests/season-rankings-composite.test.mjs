import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("season-long Hub rankings use the requested ADP weights and six tiers", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const start = source.indexOf("function PlayerRanks(");
  const end = source.indexOf("function AdpPage(", start);
  const playerRanks = source.slice(start, end);

  assert.match(playerRanks, /value: player\.adpBySite\?\.\[underdogAdpKey\], weight: 0\.6/);
  assert.match(playerRanks, /value: player\.adpBySite\?\.\[sleeperAdpKey\], weight: 0\.3/);
  assert.match(playerRanks, /value: player\.adpBySite\?\.ESPN, weight: 0\.1/);
  assert.match(playerRanks, /source\.value \* source\.weight/);
  assert.match(playerRanks, /const tiers = \[1, 2, 3, 4, 5, 6\] as const/);
  assert.match(playerRanks, /60% UNDERDOG/);
  assert.match(playerRanks, /30% SLEEPER/);
  assert.match(playerRanks, /10% ESPN/);
  assert.match(playerRanks, /Composite ADP/);
});
