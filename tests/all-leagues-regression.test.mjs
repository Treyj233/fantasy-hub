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
