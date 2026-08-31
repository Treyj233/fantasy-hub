import assert from "node:assert/strict";
import test from "node:test";

import { weeklyProjectionValue } from "../app/weekly-projection.ts";

test("missing weekly projections are not converted into zero-point rankings", () => {
  assert.equal(weeklyProjectionValue({ leagueProjection: null, projection: 0 }), null);
  assert.equal(weeklyProjectionValue({ leagueProjection: 0, projection: 0 }), null);
});

test("connected weekly projections remain authoritative", () => {
  assert.equal(weeklyProjectionValue({ leagueProjection: 13.4, projection: 10.2 }), 13.4);
  assert.equal(weeklyProjectionValue({ leagueProjection: null, projection: 10.2 }), 10.2);
});
