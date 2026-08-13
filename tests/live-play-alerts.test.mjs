import assert from "node:assert/strict";
import test from "node:test";
import { classifyFantasyPlay, matchupImpactText } from "../app/live-play-alerts.mjs";

const baseline = { points: 4, yards: 30, touchdowns: 0, receptions: 2, offensiveTurnovers: 0, defensiveTurnovers: 0, returnTouchdowns: 0, fieldGoals: 0 };

test("Sunday Pulse requires a three-point league-scored play", () => {
  assert.equal(classifyFantasyPlay(baseline, { ...baseline, points: 6.9, yards: 55 }).qualifies, false);
  const play = classifyFantasyPlay(baseline, { ...baseline, points: 7, yards: 60, receptions: 3 });
  assert.equal(play.qualifies, true);
  assert.equal(play.kind, "offense");
});

test("turnovers qualify regardless of fantasy point delta", () => {
  const takeaway = classifyFantasyPlay(baseline, { ...baseline, points: 6, defensiveTurnovers: 1 });
  assert.equal(takeaway.qualifies, true);
  assert.equal(takeaway.kind, "turnover");
  assert.match(takeaway.description, /takeaway/);
});

test("kicker and return scoring are labeled as special teams", () => {
  assert.equal(classifyFantasyPlay(baseline, { ...baseline, points: 7, fieldGoals: 1 }).kind, "special-teams");
  assert.equal(classifyFantasyPlay(baseline, { ...baseline, points: 10, returnTouchdowns: 1 }).kind, "special-teams");
});

test("matchup impact names direction, score, and win probability movement", () => {
  const text = matchupImpactText({ isMine: true, yourPoints: 91, opponentPoints: 88, previousOdds: 48, currentOdds: 57 });
  assert.match(text, /Helps your lineup/);
  assert.match(text, /lead by 3.0/);
  assert.match(text, /rose 9 points to 57%/);
});
