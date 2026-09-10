import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

test("uses Sleeper's versioned API for live stats and projections", async () => {
  const source = await readFile(new URL("../app/api/sleeper-shared-data.ts", import.meta.url), "utf8");
  assert.match(source, /https:\/\/api\.sleeper\.app\/v1\/stats\/nfl\/regular/);
  assert.match(source, /https:\/\/api\.sleeper\.app\/v1\/projections\/nfl\/regular/);
});
