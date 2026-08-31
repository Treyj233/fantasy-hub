import assert from "node:assert/strict";
import test from "node:test";

import { assumedSuspensionGames, depthChartRoleAdjustment, rosPerformanceAdjustment, rosUnavailableGames, seasonRankingValue, suspensionReplacementAdjustment } from "../app/season-ranking.ts";

test("season value does not accept weekly projection or injury inputs", () => {
  const first = seasonRankingValue({
    marketSources: [{ value: 8, weight: 1 }],
    sourceRank: 12,
    projectedSeasonPoints: 289,
    age: 25,
    position: "RB",
    priorSeasonGames: 17,
    unavailableGames: 0,
    lineupAdjustment: 4,
  });
  const sameSeasonInputs = seasonRankingValue({
    marketSources: [{ value: 8, weight: 1 }],
    sourceRank: 12,
    projectedSeasonPoints: 289,
    age: 25,
    position: "RB",
    priorSeasonGames: 17,
    unavailableGames: 0,
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
    projectedSeasonPoints: 272,
    age: 24,
    position: "RB",
    priorSeasonGames: 17,
    unavailableGames: 0,
    lineupAdjustment: 3,
  });
  const lowerMarket = seasonRankingValue({
    marketSources: [{ value: 55, weight: 1 }],
    sourceRank: 45,
    projectedSeasonPoints: 323,
    age: 24,
    position: "RB",
    priorSeasonGames: 17,
    unavailableGames: 0,
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
    projectedSeasonPoints: null,
    age: null,
    position: "WR",
    priorSeasonGames: null,
    unavailableGames: 0,
    lineupAdjustment: 0,
  });
  assert.equal(result.marketRank, 11.43);
});

test("an older running back's history cannot override younger elite ROS profiles", () => {
  const olderBack = seasonRankingValue({
    marketSources: [{ value: 4, weight: 1 }],
    sourceRank: 4,
    projectedSeasonPoints: 310,
    age: 30,
    position: "RB",
    priorSeasonGames: 10,
    unavailableGames: 0,
    lineupAdjustment: 3,
  });
  const youngerBack = seasonRankingValue({
    marketSources: [{ value: 6, weight: 1 }],
    sourceRank: 6,
    projectedSeasonPoints: 295,
    age: 24,
    position: "RB",
    priorSeasonGames: 17,
    unavailableGames: 0,
    lineupAdjustment: 3,
  });
  assert.ok(youngerBack.value > olderBack.value);
});

test("elite redraft running backs receive only a modest late-career age adjustment", () => {
  const valueAt24 = seasonRankingValue({
    marketSources: [{ value: 5, weight: 1 }], sourceRank: 5,
    projectedSeasonPoints: 300, age: 24, position: "RB",
    priorSeasonGames: 17, unavailableGames: 0, lineupAdjustment: 3,
  }).value;
  const valueAt30 = seasonRankingValue({
    marketSources: [{ value: 5, weight: 1 }], sourceRank: 5,
    projectedSeasonPoints: 300, age: 30, position: "RB",
    priorSeasonGames: 17, unavailableGames: 0, lineupAdjustment: 3,
  }).value;

  assert.ok(valueAt24 > valueAt30);
  assert.ok(valueAt24 - valueAt30 < 2, "age alone should not move an elite RB several ranking tiers");
});

test("DNR and SUS tags receive the same assumed suspension adjustment", () => {
  assert.equal(assumedSuspensionGames("DNR"), 8);
  assert.equal(assumedSuspensionGames("sus"), 8);
  assert.equal(assumedSuspensionGames("Questionable"), 0);

  const active = seasonRankingValue({
    marketSources: [{ value: 20, weight: 1 }],
    sourceRank: 20,
    projectedSeasonPoints: 255,
    age: 27,
    position: "RB",
    priorSeasonGames: 17,
    unavailableGames: 0,
    lineupAdjustment: 3,
  });
  const suspended = seasonRankingValue({
    marketSources: [{ value: 20, weight: 1 }],
    sourceRank: 20,
    projectedSeasonPoints: 255,
    age: 27,
    position: "RB",
    priorSeasonGames: 17,
    unavailableGames: assumedSuspensionGames("SUS"),
    lineupAdjustment: 3,
  });
  assert.equal(active.value - suspended.value, 42);
  assert.equal(suspended.availabilityPenalty, 36);
});

test("IR assumes four missed games unless the season is explicitly over", () => {
  assert.equal(rosUnavailableGames({ status: "IR", remainingGames: 17, outForSeason: false }), 4);
  assert.equal(rosUnavailableGames({ status: "IR", remainingGames: 3, outForSeason: false }), 3);
  assert.equal(rosUnavailableGames({ status: "IR", remainingGames: 11, outForSeason: true }), 11);
  assert.equal(rosUnavailableGames({ status: "Questionable", remainingGames: 11, outForSeason: false }), .15);
  assert.equal(rosUnavailableGames({ status: "Out", remainingGames: 11, outForSeason: false }), 1);
  assert.equal(rosUnavailableGames({ status: "Doubtful", remainingGames: 11, outForSeason: false }), .5);
});

test("ROS value responds to depth-chart movement without using the weekly matchup", () => {
  assert.equal(depthChartRoleAdjustment(1), 3);
  assert.equal(depthChartRoleAdjustment(2), 0);
  assert.equal(depthChartRoleAdjustment(3), -3);
  assert.equal(depthChartRoleAdjustment(5), -6);
  assert.equal(depthChartRoleAdjustment(null), 0);
});

test("current-season performance ramps from 25 percent to full weight", () => {
  const weekOne = rosPerformanceAdjustment({ currentPointsPerGame: 20, projectedPointsPerGame: 12, currentWeek: 1, games: 1 });
  const weekFive = rosPerformanceAdjustment({ currentPointsPerGame: 20, projectedPointsPerGame: 12, currentWeek: 5, games: 5 });
  assert.equal(weekOne, 1.6);
  assert.equal(weekFive, 6.4);
  assert.equal(rosPerformanceAdjustment({ currentPointsPerGame: 20, projectedPointsPerGame: 12, currentWeek: 5, games: 0 }), 0);
});

test("suspended starters boost likely replacements only while ADP is lagging", () => {
  const laggingMarket = suspensionReplacementAdjustment({ missedGames: 8, depthChartOrder: 2, replacementMarketRank: 120, suspendedMarketRank: 35 });
  const updatedMarket = suspensionReplacementAdjustment({ missedGames: 8, depthChartOrder: 2, replacementMarketRank: 45, suspendedMarketRank: 35 });
  const deepBackup = suspensionReplacementAdjustment({ missedGames: 8, depthChartOrder: 4, replacementMarketRank: 120, suspendedMarketRank: 35 });
  assert.equal(laggingMarket, 18);
  assert.equal(updatedMarket, 0);
  assert.ok(deepBackup < laggingMarket);
});
