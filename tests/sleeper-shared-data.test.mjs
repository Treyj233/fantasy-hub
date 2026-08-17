import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSleeperPlayerDirectory, normalizeSleeperStatMap } from "../app/sleeper-shared-normalizers.mjs";

test("normalizes the large player directory to scoreboard-only metadata", () => {
  const players = normalizeSleeperPlayerDirectory({
    "1": { full_name: "Player One", position: "WR", team: "GB", age: 25, college: "Example" },
    "2": { first_name: "Player", last_name: "Two", position: "RB" },
  });
  assert.deepEqual(players.get("1"), { name: "Player One", position: "WR", team: "GB" });
  assert.deepEqual(players.get("2"), { name: "Player Two", position: "RB", team: "FA" });
});

test("normalizes both array and keyed Sleeper weekly payloads", () => {
  assert.equal(normalizeSleeperStatMap([{ player_id: "1", stats: { rush_yd: 50 } }]).get("1")?.rush_yd, 50);
  assert.equal(normalizeSleeperStatMap({ "2": { stats: { rec: 6 } }, "3": { pass_td: 2 } }).get("2")?.rec, 6);
  assert.equal(normalizeSleeperStatMap({ "2": { stats: { rec: 6 } }, "3": { pass_td: 2 } }).get("3")?.pass_td, 2);
});
