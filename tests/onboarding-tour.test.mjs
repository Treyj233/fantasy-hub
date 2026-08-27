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

test("onboarding includes My Leagues and navigates to real tools", () => {
  assert.match(source, /My Leagues onboarding preview/);
  assert.match(source, /onNavigate\("My Team"\)/);
  assert.match(source, /onNavigate\("Start \/ Sit"\)/);
  assert.match(source, /onNavigate\("Player Rankings"\)/);
  assert.match(source, /onNavigate\("Trade Lab"\)/);
});

test("Glossary can replay onboarding", () => {
  assert.match(source, /onStartOnboarding=\{startOnboardingTour\}/);
  assert.match(source, /Replay onboarding/);
});
