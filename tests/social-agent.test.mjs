import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("social agent is live, sourced, deduplicated, and rate limited", async () => {
  const [worker, content, config] = await Promise.all([
    readFile(new URL("../social-agent/src/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../social-agent/src/content.ts", import.meta.url), "utf8"),
    readFile(new URL("../social-agent/wrangler.jsonc", import.meta.url), "utf8"),
  ]);
  assert.match(config, /"POSTING_MODE": "live"/);
  assert.match(config, /"POLL_INTERVAL_SECONDS": "300"/);
  assert.match(config, /"MIN_POST_INTERVAL_MINUTES": "12"/);
  assert.match(config, /"MAX_POSTS_PER_DAY": "20"/);
  assert.match(config, /"GAMEDAY_MAX_POSTS_PER_DAY": "100"/);
  assert.match(worker, /scheduleEvery\(interval, "runCycle"/);
  assert.match(worker, /cancelSchedule\(schedule\.id\)/);
  assert.match(worker, /CREATE TABLE IF NOT EXISTS stories/);
  assert.match(worker, /SELECT id FROM stories WHERE id/);
  assert.match(worker, /RECENT_STORY_HOURS = 18/);
  assert.match(worker, /POST_FRESHNESS_MINUTES = 60/);
  assert.match(worker, /GAMEDAY_POST_FRESHNESS_MINUTES = 20/);
  assert.match(worker, /publishableStories = newlyCreated\.filter/);
  assert.match(worker, /publishableStories\.slice\(0, 1\)/);
  assert.match(worker, /safeEqual\(provided, env\.ADMIN_TOKEN\)/);
  assert.match(content, /FANTASY IMPACT:/);
  assert.doesNotMatch(content, /Source:/);
  assert.match(config, /RapSheet,AdamSchefter,TomPelissero,MikeGarafolo,UnderdogNFL,32BeatWriters,Schultz_Report/);
  assert.match(worker, /source_accounts/);
  assert.match(worker, /xApiGet/);
  assert.match(worker, /DRAFT_FORMAT_VERSION/);
  assert.doesNotMatch(worker, /DELETE FROM stories WHERE status = 'draft'/);
  assert.match(worker, /if \(!context && story\.category !== "weather"\) continue/);
  assert.match(worker, /semantic_key/);
  assert.match(worker, /duplicateWindowMs/);
  assert.match(worker, /story\.category === "performance" \? 20 \* 60_000 : 24 \* 60 \* 60_000/);
  assert.match(content, /SUNDAY PULSE/);
  assert.match(content, /prioritize \$\{backupText\} on waivers/);
  assert.match(content, /No immediate waiver move/);
  assert.match(content, /tweaked\|strained\|sprained/);
  assert.match(content, /not considered serious or long-term/);
  assert.match(content, /injuryLead/);
  assert.match(content, /act only after a downgrade or inactive ruling/);
  assert.match(content, /if ruled out, reassess \$\{backupText\}/);
  assert.doesNotMatch(content, /Add now where available and monitor pregame status/);
  assert.match(content, /\\bir\\b/);
  assert.match(content, /arrival changes the \$\{opportunity\}/);
  assert.match(content, /departure opens opportunity/);
  assert.match(worker, /x-sources-v16-rachaad-white-injury-context/);
  assert.match(worker, /Tyler Warren has a groin injury/);
  assert.match(worker, /Rachaad White tweaked his hamstring; not considered serious/);
  assert.match(worker, /gameDayWeatherStories/);
  assert.match(content, /WEATHER WATCH/);
  assert.match(content, /isSixPointFantasyPlay/);
  assert.match(worker, /isNflRegularOrPostseasonGameDay/);
  assert.match(worker, /const minimumGap = gameDay \? 0/);
  assert.match(await readFile(new URL("../social-agent/src/weather.ts", import.meta.url), "utf8"), /windGustMph/);
  assert.match(await readFile(new URL("../social-agent/src/player-data.ts", import.meta.url), "utf8"), /primaryStatement/);
  assert.match(content, /Reported by \$\{reporter\}/);
  assert.doesNotMatch(content, /via \$\{story\.curator\}/);
  assert.match(content, /Do not chase one camp highlight/);
  assert.match(content, /Check \$\{context\.player\}'s next practice participation/);
  assert.doesNotMatch(content, /Monitor the depth chart and projections before making your next move/);
  assert.match(worker, /const originalUrl = curated && reference && originalReporter/);
  assert.match(content, /"@rapsheet": "@RapSheet"/);
  assert.match(content, /"@schultz_report": "@Schultz_Report"/);
  assert.doesNotMatch(content, /"@underdognfl":/);
  assert.match(content, /summarizeHeadline/);
  assert.match(content, /cleanEnding/);
  assert.match(content, /unreliableSignals/);
  assert.match(content, /decodeEntities\(value\)\.replace\(\/<\[\^>\]\+>/);
});

test("role classification distinguishes a starting-role change from starting an activity", async () => {
  const { categorizeStory } = await import("../social-agent/src/content.ts");
  assert.equal(categorizeStory("Bo Nix starting off the day hot"), "news");
  assert.equal(categorizeStory("Bo Nix named the starting quarterback"), "depth-chart");
  assert.equal(categorizeStory("The rookie was promoted to the starting lineup"), "depth-chart");
});

test("transaction classification distinguishes a signing from an absence note", async () => {
  const { categorizeStory } = await import("../social-agent/src/content.ts");
  assert.equal(categorizeStory("No sign of Carnell Tate at practice"), "news");
  assert.equal(categorizeStory("The Titans signed a running back"), "contract");
  assert.equal(categorizeStory("The receiver re-signed with the team"), "contract");
});

test("injury headlines prioritize the diagnosis when attribution consumes the tweet budget", async () => {
  const { composeFantasyPost } = await import("../social-agent/src/content.ts");
  const post = composeFantasyPost({
    id: "injury-test",
    title: "Colts HC Shane Steichen told reporters that TE Tyler Warren is dealing with a groin injury that he suffered during today's practice.",
    summary: "Colts HC Shane Steichen told reporters that TE Tyler Warren is dealing with a groin injury that he suffered during today's practice.",
    url: "https://example.com/injury-test",
    source: "@AdamSchefter",
    publishedAt: new Date().toISOString(),
    category: "injury",
  }, { player: "Tyler Warren", position: "TE", team: "IND", backups: ["Mo Alie-Cox", "Will Mallory"], affectedPlayers: [] });
  assert.match(post, /Tyler Warren has a groin injury\./);
  assert.doesNotMatch(post, /Colts HC Shane Steichen told reporters\./);
});

test("X posting uses signed user context and never stores credentials in source", async () => {
  const [client, config] = await Promise.all([
    readFile(new URL("../social-agent/src/x-client.ts", import.meta.url), "utf8"),
    readFile(new URL("../social-agent/wrangler.jsonc", import.meta.url), "utf8"),
  ]);
  assert.match(client, /HMAC-SHA1/);
  assert.match(client, /https:\/\/api\.x\.com\/2\/tweets/);
  assert.match(client, /crypto\.getRandomValues/);
  assert.doesNotMatch(config, /X_API_SECRET/);
  assert.doesNotMatch(config, /X_ACCESS_TOKEN/);
});
