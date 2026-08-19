import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  bestWaiverMarketRank,
  isProtectedWaiverDrop,
  waiverDropProtectionCutoff,
} from "../app/waiver-drop-model.mjs";

const jordynTyson = {
  name: "Jordyn Tyson",
  position: "WR",
  overallRank: 180,
  adpBySite: {
    "Underdog Single-QB Half PPR": 63.9,
    "Underdog Single-QB Full PPR": 68,
    Sleeper: 75,
  },
};

test("high-value rookies are protected from waiver drop recommendations", () => {
  assert.equal(bestWaiverMarketRank(jordynTyson), 63.9);
  assert.equal(isProtectedWaiverDrop(jordynTyson, { format: "Redraft", teams: 12 }), true);
  assert.equal(isProtectedWaiverDrop(jordynTyson, { format: "Dynasty", teams: 12 }), true);
});

test("drop protection scales with league depth and excludes kickers and defenses", () => {
  assert.equal(waiverDropProtectionCutoff({ format: "Redraft", teams: 10 }), 80);
  assert.equal(waiverDropProtectionCutoff({ format: "Dynasty", teams: 10 }), 120);
  assert.equal(isProtectedWaiverDrop({ ...jordynTyson, position: "K" }, { format: "Dynasty", teams: 12 }), false);
  assert.equal(isProtectedWaiverDrop({ position: "WR", overallRank: 250 }, { format: "Redraft", teams: 12 }), false);
});

test("Sleeper and ESPN roster payloads retain ranking data used by the drop model", async () => {
  const [fantasyHub, sleeperRoute, espnAdapter] = await Promise.all([
    readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/league/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/espn.ts", import.meta.url), "utf8"),
  ]);

  assert.match(fantasyHub, /!isProtectedWaiverDrop\(player, context\)/);
  assert.match(sleeperRoute, /return \[\{ \.\.\.ranking, id: player\.player_id \?\? playerId/);
  assert.match(espnAdapter, /return \[\{ \.\.\.shaped, \.\.\.rankingById\.get\(shaped\.id\), role \}\]/);
});
