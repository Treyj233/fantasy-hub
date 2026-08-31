import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("season-long Hub rankings use the requested ADP weights and six tiers", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const compositeStart = source.indexOf("function buildSeasonCompositeRankings(");
  const start = source.indexOf("function PlayerRanks(");
  const end = source.indexOf("function AdpPage(", start);
  const composite = source.slice(compositeStart, start);
  const playerRanks = source.slice(start, end);

  assert.ok(compositeStart >= 0 && start > compositeStart);
  assert.match(composite, /value: player\.adpBySite\?\.\[underdogAdpKey\], weight: 0\.6/);
  assert.match(composite, /value: player\.adpBySite\?\.\[sleeperAdpKey\], weight: 0\.3/);
  assert.match(composite, /value: player\.adpBySite\?\.ESPN, weight: 0\.1/);
  assert.match(composite, /source\.value \* source\.weight/);
  assert.match(composite, /const availabilityRankPenalty = redraftMarketHorizon[\s\S]*?player\.rosAvailabilityPenalty \?\? 0/);
  assert.match(composite, /scoringAdjustment \+[\s\S]*?availabilityRankPenalty/);
  assert.match(playerRanks, /buildSeasonCompositeRankings\(leagueRankings, context\)/);
  assert.match(playerRanks, /const tiers = \[1, 2, 3, 4, 5, 6\] as const/);
  assert.doesNotMatch(playerRanks, /60% UNDERDOG/);
  assert.doesNotMatch(playerRanks, /30% SLEEPER/);
  assert.doesNotMatch(playerRanks, /10% ESPN/);
  assert.doesNotMatch(playerRanks, /className="ranking-method panel"/);
  assert.doesNotMatch(playerRanks, /<span>UNDERDOG<\/span>/);
  assert.doesNotMatch(playerRanks, /<span>SLEEPER<\/span>/);
  assert.doesNotMatch(playerRanks, /<span>ESPN<\/span>/);
  assert.doesNotMatch(playerRanks, /<span>6 HUB TIERS<\/span>/);
  assert.match(playerRanks, /Composite ADP/);
});

test("Trade Lab shares the season composite and applies dynasty cliffs plus league scarcity", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const compositeStart = source.indexOf("function buildSeasonCompositeRankings(");
  const tradeStart = source.indexOf("type FantasyTradeProfile");
  const tradeEnd = source.indexOf("function TradeAsset(", tradeStart);
  const composite = source.slice(compositeStart, tradeStart);
  const trade = source.slice(tradeStart, tradeEnd);

  assert.match(trade, /const tradeRankings = buildSeasonCompositeRankings\(rankings, context\)/);
  assert.match(trade, /buildTradeSuggestions\([\s\S]*?tradeRankings,[\s\S]*?context/);
  assert.match(trade, /buildRankingLookup\(tradeRankings\)/);
  assert.match(trade, /function dynastyAgeCurve/);
  assert.match(trade, /position === "RB"[\s\S]*?age === 26\) return -4;[\s\S]*?return -10 - \(age - 27\) \* 6/);
  assert.match(trade, /position === "WR"[\s\S]*?age === 29\) return -4;[\s\S]*?return -9 - \(age - 30\) \* 4\.5/);
  assert.match(composite, /context\?\.format === "Dynasty"[\s\S]*?player\.adpBySite\?\.\[sleeperAdpKey\], weight: 1/);
  assert.match(trade, /games < 4 \? 0\.34 : games < 8 \? 0\.26 : 0\.18/);
  assert.match(trade, /marketAdjustedTalent \* 0\.4 \+ futureOverall \* 0\.56 \+ availabilityGrade \* 0\.04/);
  assert.match(trade, /function tradePositionAdjustment/);
  assert.match(trade, /player\.position === "QB" && demand >= 1\.4/);
  assert.match(trade, /context\?\.tePremium \?\? 0/);
  assert.match(trade, /tradeAsset\(player, rankingById, context\)/);
});
