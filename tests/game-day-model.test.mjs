import assert from "node:assert/strict";
import test from "node:test";
import { estimatedWinProbability, gameLeverage, playerLeverage, rootingInterests } from "../app/game-day-model.mjs";

test("player and game leverage rise with close multi-league exposure", () => {
  const exposures = [{ side: "you", margin: 2, remainingProjection: 18, state: "live" }, { side: "you", margin: -7, remainingProjection: 18, state: "pre" }];
  assert.equal(playerLeverage(exposures).level, "High");
  assert.ok(gameLeverage([{ exposures }]).score > 0);
});

test("conflicting exposure is identified and discounted", () => {
  const mixed = playerLeverage([{ side: "you", margin: 1, remainingProjection: 15, state: "live" }, { side: "opponent", margin: 1, remainingProjection: 15, state: "live" }]);
  const aligned = playerLeverage([{ side: "you", margin: 1, remainingProjection: 15, state: "live" }, { side: "you", margin: 1, remainingProjection: 15, state: "live" }]);
  assert.match(mixed.explanation, /mixed exposure/);
  assert.ok(mixed.score < aligned.score);
});

test("win probability handles pregame, live, final, and missing projections", () => {
  assert.equal(estimatedWinProbability({ yourPoints: 0, opponentPoints: 0, yourRemaining: 110, opponentRemaining: 100, status: "pre" }), 55);
  assert.ok(estimatedWinProbability({ yourPoints: 80, opponentPoints: 70, yourRemaining: 30, opponentRemaining: 10, status: "live" }) > 50);
  assert.equal(estimatedWinProbability({ yourPoints: 101, opponentPoints: 99, status: "final" }), 100);
  assert.equal(estimatedWinProbability({ yourPoints: 0, opponentPoints: 0, projectionsAvailable: false }), null);
});

test("rooting interests explain conflicting ownership and points needed", () => {
  const interests = rootingInterests([{ playerId: "1", playerName: "Josh Allen", side: "you", margin: -5, remainingProjection: 20, pointsNeeded: 6, state: "live" }, { playerId: "1", playerName: "Josh Allen", side: "opponent", margin: 3, remainingProjection: 20, state: "live" }]);
  assert.match(interests[0].text, /helps you in 1 league but hurts you in 1/);
});

test("provider projection labels retain the supplied source", () => {
  const providerLabel = (provider) => provider ? `${provider[0].toUpperCase()}${provider.slice(1)} Projections` : "League Projections";
  assert.equal(providerLabel("sleeper"), "Sleeper Projections");
  assert.equal(providerLabel(""), "League Projections");
});
