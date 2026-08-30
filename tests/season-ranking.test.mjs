import assert from "node:assert/strict";
import test from "node:test";

import { seasonRankingValue } from "../app/season-ranking.ts";

test("season value does not accept weekly projection or injury inputs", () => {
  const first = seasonRankingValue({
    marketSources: [{ value: 8, weight: 1 }],
    sourceRank: 12,
    historicalPointsPerGame: 17,
    lineupAdjustment: 4,
  });
  const sameSeasonInputs = seasonRankingValue({
    marketSources: [{ value: 8, weight: 1 }],
    sourceRank: 12,
    historicalPointsPerGame: 17,
    lineupAdjustment: 4,
  });
  assert.deepEqual(first, sameSeasonInputs);
  assert.equal("weeklyProjection" in first, false);
  assert.equal("injuryAdjustment" in first, false);
});

test("elite market value stays above a lower-market player regardless of weekly context", () => {
  const elite = seasonRankingValue({
    marketSources: [{ value: 6, weight: 1 }],
    sourceRank: 10,
    historicalPointsPerGame: 16,
    lineupAdjustment: 3,
  });
  const lowerMarket = seasonRankingValue({
    marketSources: [{ value: 55, weight: 1 }],
    sourceRank: 45,
    historicalPointsPerGame: 19,
    lineupAdjustment: 3,
  });
  assert.ok(elite.value > lowerMarket.value);
});

test("available market sources are normalized by their actual weights", () => {
  const result = seasonRankingValue({
    marketSources: [
      { value: 10, weight: .6 },
      { value: null, weight: .3 },
      { value: 20, weight: .1 },
    ],
    sourceRank: 100,
    historicalPointsPerGame: null,
    lineupAdjustment: 0,
  });
  assert.equal(result.marketRank, 11.43);
});
