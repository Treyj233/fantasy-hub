import assert from "node:assert/strict";
import test from "node:test";

import { teamPositionStrength } from "../app/team-position-strength.ts";

test("single-starter rooms are driven by the starter with a small platoon contribution", () => {
  assert.equal(teamPositionStrength([90, 80, 70], 1), 89.2);
  assert.equal(teamPositionStrength([90, 30, 80], 1), 89.2);
  assert.equal(teamPositionStrength([90], 1), 82.8);
});

test("a strong backup helps without outweighing a better starter", () => {
  const eliteStarterWeakBackup = teamPositionStrength([94, 35], 1);
  const weakerStarterEliteBackup = teamPositionStrength([85, 84], 1);
  assert.ok(eliteStarterWeakBackup > weakerStarterEliteBackup);
  assert.ok(teamPositionStrength([90, 85], 1) > teamPositionStrength([90, 45], 1));
});

test("multi-starter rooms continue to value the required core and broader depth", () => {
  assert.equal(teamPositionStrength([90, 80, 70, 60], 2), 81.4);
});
