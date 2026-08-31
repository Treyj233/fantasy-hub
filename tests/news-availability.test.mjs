import assert from "node:assert/strict";
import test from "node:test";

import { seasonEndingPlayerIds } from "../app/news-availability.ts";

test("season-ending news applies only to the story subject", () => {
  const ids = seasonEndingPlayerIds([{
    headline: "Jordyn Tyson will miss the season",
    summary: "Tyson is out for the year.",
    relatedPlayers: [
      { id: "13281", relationship: "subject" },
      { id: "999", relationship: "beneficiary" },
    ],
  }]);
  assert.deepEqual([...ids], ["13281"]);
});

test("ordinary IR and multi-week stories do not imply a lost season", () => {
  const ids = seasonEndingPlayerIds([{
    headline: "Receiver placed on injured reserve",
    summary: "The player will miss multiple weeks.",
    relatedPlayers: [{ id: "13281", relationship: "subject" }],
  }]);
  assert.equal(ids.size, 0);
});
