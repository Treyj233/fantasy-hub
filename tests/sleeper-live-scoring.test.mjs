import assert from "node:assert/strict";
import test from "node:test";
import { liveTeamPoints, sleeperFantasyPoints } from "../app/sleeper-live-scoring.mjs";

test("calculates conventional PPR offense from raw weekly stats", () => {
  const points = sleeperFantasyPoints(
    { pass_yd: 300, pass_td: 2, pass_int: 1, rush_yd: 20, rec: 3, rec_yd: 40, rec_td: 1 },
    { pass_yd: 0.04, pass_td: 4, pass_int: -2, rush_yd: 0.1, rec: 1, rec_yd: 0.1, rec_td: 6 },
    "QB",
  );
  assert.equal(points, 33);
});

test("derives TE premium, yardage bonuses, and defense points-allowed bands", () => {
  assert.equal(sleeperFantasyPoints({ rec: 5, rec_yd: 105 }, { rec: 1, rec_yd: 0.1, bonus_rec_te: 0.5, bonus_rec_yd_100: 2 }, "TE"), 20);
  assert.equal(sleeperFantasyPoints({ pts_allow: 6, sack: 3 }, { pts_allow_1_6: 7, sack: 1 }, "DEF"), 10);
});

test("sums only starters and preserves commissioner overrides", () => {
  const players = [{ isStarter: true, points: 12.25 }, { isStarter: true, points: 8.5 }, { isStarter: false, points: 30 }];
  assert.equal(liveTeamPoints(players), 20.75);
  assert.equal(liveTeamPoints(players, 19.1), 19.1);
});
