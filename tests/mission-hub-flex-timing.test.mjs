import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Mission Hub warns when an earlier player occupies FLEX over a later same-position starter", async () => {
  const source = await readFile(
    new URL("../app/FantasyHub.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /function flexTimingSwapCandidates\(/);
  assert.match(source, /FLEX_LINEUP_SLOTS\.has\(earlyPlayer\.role\)/);
  assert.match(source, /player\.position !== earlyPlayer\.position/);
  assert.match(source, /laterKickoff - earlyKickoff >= 60 \* 60_000/);
  assert.match(source, /earlyKickoff <= now/);
  assert.match(source, /Preserve roster flexibility: swap your \$\{formatRosterSlot\(flexTimingSwap\.earlyPlayer\.role\)\} position/);
  assert.match(source, /Keep both players in your starting lineup/);
  assert.match(source, /later-playing player in the \$\{formatRosterSlot\(flexTimingSwap\.earlyPlayer\.role\)\} position preserves more roster flexibility/);
  assert.match(source, /do not bench either player/);
  assert.match(source, /preserves more roster flexibility/);
});

test("Mission Hub flex timing uses real schedule dates and supports every flex slot", async () => {
  const source = await readFile(
    new URL("../app/FantasyHub.tsx", import.meta.url),
    "utf8",
  );

  for (const slot of ["FLEX", "WR_RB_FLEX", "REC_FLEX", "SUPER_FLEX", "QB_FLEX"])
    assert.match(source, new RegExp(`"${slot}"`));
  assert.match(source, /Date\.parse\(game\.date\)/);
  assert.match(source, /weekday: "short"/);
});
