import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../app/readability.css", import.meta.url), "utf8");

test("Mission Hub onboarding is versioned, dismissible, and runs over the real app", () => {
  assert.match(source, /fantasy-hub-mission-tour-v1:/);
  assert.match(source, /setView\("All Leagues"\)/);
  assert.match(source, /if \(event\.key !== "Escape"\) return/);
  assert.match(source, /setOnboardingTourOpen\(false\)/);
  assert.doesNotMatch(source, /if \(needsOnboarding\)\s*return <AccountOnboarding/);
  assert.match(styles, /\.mission-tour \{ position: fixed/);
});

test("onboarding advances through real league, navigation, and player controls", () => {
  assert.match(source, /data-tour="choose-league"/);
  assert.match(source, /data-tour=\{item\.label === "My Team" \? "open-my-team"/);
  assert.match(source, /data-tour=\{playerIndex === 0 \? "player-detail"/);
  assert.match(source, /event\.target instanceof Element/);
  assert.doesNotMatch(source, /My Leagues onboarding preview/);
});

test("Glossary can replay onboarding", () => {
  assert.match(source, /onStartOnboarding=\{startOnboardingTour\}/);
  assert.match(source, /Replay onboarding/);
});

test("the tour stays inside the iPhone safe viewport", () => {
  assert.match(styles, /inset: max\(8px,calc\(env\(safe-area-inset-top\) \+ 8px\)\) 8px max\(8px,calc\(env\(safe-area-inset-bottom\) \+ 8px\)\)/);
  assert.match(styles, /env\(safe-area-inset-top\)/);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
  assert.match(styles, /\.mission-tour-shade[\s\S]*pointer-events: none/);
  assert.match(styles, /max-height: min\(48dvh,360px\)/);
  assert.match(styles, /\.mission-tour-card > header \{ position: sticky/);
});
