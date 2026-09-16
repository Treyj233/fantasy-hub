import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
test("scoreboard previews and expanded lists reuse the same cards", () => {
  for (const renderer of ["renderPerformerCard", "renderRootingCard", "renderWinPathCard"]) {
    assert.equal(source.split(".map(" + renderer + ")").length - 1, 2);
  }
  assert.ok(source.includes('on-fire-grid portfolio-detail-grid'));
  assert.ok(source.includes('rooting-interests portfolio-detail-grid'));
  assert.ok(source.includes('temperature-indicator ${item.temperature.state}'));
});
test("active paths expand independently of the five-card preview", () => {
  assert.ok(source.includes('setDetailLimit(10); setDetailList("paths")'));
  assert.ok(source.includes('winPathCandidates.slice(0, detailLimit).map(renderWinPathCard)'));
  assert.ok(source.includes('setDetailLimit(limit => limit + 10)'));
  assert.ok(source.includes('detailCount > detailLimit'));
});
test("expanded cards retain two columns and safe viewport bounds", () => {
  assert.ok(css.includes('.portfolio-detail-dialog .portfolio-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))'));
  assert.ok(css.includes('env(safe-area-inset-top,0px)'));
  assert.ok(css.includes('.portfolio-detail-scroll{min-height:0;overflow-y:auto'));
});
