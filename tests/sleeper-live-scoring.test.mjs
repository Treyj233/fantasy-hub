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
  assert.equal(sleeperFantasyPoints({ rec: 4, rec_yd: 40 }, { rec: 1, rec_yd: 0.1, bonus_rec_rb: 0.25 }, "RB"), 9);
  assert.equal(sleeperFantasyPoints({ rec: 4, rec_yd: 40 }, { rec: 1, rec_yd: 0.1, bonus_rec_rb: 0.25 }, "WR"), 8);
  assert.equal(sleeperFantasyPoints({ rec: 3, rec_yd: 30 }, { rec: 1, rec_yd: 0.1, rec_te: 0.5 }, "TE"), 7.5);
  assert.equal(sleeperFantasyPoints({ pts_allow: 6, sack: 3 }, { pts_allow_1_6: 7, sack: 1 }, "DEF"), 10);
});

test("sums only starters and preserves commissioner overrides", () => {
  const players = [{ isStarter: true, points: 12.25 }, { isStarter: true, points: 8.5 }, { isStarter: false, points: 30 }];
  assert.equal(liveTeamPoints(players), 20.75);
  assert.equal(liveTeamPoints(players, 19.1), 19.1);
});

test("Sunday game-day scoring advances between official Sleeper reconciliations", () => {
  const scoring = { pass_yd: 0.04, pass_td: 4, pass_int: -2, rush_yd: 0.1, rush_td: 6, rec: 1, rec_yd: 0.1, rec_td: 6 };
  const starters = (snapshot) => [
    { isStarter: true, points: sleeperFantasyPoints(snapshot.qb, scoring, "QB") },
    { isStarter: true, points: sleeperFantasyPoints(snapshot.rb, scoring, "RB") },
    { isStarter: false, points: sleeperFantasyPoints(snapshot.bench, scoring, "WR") },
  ];

  const kickoff = starters({ qb: {}, rb: {}, bench: {} });
  const firstDrive = starters({
    qb: { pass_yd: 74, pass_td: 1 },
    rb: { rush_yd: 18, rec: 1, rec_yd: 7 },
    bench: { rec: 2, rec_yd: 45 },
  });
  const secondDrive = starters({
    qb: { pass_yd: 126, pass_td: 1, pass_int: 1 },
    rb: { rush_yd: 42, rush_td: 1, rec: 2, rec_yd: 16 },
    bench: { rec: 4, rec_yd: 82, rec_td: 1 },
  });

  assert.equal(liveTeamPoints(kickoff), 0);
  assert.equal(liveTeamPoints(firstDrive), 10.46);
  assert.equal(liveTeamPoints(secondDrive), 20.84);

  // Sleeper's league matchup payload can remain at the prior 15-minute true-up;
  // the shared 30-second player snapshot continues moving the displayed score.
  const sleeperOfficialBeforeTrueUp = 10.46;
  assert.notEqual(liveTeamPoints(secondDrive), sleeperOfficialBeforeTrueUp);
  assert.equal(liveTeamPoints(secondDrive), 20.84);

  // A commissioner override always wins, including during calculated live scoring.
  assert.equal(liveTeamPoints(secondDrive, 20.5), 20.5);
});
