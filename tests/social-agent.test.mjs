import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("social agent is live, sourced, deduplicated, and rate limited", async () => {
  const [worker, content, intelligence, config] = await Promise.all([
    readFile(new URL("../social-agent/src/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../social-agent/src/content.ts", import.meta.url), "utf8"),
    readFile(new URL("../social-agent/src/intelligence.ts", import.meta.url), "utf8"),
    readFile(new URL("../social-agent/wrangler.jsonc", import.meta.url), "utf8"),
  ]);
  assert.match(config, /"POSTING_MODE": "live"/);
  assert.match(config, /"POLL_INTERVAL_SECONDS": "300"/);
  assert.match(config, /"MIN_POST_INTERVAL_MINUTES": "5"/);
  assert.match(config, /"MAX_POSTS_PER_DAY": "50"/);
  assert.match(config, /"GAMEDAY_MAX_POSTS_PER_DAY": "100"/);
  assert.match(worker, /scheduleEvery\(interval, "runCycle"/);
  assert.match(worker, /cancelSchedule\(schedule\.id\)/);
  assert.match(worker, /CREATE TABLE IF NOT EXISTS stories/);
  assert.match(worker, /SELECT id FROM stories WHERE id/);
  assert.match(worker, /RECENT_STORY_HOURS = 18/);
  assert.match(worker, /ORDER BY published_at DESC LIMIT 100/);
  assert.match(worker, /POST_FRESHNESS_MINUTES = 60/);
  assert.match(worker, /GAMEDAY_POST_FRESHNESS_MINUTES = 20/);
  assert.match(worker, /WHERE status = 'draft' AND published_at >=/);
  assert.match(worker, /x_duplicate_suppressed/);
  assert.match(worker, /status = 'feed_only', error = 'X rejected duplicate content'/);
  assert.match(worker, /if \(\/duplicate content\/i\.test\(state\.lastError/);
  assert.match(worker, /Retry every still-fresh approved draft/);
  assert.match(worker, /reason: gapRemainingMs > 0 \? "minimum-gap"/);
  assert.match(worker, /publishableStories\.slice\(0, 1\)/);
  assert.match(worker, /safeEqual\(provided, env\.ADMIN_TOKEN\)/);
  assert.match(content, /WHY IT MATTERS:/);
  assert.doesNotMatch(content, /Source:/);
  assert.match(config, /RapSheet,AdamSchefter,TomPelissero,MikeGarafolo,UnderdogNFL,32BeatWriters,Schultz_Report/);
  assert.match(worker, /source_accounts/);
  assert.match(worker, /xApiGet/);
  assert.match(worker, /"max_results": "25"/);
  assert.match(worker, /MANUAL_REPOST_KEY = "manual-repost-v42-complete-copy"/);
  assert.match(worker, /await this\.repostLatestPublishedOnce\(2\)/);
  assert.match(worker, /INSERT OR REPLACE INTO agent_meta \(key, value\) VALUES \(\$\{itemKey\}, 'complete'\)/);
  assert.match(worker, /DRAFT_FORMAT_VERSION/);
  assert.doesNotMatch(worker, /DELETE FROM stories WHERE status = 'draft'/);
  assert.match(worker, /if \(!context && story\.category !== "weather"\) continue/);
  assert.match(worker, /semantic_key/);
  assert.match(worker, /duplicateWindowMs/);
  assert.match(worker, /story\.category === "performance" \? 20 \* 60_000 : 24 \* 60 \* 60_000/);
  assert.match(content, /SUNDAY PULSE/);
  assert.match(content, /gain the clearest opportunity; put \$\{depthText\} on the watchlist/);
  assert.match(content, /No immediate waiver move/);
  assert.match(content, /tweaked\|strained\|sprained/);
  assert.match(content, /not considered serious or long-term/);
  assert.match(content, /injuryLead/);
  assert.match(content, /act only after a downgrade or inactive ruling/);
  assert.match(content, /if ruled out, reassess \$\{backupText\}/);
  assert.doesNotMatch(content, /Add now where available and monitor pregame status/);
  assert.match(content, /\\bir\\b/);
  assert.match(content, /arrival adds real competition/);
  assert.match(content, /departure clears an opening/);
  assert.match(worker, /x-editorial-v45-why-it-matters-full-names/);
  assert.match(worker, /2091958236685520923/);
  assert.match(worker, /2090517793737158739:2/);
  assert.match(worker, /2090493186653249579/);
  assert.match(worker, /filter\(\(story\) => !RETRACTED_STORY_IDS\.includes\(story\.id\)\)/);
  assert.match(worker, /stories\.filter\(\(story\) => !RETRACTED_STORY_IDS\.includes\(story\.id\)\)\.map/);
  assert.match(worker, /if \(isLiveContentPost\(primaryText, sourceUrls\)\) return \[\]/);
  assert.match(worker, /attachments\.media_keys/);
  assert.match(worker, /referenced_tweets\.id\.attachments\.media_keys/);
  assert.match(worker, /hasVideoMedia/);
  assert.match(worker, /video_source_suppressed/);
  assert.match(worker, /reviewMediaStoryIntent/);
  assert.match(worker, /media-ai-review/);
  assert.match(worker, /post's written text independently and unambiguously states the event, player, and fantasy-relevant development/);
  assert.match(worker, /Approve only if an editor could accurately write a factual headline and fantasy recommendation from this text alone/);
  assert.match(worker, /const mediaReview = await this\.reviewMediaStoryIntent\(story\)/);
  assert.match(worker, /if \(!mediaReview\.approved\)/);
  assert.match(worker, /parseAiResponse/);
  assert.match(worker, /Season phase:/);
  assert.match(worker, /await this\.regenerateCurrentFeed\(\)/);
  assert.match(content, /replace\(\/\\b\(\?:\[A-Z\]\\\.\)\{2,\}\//);
  assert.match(worker, /\.filter\(\(story\) => !processed\.has\(story\.id\)\)\.slice\(0, 2\)/);
  assert.match(worker, /async publicFeed\(\) \{\s*this\.ensureStorySchema\(\);\s*this\.migrateDraftFormat\(\);\s*this\.migrateFeedOnlyStories\(\);\s*await this\.regenerateCurrentFeed\(\)/);
  assert.match(worker, /Live or media-dependent source cannot be summarized reliably/);
  assert.match(worker, /status IN \('draft', 'posted', 'feed_only'\)/);
  assert.match(worker, /const storyStatus = validation\.approvedForX \? "draft" : feedEligible \? "feed_only" : "suppressed"/);
  assert.match(worker, /Approve by default/);
  assert.match(worker, /Do not reject merely for tone or stylistic preference/);
  assert.match(worker, /WHERE status = 'draft' AND published_at >=/);
  assert.match(worker, /FEED_SUPPRESSION_MIGRATION/);
  assert.match(worker, /AND error IS NULL/);
  assert.match(worker, /const sourceCategory = categorizeStory\(sourceText\)/);
  assert.match(worker, /isPotentialTradeStory\(`\$\{story\.title\} \$\{story\.summary\}`\)/);
  assert.match(worker, /category: sourceCategory/);
  assert.match(intelligence, /Headline ends with a dangling word/);
  assert.match(intelligence, /Headline repeats the subject name/);
  assert.match(worker, /status IN \('posted', 'posted_suppressed'\)/);
  assert.match(worker, /isMaterialStoryUpdate\(previousFacts, facts, preparedStory\)/);
  assert.match(intelligence, /openingAvailabilityPattern/);
  assert.match(intelligence, /week 1\|start of/);
  assert.match(intelligence, /export function isMaterialStoryUpdate/);
  assert.match(intelligence, /\["diagnosis", "severity", "timetable"\]/);
  assert.match(worker, /Jacory Croskey-Merritt is the primary workload beneficiary/);
  assert.match(worker, /parentIsPractice && category === "performance" \? "news"/);
  assert.match(worker, /story_evidence/);
  assert.match(worker, /critiqueForPublishing/);
  assert.match(worker, /related_players_json/);
  assert.match(worker, /hydratedStories = await Promise\.all/);
  assert.match(worker, /filterRedundantFeedStories\(hydratedStories\)\.map\(feedStory\)/);
  assert.match(worker, /candidate\.category === "injury"/);
  assert.match(worker, /\["game-status", "confirmed", "return"\]/);
  assert.match(worker, /findTeamFantasyPlayers/);
  assert.match(content, /splitAtomicUpdates/);
  assert.match(worker, /Tyler Warren has a groin injury/);
  assert.match(worker, /Rachaad White tweaked his hamstring; not considered serious/);
  assert.match(worker, /Josh Downs is the target-share watch/);
  assert.match(worker, /gameDayWeatherStories/);
  assert.match(content, /WEATHER WATCH/);
  assert.match(content, /isSixPointFantasyPlay/);
  assert.match(worker, /isNflRegularOrPostseasonGameDay/);
  assert.match(worker, /const minimumGap = gameDay \? 0/);
  assert.match(await readFile(new URL("../social-agent/src/weather.ts", import.meta.url), "utf8"), /windGustMph/);
  assert.match(await readFile(new URL("../social-agent/src/player-data.ts", import.meta.url), "utf8"), /primaryStatement/);
  assert.match(await readFile(new URL("../social-agent/src/player-data.ts", import.meta.url), "utf8"), /meaningfulAvailabilityReturn/);
  assert.match(content, /Reported by \$\{reporter\}/);
  assert.doesNotMatch(content, /via \$\{story\.curator\}/);
  assert.match(content, /Do not pay up for one camp highlight/);
  assert.match(content, /Check \$\{context\.player\}'s next practice participation/);
  assert.match(worker, /whatChanged: one plain-language sentence/);
  assert.match(worker, /fantasyMeaning: explain the football-to-fantasy connection/);
  assert.match(worker, /actionNow: the clearest justified action today/);
  assert.match(worker, /nextTrigger: the single specific future report/);
  assert.match(worker, /headline: a complete, standalone factual sentence under 94 characters/);
  assert.match(worker, /whyItMatters: a clear complete thought under 108 characters/);
  assert.match(worker, /reader-comprehension failure/);
  assert.match(worker, /specific factual, player-safety, or reader-comprehension failure/);
  assert.doesNotMatch(content, /Monitor the depth chart and projections before making your next move/);
  assert.doesNotMatch(content, /Compare this report|routes, targets and snaps|before moving projections/);
  assert.match(worker, /const originalUrl = curated && reference && originalReporter/);
  assert.match(content, /"@rapsheet": "@RapSheet"/);
  assert.match(content, /"@schultz_report": "@Schultz_Report"/);
  assert.doesNotMatch(content, /"@underdognfl":/);
  assert.match(content, /summarizeHeadline/);
  assert.match(content, /cleanEnding/);
  assert.match(content, /unreliableSignals/);
  assert.match(content, /decodeEntities\(value\)\.replace\(\/<\[\^>\]\+>/);
});

test("X drafts preserve a complete headline before fitting fantasy impact", async () => {
  const { composeFantasyPost } = await import("../social-agent/src/content.ts");
  const post = composeFantasyPost({
    id: "complete-x-package",
    title: "Coach confirms the starting running back will miss Week 1 with a high ankle sprain.",
    summary: "The starter will miss Week 1 with a high ankle sprain.",
    url: "https://example.com/complete-x-package",
    source: "@AdamSchefter",
    reporter: "@AdamSchefter",
    publishedAt: "2026-09-08T16:00:00.000Z",
    category: "injury",
    fantasyImpact: "Add the direct backup before waivers run. Recheck the starter after the next medical update.",
  }, { player: "Example Player", position: "RB", team: "CHI", backups: ["Backup Runner"], affectedPlayers: [] });
  assert.ok(post.length <= 280);
  assert.match(post, /will miss Week 1 with a high ankle sprain\./);
  assert.match(post, /WHY IT MATTERS: [^\n]+[.!?]/);
  assert.doesNotMatch(post, /…|\.\.\./);
});

test("X impact fitting never turns a cut-off phrase into a sentence", async () => {
  const { composeFantasyPost } = await import("../social-agent/src/content.ts");
  const post = composeFantasyPost({
    id: "complete-impact-fallback",
    title: "TreVeyon Henderson returned to full practice and is available for team drills.",
    summary: "TreVeyon Henderson returned to full practice.",
    url: "https://example.com/complete-impact-fallback",
    source: "@AdamSchefter",
    reporter: "@AdamSchefterWithAnIntentionallyLongCreditThatReducesTheAvailableImpactBudget",
    publishedAt: "2026-08-24T16:00:00.000Z",
    category: "injury",
    fantasyImpact: "Keep Henderson on your draft board after the full return, but verify that he remains unrestricted throughout the rest of the week before moving him aggressively above nearby running backs.",
  }, { player: "TreVeyon Henderson", position: "RB", team: "NE", backups: [], affectedPlayers: [] });
  assert.ok(post.length <= 280);
  assert.match(post, /WHY IT MATTERS: (?:Availability now changes lineup and workload certainty|This changes the player's fantasy value)\./);
  assert.doesNotMatch(post, /before moving\./);
});

test("X posts expand surname-only player references and explain why the story matters", async () => {
  const { composeFantasyPost } = await import("../social-agent/src/content.ts");
  const post = composeFantasyPost({
    id: "full-name-why-it-matters",
    title: "Henderson returned to full practice.",
    summary: "TreVeyon Henderson returned to full practice.",
    url: "https://example.com/full-name-why-it-matters",
    source: "@AdamSchefter",
    publishedAt: "2026-08-24T16:00:00.000Z",
    category: "injury",
    fantasyImpact: "Henderson's full return restores his lineup viability.",
  }, { player: "TreVeyon Henderson", position: "RB", team: "NE", backups: [], affectedPlayers: [] });
  assert.match(post, /TreVeyon Henderson returned to full practice\./);
  assert.match(post, /WHY IT MATTERS: TreVeyon Henderson's full return restores his lineup viability\./);
  assert.doesNotMatch(post, /YOUR NEXT MOVE|FANTASY IMPACT/);
});

test("roundup posts are split into atomic player updates", async () => {
  const { splitAtomicUpdates } = await import("../social-agent/src/content.ts");
  assert.deepEqual(splitAtomicUpdates("• Player One left with an ankle injury\n• Player Two returned to practice in full"), [
    "Player One left with an ankle injury",
    "Player Two returned to practice in full",
  ]);
});

test("quote introductions remain attached to the quoted statement", async () => {
  const { splitAtomicUpdates } = await import("../social-agent/src/content.ts");
  assert.deepEqual(splitAtomicUpdates('Sam Darnold on rookie RB Jadarian Price:\n"He has looked explosive and earned more work."'), [
    'Sam Darnold on rookie RB Jadarian Price: "He has looked explosive and earned more work."',
  ]);
});

test("role classification distinguishes a starting-role change from starting an activity", async () => {
  const { categorizeStory, isSixPointFantasyPlay } = await import("../social-agent/src/content.ts");
  assert.equal(categorizeStory("Bo Nix starting off the day hot"), "news");
  assert.equal(categorizeStory("Bo Nix named the starting quarterback"), "depth-chart");
  assert.equal(categorizeStory("The rookie was promoted to the starting lineup"), "depth-chart");
  assert.equal(categorizeStory("Jaylen Waddle caught a 60-yard touchdown during practice"), "news");
  assert.equal(categorizeStory("Evan Engram scored twice in Broncos training camp"), "news");
  assert.equal(categorizeStory("Bo Nix will play about 14 snaps in the preseason game"), "news");
  assert.equal(isSixPointFantasyPlay({ title: "Touchdown in practice", summary: "Evan Engram scored during team drills" }), false);
});

test("game availability is always eligible for fantasy-player resolution", async () => {
  const { isFantasyRelevant } = await import("../social-agent/src/content.ts");
  assert.equal(isFantasyRelevant({ title: "Jayden Daniels and Terry McLaurin are scheduled to play today", summary: "" }), true);
  assert.equal(isFantasyRelevant({ title: "Stefon Diggs will suit up in tonight's preseason game", summary: "" }), true);
  assert.equal(isFantasyRelevant({ title: "The veteran will be inactive for today's game", summary: "" }), true);
  assert.equal(isFantasyRelevant({ title: "The coach may possibly let him play", summary: "" }), false);
});

test("live content posts are suppressed without blocking complete text reports", async () => {
  const { isLiveContentPost, isSelfContainedMediaPost } = await import("../social-agent/src/content.ts");
  assert.equal(isLiveContentPost("We're live now—join the show for camp updates"), true);
  assert.equal(isLiveContentPost("Lions camp conversation", ["https://x.com/i/broadcasts/1DXxy" ]), true);
  assert.equal(isLiveContentPost("Join our X Space", ["https://twitter.com/i/spaces/1YpKk"]), true);
  assert.equal(isLiveContentPost("I had to ask Jaguars WR Brian Thomas Jr."), true);
  assert.equal(isLiveContentPost("From @GMFB: A look at what's ahead for the Raiders quarterback."), true);
  assert.equal(isLiveContentPost("Sam LaPorta may not be ready for Week 1 after a hip flare-up."), false);
  assert.equal(isLiveContentPost("Live practice update: Sam LaPorta left with a hip injury."), false);
  assert.equal(isLiveContentPost("Woody Marks with defenders bouncing off him."), true);
  assert.equal(isLiveContentPost("Woody Marks bounces off defenders and scores a touchdown."), false);
  assert.equal(isSelfContainedMediaPost("Woody Marks scored a 22-yard touchdown on his third carry of the preseason game."), true);
  assert.equal(isSelfContainedMediaPost("What a run by Woody Marks 👇"), false);
  assert.equal(isSelfContainedMediaPost("Sam Darnold on rookie RB Jadarian Price:"), false);
  assert.equal(isSelfContainedMediaPost("Watch the full interview here", ["https://x.com/example/status/1"]), false);
});

test("practice stat lines retain versus context and never imply an absence", async () => {
  const { composeFantasyPost } = await import("../social-agent/src/content.ts");
  const post = composeFantasyPost({
    id: "practice-stat-test",
    title: "Drake Maye in 11-on-11 vs. Eagles on day 2 of joint practice: 9-of-18, 4 TDs, 2 INTs",
    summary: "Drake Maye in 11-on-11 vs. Eagles on day 2 of joint practice: 9-of-18, 4 TDs, 2 INTs",
    url: "https://example.com/practice-stat-test",
    source: "@UnderdogNFL",
    publishedAt: "2026-08-20T16:05:57.000Z",
    category: "news",
  }, { player: "Drake Maye", position: "QB", team: "NE", backups: [], affectedPlayers: ["Stefon Diggs", "Hunter Henry"] });
  assert.match(post, /vs\. Eagles on day 2 of joint practice/);
  assert.match(post, /price unchanged after one practice/);
  assert.match(post, /running the first-team offense would make the report worth acting on/);
  assert.doesNotMatch(post, /next practice participation|absence continues/);
});

test("generic news fallbacks give a decision trigger instead of projection boilerplate", async () => {
  const { composeFantasyPost } = await import("../social-agent/src/content.ts");
  const post = composeFantasyPost({
    id: "natural-impact-test",
    title: "The team shared a new update on Drake Maye.",
    summary: "The team shared a new update on Drake Maye.",
    url: "https://example.com/natural-impact-test",
    source: "@UnderdogNFL",
    publishedAt: "2026-08-20T16:05:57.000Z",
    category: "news",
  }, { player: "Drake Maye", position: "QB", team: "NE", backups: [], affectedPlayers: [] });
  assert.match(post, /confirmed change in starting status or designed usage/);
  assert.doesNotMatch(post, /adjust projections|compare this report|routes, targets and snaps/i);
});

test("transaction classification distinguishes a signing from an absence note", async () => {
  const { categorizeStory } = await import("../social-agent/src/content.ts");
  assert.equal(categorizeStory("No sign of Carnell Tate at practice"), "news");
  assert.equal(categorizeStory("The Titans signed a running back"), "contract");
  assert.equal(categorizeStory("The receiver re-signed with the team"), "contract");
});

test("potential trade reports remain roster moves when an injury provides context", async () => {
  const { categorizeStory, composeFantasyPost } = await import("../social-agent/src/content.ts");
  assert.equal(categorizeStory("Kayshon Boutte is a potential trade candidate following Jayden Higgins injury"), "contract");
  const draft = composeFantasyPost({
    id: "trade-watch",
    title: "Kayshon Boutte makes sense as a potential trade candidate for Texans following Jayden Higgins injury.",
    summary: "Kayshon Boutte makes sense as a potential trade candidate for Texans following Jayden Higgins injury.",
    url: "https://example.com/trade-watch",
    source: "@UnderdogNFL",
    publishedAt: "2026-08-20T17:36:29.000Z",
    category: "contract",
  }, { player: "Kayshon Boutte", position: "WR", team: "NE", backups: [], affectedPlayers: [] });
  assert.match(draft, /Kayshon Boutte is a potential trade candidate\./);
  assert.doesNotMatch(draft, /roster situation has changed/);
});

test("confirmed trades phrased as sending a player pass the fantasy relevance gate", async () => {
  const { categorizeStory, isFantasyRelevant } = await import("../social-agent/src/content.ts");
  const report = "Trade! The Patriots are sending WR Kayshon Boutte to the Texans for safety Jaylen Reed and a draft pick.";
  assert.equal(categorizeStory(report), "contract");
  assert.equal(isFantasyRelevant({ title: report, summary: report }), true);
});

test("historical contract lists are context, not fantasy roster moves", async () => {
  const { categorizeStory, isFantasyRelevant } = await import("../social-agent/src/content.ts");
  const contextLine = "Since 2012: Lavonte David (5 contracts), Vita Vea (2), Chris Godwin (2), Mike Evans (2).";
  assert.equal(categorizeStory(contextLine), "news");
  assert.equal(isFantasyRelevant({ title: contextLine, summary: contextLine }), false);
});

test("same-team contract extensions without role impact are not roster moves", async () => {
  const { categorizeStory, isFantasyRelevant } = await import("../social-agent/src/content.ts");
  const marketComment = "Bijan Robinson received messages thanking him for reviving the RB market with the contract extension he signed.";
  assert.equal(categorizeStory(marketComment), "news");
  assert.equal(isFantasyRelevant({ title: marketComment, summary: marketComment }), false);
  assert.equal(categorizeStory("The Falcons signed a running back with the team"), "contract");
  assert.equal(isFantasyRelevant({ title: "Bijan returned to practice after ending his holdout with an extension", summary: "Bijan returned to practice" }), true);
});

test("injury classification recognizes past-tense ACL reports", async () => {
  const { categorizeStory } = await import("../social-agent/src/content.ts");
  assert.equal(categorizeStory("Texans WR Jayden Higgins tore his ACL"), "injury");
});

test("feed bullets keep dotted player initials together", async () => {
  const { splitImpactSteps } = await import("../social-agent/src/content.ts");
  assert.deepEqual(splitImpactSteps("Monitor the role. A.J. Brown gets the target boost. Hold for now."), [
    "Monitor the role.",
    "A.J. Brown gets the target boost.",
    "Hold for now.",
  ]);
  assert.deepEqual(splitImpactSteps("Monitor the injury. Amon-Ra St. Brown gets the target boost. Hold for now."), [
    "Monitor the injury.",
    "Amon-Ra St. Brown gets the target boost.",
    "Hold for now.",
  ]);
});

test("injury context follows the player nearest the injury language", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    boutte: { full_name: "Kayshon Boutte", team: "NE", position: "WR", search_rank: 100 },
    higgins: { full_name: "Jayden Higgins", team: "HOU", position: "WR", search_rank: 80 },
  }));
  try {
    const { findPlayerContext } = await import(`../social-agent/src/player-data.ts?subject-test=${Date.now()}`);
    const context = await findPlayerContext(
      "Kayshon Boutte makes sense as a potential trade candidate for Texans following Jayden Higgins injury.",
      "injury",
    );
    assert.equal(context?.player, "Jayden Higgins");
    const rosterMoveContext = await findPlayerContext(
      "Kayshon Boutte makes sense as a potential trade candidate for Texans following Jayden Higgins injury.",
      "contract",
    );
    assert.equal(rosterMoveContext?.player, "Kayshon Boutte");
  } finally {
    globalThis.fetch = originalFetch;
  }
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
  assert.match(post, /Tyler Warren (?:has|is dealing with a) groin injury\./);
  assert.doesNotMatch(post, /Colts HC Shane Steichen told reporters\./);
});

test("a named starting quarterback gets format-specific advice instead of a pass-catcher watch", async () => {
  const { composeFantasyPost } = await import("../social-agent/src/content.ts");
  const post = composeFantasyPost({
    id: "qb-starter-test",
    title: "Deshaun Watson has been named Cleveland's starting quarterback for Week 1 at Jacksonville.",
    summary: "Deshaun Watson has been named Cleveland's starting quarterback for Week 1 at Jacksonville.",
    url: "https://example.com/qb-starter-test",
    source: "@AdamSchefter",
    publishedAt: "2026-08-24T13:58:11.000Z",
    category: "depth-chart",
  }, { player: "Deshaun Watson", position: "QB", team: "CLE", backups: ["Shedeur Sanders"], affectedPlayers: ["Harold Fannin"] });
  assert.match(post, /draftable in Superflex and 2QB formats/);
  assert.match(post, /Shedeur Sanders shifts to a dynasty bench stash/);
  assert.match(post, /In 1QB leagues/);
  assert.doesNotMatch(post, /Harold Fannin.*actionable watchlist/);
});

test("preseason injuries favor healthy target beneficiaries over immediate waiver backups", async () => {
  const { composeFantasyPost } = await import("../social-agent/src/content.ts");
  const post = composeFantasyPost({
    id: "preseason-injury-test",
    title: "Tyler Warren is dealing with a groin injury suffered during practice.",
    summary: "Tyler Warren is dealing with a groin injury suffered during practice.",
    url: "https://example.com/preseason-injury-test",
    source: "@AdamSchefter",
    publishedAt: "2026-08-19T21:31:12.000Z",
    category: "injury",
  }, { player: "Tyler Warren", position: "TE", team: "IND", backups: ["Mo Alie-Cox"], affectedPlayers: ["Josh Downs"] });
  assert.match(post, /track Tyler Warren's recovery, not the waiver wire/);
  assert.match(post, /Josh Downs is the target-share watch/);
  assert.match(post, /Mo Alie-Cox is depth-chart insurance/);
  assert.doesNotMatch(post, /prioritize Mo Alie-Cox on waivers/);
});

test("an injured RB2 recommendation includes the healthy RB1 workload beneficiary", async () => {
  const { composeFantasyPost } = await import("../social-agent/src/content.ts");
  const post = composeFantasyPost({
    id: "rb2-injury-test",
    title: "Rachaad White tweaked his hamstring and is day-to-day.",
    summary: "Rachaad White tweaked his hamstring and is day-to-day.",
    url: "https://example.com/rb2-injury-test",
    source: "@MikeGarafolo",
    publishedAt: "2026-08-19T21:31:12.000Z",
    category: "injury",
  }, { player: "Rachaad White", position: "RB", team: "WAS", backups: ["Kaytron Allen"], affectedPlayers: ["Jacory Croskey-Merritt"] });
  assert.match(post, /Jacory Croskey-Merritt is the touch-share watch/);
  assert.match(post, /Kaytron Allen is depth-chart insurance/);
});

test("long-term injury advice separates established beneficiaries from depth options", async () => {
  const { composeFantasyPost } = await import("../social-agent/src/content.ts");
  const post = composeFantasyPost({
    id: "season-ending-test", title: "Jayden Higgins tore his ACL and will miss the season.", summary: "Jayden Higgins tore his ACL and will miss the season.",
    url: "https://example.com/season-ending-test", source: "@RapSheet", publishedAt: "2026-08-19T16:18:45.000Z", category: "injury",
  }, { player: "Jayden Higgins", position: "WR", team: "HOU", affectedPlayers: ["Nico Collins", "Dalton Schultz"], backups: ["Justin Watson"] });
  assert.match(post, /Nico Collins and Dalton Schultz gain the clearest opportunity/);
  assert.match(post, /put Justin Watson on the watchlist/);
  assert.doesNotMatch(post, /prioritize Nico Collins.*waivers/);
});

test("availability progression is treated as material new information", async () => {
  const intelligence = await readFile(new URL("../social-agent/src/intelligence.ts", import.meta.url), "utf8");
  assert.match(intelligence, /"out" \| "dnp" \| "side-work" \| "limited" \| "full" \| "cleared"/);
  assert.match(intelligence, /practiced in limited fashion/);
  assert.match(intelligence, /full participant\|practiced in full/);
  assert.match(intelligence, /next\.availabilityLevel && next\.availabilityLevel !== previous\.availabilityLevel/);
});

test("off-field reports require an explicit fantasy availability consequence", async () => {
  const { categorizeStory, isFantasyRelevant } = await import("../social-agent/src/content.ts");
  const legalReport = "Josh Jacobs was charged with two misdemeanors after an arrest.";
  assert.equal(categorizeStory(legalReport), "news");
  assert.equal(isFantasyRelevant({ title: legalReport, summary: "" }), false);
  assert.equal(isFantasyRelevant({
    title: "Josh Jacobs faces a possible suspension after misdemeanor charges.",
    summary: "The Packers are preparing for a potential suspension.",
  }), true);
});

test("X validation rejects vague updates, canned holds, and actionable practice advice", async () => {
  const intelligence = await readFile(new URL("../social-agent/src/intelligence.ts", import.meta.url), "utf8");
  assert.match(intelligence, /Headline describes an update without stating what changed/);
  assert.match(intelligence, /\\bhold on\\b/);
  assert.match(intelligence, /A single practice report cannot trigger an acquisition or value change/);
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
