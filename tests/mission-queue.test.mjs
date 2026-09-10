import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
const body = source.split("prioritizedInbox.slice(3).reduce((groups, item) => {")[1].split("}, new Map<string,")[0];
const reduce = new Function("groups", "item", body);
const item = (league, title, name = "Jaxon Smith-Njigba") => ({
  scan: { league: { id: league }, roster: [{ name }] },
  issue: { id: `${league}-${title}`, title, category: "Injury" }, priority: "Act now",
});
test("same player issue consolidates leagues and preserves highest-priority representative", () => {
  const first = item("a", "Jaxon Smith-Njigba is Questionable");
  const second = { ...item("b", first.issue.title), priority: "Monitor" };
  const groups = [...[first, second, second].reduce(reduce, new Map()).values()];
  assert.equal(groups.length, 1);
  assert.equal(groups[0].priority, "Act now");
  assert.deepEqual(groups[0].members.map(member => member.scan.league.id), ["a", "b"]);
});
test("different players, issues, and generic league tasks stay separate", () => {
  const items = [item("a", "Jaxon Smith-Njigba is Questionable"), item("b", "Jaxon Smith-Njigba is Out"), item("c", "Other Player is Questionable", "Other Player"), item("a", "Roster review"), item("b", "Roster review")];
  assert.equal(items.reduce(reduce, new Map()).size, 5);
});
