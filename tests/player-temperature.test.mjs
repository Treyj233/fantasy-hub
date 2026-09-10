import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Exercise the shared UI calculation directly without booting the React app.
const source = readFileSync(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
const body = source.match(/function playerTemperature\(player: ScoreboardPlayer, matchupStatus: string\) \{([\s\S]*?)\n\}\n/)[1];
const temperature = new Function("player", "matchupStatus", body);
const player = { points: 26, projection: 15, yards: 120, touchdowns: 1, receptions: 8, targets: 10, gameProgress: 1 };

test("finished players retain fire whether the fantasy matchup is live or final", () => {
  assert.equal(temperature(player, "Live").state, "fire");
  assert.deepEqual(temperature(player, "Final"), temperature(player, "Live"));
});

test("final matchups use full game progress even when progress is missing", () => {
  assert.deepEqual(temperature({ ...player, gameProgress: undefined }, "Final"), temperature(player, "Final"));
});

test("completed low-scoring players keep their cold rating", () => {
  assert.equal(temperature({ ...player, points: 5, touchdowns: 0, receptions: 1 }, "Final").state, "cold");
  assert.equal(temperature({ ...player, points: 0, yards: 0, touchdowns: 0, receptions: 0, targets: 0 }, "Final").state, "ice");
});

test("pregame and early live statuses remain unchanged", () => {
  assert.equal(temperature({ ...player, gameProgress: 0 }, "Scheduled").label, "Waiting for kickoff");
  assert.equal(temperature({ ...player, gameProgress: .1 }, "Live").label, "Early involvement");
});

test("finished players without a projection do not show a pregame status", () => {
  assert.equal(temperature({ ...player, projection: null }, "Final").label, "Final");
});

test("every finished heat level shows Final without changing its visual state", () => {
  for (const [points, state] of [[26, "fire"], [19, "hot"], [15, "steady"], [5, "cold"], [0, "ice"]]) {
    const finished = { ...player, points, touchdowns: 0, receptions: 0 };
    for (const status of ["Live", "Final"]) {
      const result = temperature(finished, status);
      assert.equal(result.label, "Final");
      assert.equal(result.state, state);
    }
  }
});

test("active players still show their heat label", () => {
  assert.equal(temperature({ ...player, gameProgress: .75 }, "Live").label, "On fire");
});
