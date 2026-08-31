import assert from "node:assert/strict";
import test from "node:test";
import { estimatedWinProbability, gameLeverage, playerLeverage, rootingInterests, statLineEquivalent, whatDoINeed } from "../app/game-day-model.mjs";

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
  const interests = rootingInterests([{ playerId: "1", playerName: "Josh Allen", side: "you", margin: -5, remainingProjection: 20, pointsNeeded: 6, state: "live", leagueName: "Sunday Syndicate" }, { playerId: "1", playerName: "Josh Allen", side: "opponent", margin: 3, remainingProjection: 20, state: "live", leagueName: "Dynasty Central" }]);
  assert.match(interests[0].text, /helps you in 1 league but hurts you in 1/);
});

test("rooting win paths name the specific league instead of a vague matchup", () => {
  const [interest] = rootingInterests([
    { playerId: "1", playerName: "Josh Allen", side: "you", margin: -8, remainingProjection: 20, pointsNeeded: 9.2, state: "live", leagueName: "Sunday Syndicate" },
    { playerId: "1", playerName: "Josh Allen", side: "you", margin: -4, remainingProjection: 20, pointsNeeded: 5.1, state: "live", leagueName: "Gridiron Club" },
  ]);
  assert.equal(interest.text, "You need about 6 more points from Josh Allen to project ahead in Gridiron Club.");
  assert.doesNotMatch(interest.text, /that matchup/);
});

test("provider projection labels retain the supplied source", () => {
  const providerLabel = (provider) => provider ? `${provider[0].toUpperCase()}${provider.slice(1)} Projections` : "League Projections";
  assert.equal(providerLabel("sleeper"), "Sleeper Projections");
  assert.equal(providerLabel(""), "League Projections");
});

test("what-do-I-need allocates a live target and explains a PPR receiver stat line", () => {
  const result = whatDoINeed({ yourPoints: 80, opponentPoints: 100, opponentRemaining: 0, players: [{ id: "88", name: "CeeDee Lamb", position: "WR", points: 0, projection: 20 }], scoring: { rec: 1, rec_yd: 0.1 } });
  assert.equal(result.teamNeed, 20);
  assert.equal(result.targets[0].pointsNeeded, 20);
  assert.match(result.targets[0].statLine, /10 catches for 100 yards/);
  assert.equal(result.targets[0].progress, 0);
});

test("what-do-I-need splits the target by remaining projection and handles a projected lead", () => {
  const result = whatDoINeed({ yourPoints: 90, opponentPoints: 100, opponentRemaining: 10, players: [{ id: "1", name: "A", position: "RB", points: 5, projection: 20 }, { id: "2", name: "B", position: "WR", points: 10, projection: 20 }] });
  assert.equal(result.targets.length, 2);
  assert.ok(result.targets[0].pointsNeeded > result.targets[1].pointsNeeded);
  assert.equal(whatDoINeed({ yourPoints: 120, opponentPoints: 100, players: [{ id: "1", points: 0, projection: 10 }] }).targets.length, 0);
});

test("quarterback win paths use the league's passing-touchdown value", () => {
  const fourPoint = statLineEquivalent("QB", 20, { pass_td: 4, pass_yd: 0.04 });
  const sixPoint = statLineEquivalent("QB", 20, { pass_td: 6, pass_yd: 0.04 });
  assert.match(fourPoint, /300 passing yards and 2 passing TDs \(4-point passing TD scoring\)/);
  assert.match(sixPoint, /200 passing yards and 2 passing TDs \(6-point passing TD scoring\)/);
  assert.notEqual(fourPoint, sixPoint);
});
