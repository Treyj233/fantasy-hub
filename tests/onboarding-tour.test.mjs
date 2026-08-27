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
  assert.match(source, /Tap a league to continue/);
  assert.match(source, /Tap My Team to continue/);
  assert.match(source, /Tap a player to continue/);
  assert.doesNotMatch(source, /My Leagues onboarding preview/);
});

test("Glossary can replay onboarding", () => {
  assert.match(source, /onStartOnboarding=\{startOnboardingTour\}/);
  assert.match(source, /Replay onboarding/);
});

test("desktop web does not open or advertise onboarding", () => {
  assert.match(source, /isNativeIosApp\(\) \|\| window\.matchMedia\("\(max-width: 700px\)"\)\.matches/);
  assert.match(source, /if \(!onboardingTourEligible\) setOnboardingTourOpen\(false\)/);
  assert.match(source, /\{showOnboarding && <section className="glossary-tour-replay panel">/);
});

test("the tour stays inside the iPhone safe viewport", () => {
  assert.match(source, /window\.visualViewport/);
  assert.match(source, /getComputedStyle\(safeAreaRef\.current\)/);
  assert.match(source, /safeRight - cardWidth/);
  assert.match(source, /safeBottom - cardHeight/);
  assert.match(styles, /env\(safe-area-inset-top\)/);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
  assert.doesNotMatch(source, /mission-tour-shade/);
  assert.match(styles, /position: fixed;\n  width: min\(320px/);
  assert.match(styles, /\.mission-tour-safe-area[\s\S]*safe-area-inset-left/);
  assert.match(styles, /\.mission-tour-placement-below\.mission-tour-prompt::before/);
  assert.match(styles, /\.mission-tour-card > header \{ position: sticky/);
});
