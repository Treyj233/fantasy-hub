import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("All Leagues loading state only uses component inputs", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const start = source.indexOf("function AllLeagues(");
  const end = source.indexOf("function LeagueStories(", start);
  const component = source.slice(start, end);

  assert.ok(start >= 0 && end > start, "AllLeagues component should be present");
  assert.doesNotMatch(component, /useState\(Boolean\(leagueId\)\)/);
  assert.match(
    component,
    /leagues\.length > 0 && cachedScans\.length === 0/,
  );
});

test("All Leagues is presented as Mission Hub", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  assert.match(source, /label: "All Leagues", displayLabel: "Mission Hub"/);
  assert.match(source, /<span>MISSION HUB<\/span>/);
  assert.match(source, /<h1>\{viewTitle\}<\/h1>/);
  assert.match(source, /Personalize Your Hub/);
  assert.match(source, /!isPro && <b>PRO<\/b>/);
  assert.match(source, /id="hub-appearance"/);
  assert.match(source, /scrollIntoView\(\{ behavior: "smooth", block: "start" \}\)/);
});

test("Pro billing navigation lives in Utilities and replaces the simulator shortcut", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  assert.match(source, /displayLabel: "Manage Plans"[^\n]+group: "Utilities"/);
  assert.match(source, /"League Insights", "Utilities"/);
  assert.match(source, /pro-top-action[^\n]+setView\("Fantasy Hub Pro"\)/);
  assert.doesNotMatch(source, /season-roll" onClick=\{\(\) => setView\("Simulator"\)\}/);
});

test("portfolio Scoreboard keeps matchup status in scope", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const start = source.indexOf("function AllLeagueScoreboard(");
  const end = source.indexOf("function Scoreboard(", start);
  const component = source.slice(start, end);

  assert.ok(start >= 0 && end > start, "AllLeagueScoreboard component should be present");
  assert.doesNotMatch(
    component,
    /\.filter\(\(player\) => item\.status/,
  );
  assert.match(component, /matchup\.status === "final"/);
  assert.match(component, /affectedLeagues/);
  assert.match(component, /leagueName: item\.league\.name/);
  assert.match(component, /ROOT FOR/);
  assert.match(component, /ROOT AGAINST/);
  assert.match(component, /Live scoring preview/);
  assert.match(component, /These are not live events/);
});

test("NFL game impact details open in an accessible popout", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  assert.match(source, /isExpanded \? "is-expanded"/);
  assert.match(source, /YOUR TEAM/);
  assert.match(source, /OPPONENT/);
  assert.match(source, /sidePlayers\.map/);
  assert.match(source, /"Open matchup details"/);
  assert.match(source, /impact-roster-expanded/);
  assert.match(source, /game-impact-popout/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
});
