import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Highlightly provider keeps the key server-side and normalizes the game feed", async () => {
  const source = await readFile(new URL("../app/highlightly-nfl.ts", import.meta.url), "utf8");
  assert.match(source, /american-football\.highlightly\.net/);
  assert.match(source, /env\.HIGHLIGHTLY_API_KEY/);
  assert.match(source, /"x-rapidapi-key": apiKey/);
  assert.match(source, /state: "pre" \| "in" \| "post"/);
  assert.match(source, /loadNflSeasonSchedule/);
  assert.match(source, /playsFromMatch/);
});

test("all former ESPN NFL consumers use the Highlightly provider", async () => {
  const paths = [
    "../app/api/nfl-games/route.ts",
    "../app/api/nfl-plays/route.ts",
    "../app/api/scoreboard/route.ts",
    "../app/api/notifications/run/route.ts",
    "../app/api/weather/route.ts",
    "../social-agent/src/game-day.ts",
    "../social-agent/src/weather.ts",
  ];
  for (const path of paths) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(source, /highlightly-nfl/);
    assert.doesNotMatch(source, /site\.api\.espn\.com/);
  }
});

test("team marks no longer load from ESPN's asset CDN", async () => {
  const source = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /espncdn\.com/);
});
