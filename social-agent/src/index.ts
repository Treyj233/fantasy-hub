import { Agent, getAgentByName } from "agents";
import { categorizeStory, composeFantasyPost, isFantasyRelevant, isLiveContentPost, isPotentialTradeStory, isPracticeSetting, isSixPointFantasyPlay, splitAtomicUpdates, splitImpactSteps, type Story } from "./content";
import { createXPost, xApiGet, type XCredentials } from "./x-client";
import { findPlayerContext, findTeamFantasyPlayers } from "./player-data";
import { gameDayWeatherStories } from "./weather";
import { isNflRegularOrPostseasonGameDay } from "./game-day";
import { dashboardHtml } from "./dashboard";
import { extractStoryFacts, isMaterialStoryUpdate, validateStoryDraft, type StoryFacts, type ValidationResult } from "./intelligence";

type AgentState = {
  startedAt: string | null;
  lastRunAt: string | null;
  lastPostAt: string | null;
  lastError: string | null;
  mode: "preview" | "live";
};

const RECENT_STORY_HOURS = 18;
const POST_FRESHNESS_MINUTES = 60;
const GAMEDAY_POST_FRESHNESS_MINUTES = 20;
const DRAFT_FORMAT_VERSION = "x-sources-v37-context-list-gate";
const RETRACTED_STORY_IDS = ["2090186160634986677", "2090197243202609473", "2090202303143747828", "2090517793737158739:2"];

type StoredStory = {
  id: string;
  title: string;
  source: string;
  category: string;
  draft: string | null;
  status: string;
  published_at: string;
  confidence: string | null;
  lifecycle_stage: string | null;
  related_players_json: string | null;
  source_count: number | null;
};

const parseJson = <T,>(value: string | null, fallback: T): T => {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
};

const feedStory = (story: StoredStory) => {
  const sections = (story.draft || "").split(/\n{2,}/).map((section) => section.trim()).filter(Boolean);
  const titleSection = sections[0] || "🏈 FANTASY PULSE";
  const titleMatch = titleSection.match(/^(\p{Extended_Pictographic}(?:\uFE0F)?(?:\u200D\p{Extended_Pictographic})*)?\s*(.*)$/u);
  const impactSection = sections.find((section) => /^FANTASY IMPACT:/i.test(section)) || "";
  const impact = impactSection.replace(/^FANTASY IMPACT:\s*/i, "").trim();
  const reporterSection = sections.find((section) => /^(?:Reported|Curated) by\s+/i.test(section));
  const sentences = splitImpactSteps(impact);
  const headline = (sections[1] || story.title).replace(/^\p{Extended_Pictographic}(?:\uFE0F)?\s*/u, "");

  return {
    id: story.id,
    emoji: titleMatch?.[1] || "🏈",
    title: titleMatch?.[2] || "FANTASY PULSE",
    category: story.category,
    headline,
    impact,
    nextSteps: sentences,
    reporter: reporterSection?.replace(/^(?:Reported|Curated) by\s+/i, "") || null,
    publishedAt: story.published_at,
    confidence: story.confidence || "medium",
    lifecycleStage: story.lifecycle_stage || "initial",
    relatedPlayers: parseJson(story.related_players_json, []),
    sourceCount: story.source_count || 1,
  };
};

const semanticKey = (story: Story, player: { player: string; team: string; position: string }) =>
  [player.player, player.team, player.position, story.category]
    .map((value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-"))
    .join(":");

const feedSubjectId = (story: StoredStory) => parseJson<Array<{ id: string; relationship: string }>>(story.related_players_json, [])
  .find((player) => player.relationship === "subject")?.id;

const feedStoryLooksLikeInjury = (story: StoredStory) => story.category === "injury"
  || /\b(?:injur(?:y|ed)|tore|tear|acl|mcl|hamstring|ankle|knee|hip|groin|concussion|surgery|ir\b|injured reserve)\b/i
    .test(`${story.title} ${story.draft ?? ""}`);

const filterRedundantFeedStories = (stories: StoredStory[]) => stories.filter((story, index, all) => {
  const subjectId = feedSubjectId(story);
  if (!subjectId) return true;
  const inferredCategory = feedStoryLooksLikeInjury(story) ? "injury" : categorizeStory(`${story.title} ${story.draft ?? ""}`);
  const effectiveCategory = story.category === "news" && inferredCategory === "injury" ? "injury" : story.category;
  if (story.category === "news" && inferredCategory === "injury" && all.some((candidate) =>
    candidate.category === "injury"
      && feedSubjectId(candidate) === subjectId
      && Math.abs(Date.parse(candidate.published_at) - Date.parse(story.published_at)) <= 24 * 60 * 60_000
  )) return false;
  const materialStage = ["game-status", "confirmed", "return"].includes(story.lifecycle_stage || "initial");
  if (materialStage) return true;
  return !all.slice(0, index).some((newer) => {
    if (feedSubjectId(newer) !== subjectId) return false;
    const newerInferred = feedStoryLooksLikeInjury(newer) ? "injury" : categorizeStory(`${newer.title} ${newer.draft ?? ""}`);
    if (story.category === "injury" && newer.category === "news" && newerInferred === "injury") return false;
    const newerCategory = newer.category === "news" && newerInferred === "injury" ? "injury" : newer.category;
    return newerCategory === effectiveCategory && Math.abs(Date.parse(newer.published_at) - Date.parse(story.published_at)) <= 24 * 60 * 60_000;
  });
});

const safeEqual = async (left: string, right: string) => {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const a = new Uint8Array(leftHash);
  const b = new Uint8Array(rightHash);
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= a[i] ^ b[i];
  return difference === 0;
};

export class FantasyHubSocialAgent extends Agent<Env, AgentState> {
  initialState: AgentState = {
    startedAt: null,
    lastRunAt: null,
    lastPostAt: null,
    lastError: null,
    mode: "preview",
  };

  private ensureStorySchema() {
    const columns = [...this.sql<{ name: string }>`PRAGMA table_info(stories)`];
    const has = (name: string) => columns.some((column) => column.name === name);
    if (!has("semantic_key")) this.sql`ALTER TABLE stories ADD COLUMN semantic_key TEXT`;
    if (!has("parent_story_id")) this.sql`ALTER TABLE stories ADD COLUMN parent_story_id TEXT`;
    if (!has("confidence")) this.sql`ALTER TABLE stories ADD COLUMN confidence TEXT DEFAULT 'medium'`;
    if (!has("lifecycle_stage")) this.sql`ALTER TABLE stories ADD COLUMN lifecycle_stage TEXT DEFAULT 'initial'`;
    if (!has("facts_json")) this.sql`ALTER TABLE stories ADD COLUMN facts_json TEXT`;
    if (!has("validation_json")) this.sql`ALTER TABLE stories ADD COLUMN validation_json TEXT`;
    if (!has("related_players_json")) this.sql`ALTER TABLE stories ADD COLUMN related_players_json TEXT`;
    if (!has("source_count")) this.sql`ALTER TABLE stories ADD COLUMN source_count INTEGER DEFAULT 1`;
    this.sql`CREATE TABLE IF NOT EXISTS story_evidence (
      story_id TEXT NOT NULL,
      source_story_id TEXT NOT NULL,
      source TEXT NOT NULL,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      published_at TEXT NOT NULL,
      PRIMARY KEY (story_id, source_story_id)
    )`;
  }

  private migrateDraftFormat() {
    this.sql`CREATE TABLE IF NOT EXISTS agent_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`;
    const [format] = [...this.sql<{ value: string }>`SELECT value FROM agent_meta WHERE key = 'draft_format' LIMIT 1`];
    if (format?.value === DRAFT_FORMAT_VERSION) return;
    for (const storyId of RETRACTED_STORY_IDS) this.sql`DELETE FROM stories WHERE id = ${storyId}`;
    this.sql`UPDATE stories
      SET title = 'Tyler Warren has a groin injury.',
          draft = REPLACE(draft, 'Colts HC Shane Steichen told reporters.', 'Tyler Warren has a groin injury.')
      WHERE id = '2090189865996443824'`;
    this.sql`UPDATE stories
      SET status = 'suppressed', error = 'Practice highlight incorrectly classified as game performance'
      WHERE category = 'performance'
        AND (
          LOWER(title) LIKE '%practice%'
          OR LOWER(title) LIKE '%training camp%'
          OR LOWER(title) LIKE '%scrimmage%'
          OR parent_story_id = '2090197243202609473'
        )`;
    this.sql`UPDATE stories
      SET title = 'Rachaad White tweaked his hamstring; not considered serious.',
          draft = REPLACE(
            REPLACE(draft, 'Rachaad White has a new injury update.', 'Rachaad White tweaked his hamstring; not considered serious.'),
            'No immediate waiver move. Monitor Rachaad White''s practice status;',
            'Rachaad White tweaked his hamstring, but it is not considered serious or long-term. No immediate waiver move. Monitor his practice status;'
          )
      WHERE id = '2090248955300884689'`;
    this.sql`UPDATE stories
      SET draft = '🚨 INJURY PULSE\n\nRachaad White tweaked his hamstring; not considered serious.\n\nFANTASY IMPACT: Preseason: track Rachaad White''s recovery, not the waiver wire. If the absence lingers, Jacory Croskey-Merritt is the primary workload beneficiary. Kaytron Allen is the deeper contingency.\n\nReported by @MikeGarafolo',
          related_players_json = '[{"id":"8136","name":"Rachaad White","position":"RB","team":"WAS","relationship":"subject"},{"id":"12533","name":"Jacory Croskey-Merritt","position":"RB","team":"WAS","relationship":"beneficiary"},{"id":"13405","name":"Kaytron Allen","position":"RB","team":"WAS","relationship":"backup"}]'
      WHERE id = '2090248955300884689'`;
    this.sql`UPDATE stories
      SET status = 'suppressed', error = 'Preseason practice roundup incorrectly classified as game performance'
      WHERE parent_story_id = '2090288557701074968' AND category = 'performance'`;
    this.sql`UPDATE stories
      SET title = 'Kayshon Boutte is a potential trade candidate for Houston after Jayden Higgins'' injury.',
          category = 'contract',
          draft = '📝 ROSTER MOVE\n\nKayshon Boutte is a potential trade candidate for Houston after Jayden Higgins'' injury.\n\nFANTASY IMPACT: Treat this as a watchlist item, not a value change. Hold Kayshon Boutte at the current price until a deal is reported; then reassess his path to touches and both teams'' depth charts.',
          confidence = 'medium', lifecycle_stage = 'initial', error = NULL,
          related_players_json = '[{"id":"9504","name":"Kayshon Boutte","position":"WR","team":"NE","relationship":"subject"},{"id":"12484","name":"Jayden Higgins","position":"WR","team":"HOU","relationship":"beneficiary"}]'
      WHERE id = '2090493186653249579'`;
    this.sql`UPDATE stories
      SET draft = REPLACE(
        draft,
        'Tyler Warren is dealing with a groin injury. No immediate waiver move. Monitor Tyler Warren''s practice status; if ruled out, reassess Mo Alie-Cox and Will Mallory and other IND playmakers.',
        'Preseason: track Tyler Warren''s recovery, not the waiver wire. If the absence lingers, Josh Downs is the target-share watch. Mo Alie-Cox is depth-chart insurance.'
      )
      WHERE id = '2090189865996443824'`;
    this.sql`UPDATE stories
      SET title = 'Drake Maye went 9-of-18 with four touchdowns and two interceptions in 11-on-11 work vs. the Eagles.',
          draft = '🏈 FANTASY PULSE\n\nDrake Maye went 9-of-18 with four touchdowns and two interceptions in 11-on-11 work vs. the Eagles.\n\nFANTASY IMPACT: Treat this as one joint-practice sample, not a game result. Track Drake Maye''s accuracy, first-team reps and passing volume across multiple sessions before moving projections.'
      WHERE id = '2090470400706609501'`;
    this.sql`INSERT OR REPLACE INTO agent_meta (key, value) VALUES ('draft_format', ${DRAFT_FORMAT_VERSION})`;
  }

  async onStart() {
    this.sql`CREATE TABLE IF NOT EXISTS stories (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      source TEXT NOT NULL,
      category TEXT NOT NULL,
      published_at TEXT NOT NULL,
      discovered_at TEXT NOT NULL,
      draft TEXT,
      status TEXT NOT NULL,
      x_post_id TEXT,
      error TEXT
    )`;
    this.ensureStorySchema();
    this.migrateDraftFormat();
    this.sql`CREATE TABLE IF NOT EXISTS source_accounts (
      username TEXT PRIMARY KEY,
      x_user_id TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`;
    const interval = Math.max(300, Number(this.env.POLL_INTERVAL_SECONDS || 300));
    const pollingSchedules = this.getSchedules().filter((schedule) => schedule.callback === "runCycle");
    const matchingSchedule = pollingSchedules.find((schedule) => schedule.type === "interval" && schedule.intervalSeconds === interval);
    for (const schedule of pollingSchedules) {
      if (schedule.id !== matchingSchedule?.id) await this.cancelSchedule(schedule.id);
    }
    if (!matchingSchedule) await this.scheduleEvery(interval, "runCycle", { trigger: "schedule" });
    this.setState({
      ...this.state,
      startedAt: this.state.startedAt ?? new Date().toISOString(),
      mode: this.mode(),
    });
  }

  private mode(): "preview" | "live" {
    return String(this.env.POSTING_MODE) === "live" ? "live" : "preview";
  }

  private credentials(): XCredentials {
    return {
      apiKey: this.env.X_API_KEY,
      apiSecret: this.env.X_API_SECRET,
      accessToken: this.env.X_ACCESS_TOKEN,
      accessTokenSecret: this.env.X_ACCESS_TOKEN_SECRET,
      bearerToken: this.env.X_BEARER_TOKEN,
    };
  }

  private handles() {
    return this.env.X_SOURCE_HANDLES.split(",").map((handle) => handle.trim().replace(/^@/, "")).filter(Boolean);
  }

  private async sourceStories(): Promise<Story[]> {
    type TweetUrl = { expanded_url?: string; unwound_url?: string; url?: string };
    type SourceTweet = { id: string; text: string; created_at?: string; author_id?: string; referenced_tweets?: Array<{ type: string; id: string }>; entities?: { urls?: TweetUrl[] } };
    const handles = this.handles();
    const known = [...this.sql<{ username: string; x_user_id: string }>`SELECT username, x_user_id FROM source_accounts`];
    const ids = new Map(known.map((account) => [account.username.toLowerCase(), account.x_user_id]));
    const missing = handles.filter((handle) => !ids.has(handle.toLowerCase()));
    if (missing.length) {
      const lookup = await xApiGet<{ data?: Array<{ id: string; username: string }> }>(
        "https://api.x.com/2/users/by",
        { usernames: missing.join(",") },
        this.credentials(),
      );
      for (const account of lookup.data ?? []) {
        ids.set(account.username.toLowerCase(), account.id);
        this.sql`INSERT OR REPLACE INTO source_accounts (username, x_user_id, updated_at)
          VALUES (${account.username.toLowerCase()}, ${account.id}, ${new Date().toISOString()})`;
      }
    }
    const timelines = await Promise.all(handles.map(async (handle) => {
      const userId = ids.get(handle.toLowerCase());
      if (!userId) return [];
      const timeline = await xApiGet<{
        data?: SourceTweet[];
        includes?: {
          tweets?: SourceTweet[];
          users?: Array<{ id: string; username: string }>;
        };
      }>(
        `https://api.x.com/2/users/${userId}/tweets`,
        {
          "tweet.fields": "created_at,author_id,referenced_tweets,context_annotations,conversation_id,entities,display_text_range,lang",
          "user.fields": "username",
          expansions: "referenced_tweets.id,referenced_tweets.id.author_id",
          "max_results": "10",
          exclude: handle.toLowerCase() === "32beatwriters" ? "replies" : "retweets,replies",
        },
        this.credentials(),
      );
      const referencedPosts = new Map((timeline.includes?.tweets ?? []).map((post) => [post.id, post]));
      const includedUsers = new Map((timeline.includes?.users ?? []).map((user) => [user.id, user]));
      return (timeline.data ?? []).flatMap((post): Story[] => {
        const cleanText = post.text.replace(/https:\/\/t\.co\/\w+/g, "").replace(/^RT\s+@\w+:\s*/i, "").trim();
        const reference = post.referenced_tweets?.find((item) => item.type === "quoted")
          ?? post.referenced_tweets?.find((item) => item.type === "retweeted");
        const referencedPost = reference ? referencedPosts.get(reference.id) : undefined;
        const referencedText = referencedPost?.text.replace(/https:\/\/t\.co\/\w+/g, "").trim() ?? "";
        const originalReporter = referencedPost?.author_id ? includedUsers.get(referencedPost.author_id) : undefined;
        const curated = handle.toLowerCase() === "32beatwriters";
        const primaryText = curated && referencedText ? referencedText : cleanText;
        const contextText = curated && referencedText ? referencedText : primaryText;
        const primaryPost = curated && referencedPost ? referencedPost : post;
        const sourceUrls = (primaryPost.entities?.urls ?? []).flatMap((entity) => [entity.expanded_url, entity.unwound_url, entity.url].filter((url): url is string => Boolean(url)));
        if (isLiveContentPost(primaryText, sourceUrls)) return [];
        const originalUrl = curated && reference && originalReporter
          ? `https://x.com/${originalReporter.username}/status/${reference.id}`
          : `https://x.com/${handle}/status/${post.id}`;
        const updates = splitAtomicUpdates(primaryText);
        const parentIsPractice = isPracticeSetting(`${cleanText} ${primaryText}`);
        return updates.map((update, index) => {
          const category = categorizeStory(update);
          return ({
          id: updates.length === 1 ? post.id : `${post.id}:${index + 1}`,
          parentId: post.id,
          title: update,
          summary: update,
          url: originalUrl,
          source: `@${handle}`,
          publishedAt: post.created_at ?? new Date().toISOString(),
          category: parentIsPractice && category === "performance" ? "news" : category,
          reporter: originalReporter ? `@${originalReporter.username}` : curated ? "@32BeatWriters" : undefined,
          curator: curated ? "@32BeatWriters" : undefined,
          sourceContext: parentIsPractice ? ["practice"] : undefined,
        });
        });
      });
    }));
    return timelines.flat();
  }

  private eligibleToPost(gameDay: boolean) {
    const minimumGap = gameDay ? 0 : Math.max(12, Number(this.env.MIN_POST_INTERVAL_MINUTES || 12)) * 60_000;
    if (this.state.lastPostAt && Date.now() - Date.parse(this.state.lastPostAt) < minimumGap) return false;
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const [{ count }] = this.sql<{ count: number }>`SELECT COUNT(*) AS count FROM stories
      WHERE status IN ('posted', 'posted_suppressed') AND discovered_at >= ${start.toISOString()}`;
    const dailyLimit = gameDay ? Number(this.env.GAMEDAY_MAX_POSTS_PER_DAY || 100) : Number(this.env.MAX_POSTS_PER_DAY || 20);
    return Number(count) < Math.max(1, dailyLimit);
  }

  private async enrichStory(story: Story, context: Awaited<ReturnType<typeof findPlayerContext>>) {
    if (!context) return story;
    if (story.category === "contract" && isPotentialTradeStory(`${story.title} ${story.summary}`)) return story;
    try {
      const isCurated = story.source.toLowerCase() === "@32beatwriters";
      const candidates = [...new Set([...context.affectedPlayers, ...context.backups])].slice(0, 5);
      const result = await this.env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
        messages: [
          {
            role: "system",
            content: "You are Fantasy Hub's sharp, conversational fantasy-football editor. Write like a knowledgeable human analyst, not a template. Stay strictly inside the supplied evidence. Distinguish practice from games, observation from confirmation, and preseason from lineup season. Never invent stats, injuries, transactions, roles, teammates, or recommendations. Return JSON only.",
          },
          {
            role: "user",
            content: `Player: ${context.player} (${context.position}, ${context.team})\nCategory: ${story.category}\nPublished: ${story.publishedAt}\nSetting: ${isPracticeSetting(`${story.title} ${story.summary}`) ? "practice/camp" : "not identified as practice"}\nPotentially affected players you may name: ${candidates.length ? candidates.join(", ") : "none supplied"}\nSource material: ${story.title} ${story.summary}\n\nWrite a factual headline under 130 characters${isCurated ? " that paraphrases the source" : ""} and a fantasyImpact under 230 characters in one or two natural sentences. State the practical fantasy meaning and one concrete action now. If no action is warranted, say to hold and identify the specific future development that would change the decision. Injury advice must reflect timing, severity, and season phase. Practice stats are samples, not game production. Only recommend named players from the supplied list. Avoid canned phrases such as “adjust projections,” “monitor the depth chart,” “compare routes, targets and snaps,” or generic metric checklists. Vary the rhythm and opening from post to post.`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            type: "object",
            properties: {
              headline: { type: "string" },
              fantasyImpact: { type: "string" },
            },
            required: ["headline", "fantasyImpact"],
            additionalProperties: false,
          },
        },
        max_tokens: 220,
        temperature: 0.25,
      });
      const raw = result && typeof result === "object" && "response" in result ? result.response : undefined;
      if (typeof raw !== "string") return story;
      const parsed = JSON.parse(raw) as { headline?: unknown; fantasyImpact?: unknown };
      if (typeof parsed.headline !== "string" || typeof parsed.fantasyImpact !== "string") return story;
      const headline = parsed.headline.replace(/\s+/g, " ").trim();
      const fantasyImpact = parsed.fantasyImpact.replace(/\s+/g, " ").trim();
      if (!headline || headline.length > 130 || !fantasyImpact || fantasyImpact.length > 230) return story;
      return { ...story, title: headline, fantasyImpact };
    } catch (error) {
      console.warn(JSON.stringify({ event: "story_enrichment_fallback", storyId: story.id, error: error instanceof Error ? error.message : "Unknown enrichment error" }));
      return story;
    }
  }

  private async critiqueForPublishing(story: Story, context: Awaited<ReturnType<typeof findPlayerContext>>, draft: string, facts: StoryFacts, validation: ValidationResult) {
    if (!validation.approvedForX) return validation;
    try {
      const result = await this.env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
        messages: [
          { role: "system", content: "You are the final editor for a fantasy-football news account. Reject a post if it overstates the source, misclassifies the event, recommends an injured, unavailable, or unlisted teammate, ignores preseason versus regular-season timing, gives vague boilerplate advice, or makes an action recommendation unsupported by the evidence. Return JSON only." },
          { role: "user", content: `Source evidence: ${story.summary}\nStructured facts: ${JSON.stringify(facts)}\nAllowed affected-player names: ${JSON.stringify(context ? [...new Set([...context.affectedPlayers, ...context.backups])] : [])}\nDraft: ${draft}\nApprove only when every factual claim and recommendation is supported and the fantasy impact gives a specific, useful next step.` },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            type: "object",
            properties: { approved: { type: "boolean" }, reasons: { type: "array", items: { type: "string" }, maxItems: 4 } },
            required: ["approved", "reasons"],
            additionalProperties: false,
          },
        },
        max_tokens: 140,
        temperature: 0,
      });
      const raw = result && typeof result === "object" && "response" in result ? result.response : undefined;
      if (typeof raw !== "string") return validation;
      const parsed = JSON.parse(raw) as { approved?: unknown; reasons?: unknown };
      if (typeof parsed.approved !== "boolean" || !Array.isArray(parsed.reasons)) return validation;
      const reasons = parsed.reasons.filter((reason): reason is string => typeof reason === "string").slice(0, 4);
      return parsed.approved ? validation : { approvedForX: false, reasons: reasons.length ? reasons : ["AI critic rejected the publishing draft"] };
    } catch (error) {
      console.warn(JSON.stringify({ event: "publishing_critic_fallback", storyId: story.id, error: error instanceof Error ? error.message : "Unknown critic error" }));
      return validation;
    }
  }

  private async regenerateCurrentFeed() {
    const regenerationKey = "regenerated_feed_v36-preserve-trade-uncertainty";
    const [completed] = [...this.sql<{ value: string }>`SELECT value FROM agent_meta WHERE key = ${regenerationKey} LIMIT 1`];
    if (completed?.value === "complete") return;
    const stories = [...this.sql<{ id: string; title: string; url: string; source: string; category: Story["category"]; published_at: string; status: string }>`
      SELECT id, title, url, source, category, published_at, status FROM stories
      WHERE status IN ('draft', 'posted')
      ORDER BY published_at DESC LIMIT 100`];
    const processedPrefix = `${regenerationKey}:`;
    const processed = new Set([...this.sql<{ key: string }>`SELECT key FROM agent_meta WHERE key LIKE ${`${processedPrefix}%`}`].map((row) => row.key.slice(processedPrefix.length)));
    const batch = stories.filter((story) => !processed.has(story.id)).slice(0, 2);
    for (const stored of batch) {
      const [evidence] = [...this.sql<{ title: string; url: string; source: string; published_at: string }>`
        SELECT title, url, source, published_at FROM story_evidence
        WHERE story_id = ${stored.id} ORDER BY published_at DESC LIMIT 1`];
      const sourceText = evidence?.title || stored.title;
      const sourceUrl = evidence?.url || stored.url;
      if (isLiveContentPost(sourceText, [sourceUrl])) {
        this.sql`UPDATE stories SET status = CASE WHEN status = 'posted' THEN 'posted_suppressed' ELSE 'suppressed' END, error = 'Live or media-dependent source cannot be summarized reliably' WHERE id = ${stored.id}`;
        this.sql`INSERT OR REPLACE INTO agent_meta (key, value) VALUES (${`${processedPrefix}${stored.id}`}, 'complete')`;
        continue;
      }
      const sourceCategory = categorizeStory(sourceText);
      const context = await findPlayerContext(sourceText, sourceCategory);
      if (!context) {
        this.sql`UPDATE stories SET status = CASE WHEN status = 'posted' THEN 'posted_suppressed' ELSE 'suppressed' END, error = 'No fantasy-relevant player resolved during feed regeneration' WHERE id = ${stored.id}`;
        this.sql`INSERT OR REPLACE INTO agent_meta (key, value) VALUES (${`${processedPrefix}${stored.id}`}, 'complete')`;
        continue;
      }
      const sourceStory: Story = {
        id: stored.id,
        title: sourceText,
        summary: sourceText,
        url: sourceUrl,
        source: evidence?.source || stored.source,
        publishedAt: evidence?.published_at || stored.published_at,
        category: sourceCategory,
      };
      const prepared = await this.enrichStory(sourceStory, context);
      const draft = composeFantasyPost(prepared, context);
      const facts = extractStoryFacts(prepared, context);
      const validation = await this.critiqueForPublishing(prepared, context, draft, facts, validateStoryDraft(prepared, context, draft, facts));
      if (!validation.approvedForX) {
        this.sql`UPDATE stories SET status = CASE WHEN status = 'posted' THEN 'posted_suppressed' ELSE 'suppressed' END, error = ${validation.reasons.join('; ')}, validation_json = ${JSON.stringify(validation)} WHERE id = ${stored.id}`;
        this.sql`INSERT OR REPLACE INTO agent_meta (key, value) VALUES (${`${processedPrefix}${stored.id}`}, 'complete')`;
        continue;
      }
      this.sql`UPDATE stories SET
        title = ${prepared.title}, category = ${prepared.category}, draft = ${draft}, confidence = ${facts.confidence}, lifecycle_stage = ${facts.lifecycleStage},
        facts_json = ${JSON.stringify(facts)}, validation_json = ${JSON.stringify(validation)}, related_players_json = ${JSON.stringify(context.relatedPlayers)}, error = NULL
        WHERE id = ${stored.id}`;
      this.sql`INSERT OR REPLACE INTO agent_meta (key, value) VALUES (${`${processedPrefix}${stored.id}`}, 'complete')`;
    }
    if (!batch.length || processed.size + batch.length >= stories.length) {
      this.sql`INSERT OR REPLACE INTO agent_meta (key, value) VALUES (${regenerationKey}, 'complete')`;
    }
  }

  private recentDrafts() {
    this.ensureStorySchema();
    return [...this.sql<{ id: string; title: string; source: string; category: string; draft: string; status: string; published_at: string; x_post_id: string | null }>`
      SELECT id, title, source, category, draft, status, published_at, x_post_id, confidence, lifecycle_stage, source_count, facts_json, validation_json, related_players_json
      FROM stories ORDER BY discovered_at DESC LIMIT 20`];
  }

  async publicFeed() {
    this.ensureStorySchema();
    this.migrateDraftFormat();
    await this.regenerateCurrentFeed();
    const stories = [...this.sql<StoredStory>`
      SELECT id, title, source, category, draft, status, published_at, confidence, lifecycle_stage, related_players_json, source_count
      FROM stories
      WHERE status IN ('draft', 'posted') AND draft IS NOT NULL
      ORDER BY published_at DESC LIMIT 100`];
    const hydratedStories = await Promise.all(stories.filter((story) => !RETRACTED_STORY_IDS.includes(story.id)).map(async (story) => {
      const savedPlayers = parseJson<Array<{ id: string; name: string; position: string; team: string; relationship: "subject" | "beneficiary" | "backup" }>>(story.related_players_json, []);
      if (savedPlayers.length || story.category === "weather") return story;
      const context = await findPlayerContext(`${story.title}. ${story.draft ?? ""}`, story.category);
      if (!context?.relatedPlayers.length) return story;
      const relatedPlayersJson = JSON.stringify(context.relatedPlayers);
      this.sql`UPDATE stories SET related_players_json = ${relatedPlayersJson} WHERE id = ${story.id}`;
      return { ...story, related_players_json: relatedPlayersJson };
    }));
    return {
      updatedAt: this.state.lastRunAt,
      items: filterRedundantFeedStories(hydratedStories).map(feedStory),
    };
  }

  async status() {
    return { state: this.state, postingConfigured: Boolean(this.env.X_API_KEY && this.env.X_ACCESS_TOKEN), recent: this.recentDrafts() };
  }

  async runCycle(_payload?: { trigger: string }) {
    const now = new Date();
    try {
      const gameDay = await isNflRegularOrPostseasonGameDay();
      this.ensureStorySchema();
      this.migrateDraftFormat();
      // Remove drafts created by the retired RSS source. X-origin stories use an @handle.
      this.sql`DELETE FROM stories WHERE source NOT LIKE '@%' AND source != 'weather'`;
      const cutoff = now.getTime() - RECENT_STORY_HOURS * 60 * 60 * 1000;
      const candidates = [...await this.sourceStories(), ...await gameDayWeatherStories()]
        .filter((story) => !RETRACTED_STORY_IDS.includes(story.id))
        .filter(isFantasyRelevant)
        .filter((story) => story.category !== "performance" || (!isPracticeSetting(`${story.title} ${story.summary}`) && !story.sourceContext?.includes("practice")))
        .filter((story) => !gameDay || story.category !== "performance" || isSixPointFantasyPlay(story))
        .filter((story) => Date.parse(story.publishedAt) >= cutoff)
        .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));

      let selected: Story | null = null;
      const newlyCreated: Array<{ story: Story; approved: boolean }> = [];
      for (const story of candidates) {
        const existing = [...this.sql<{ id: string }>`SELECT id FROM stories WHERE id = ${story.id} LIMIT 1`];
        if (existing.length) continue;
        const context = story.category === "weather" ? null : await findPlayerContext(`${story.title} ${story.summary}`, story.category);
        if (!context && story.category !== "weather") continue;
        const storySemanticKey = context ? semanticKey(story, context) : story.id;
        const duplicateWindowMs = story.category === "performance" ? 20 * 60_000 : 24 * 60 * 60_000;
        const duplicateCutoff = new Date(Date.parse(story.publishedAt) - duplicateWindowMs).toISOString();
        const semanticDuplicate = [...this.sql<{ id: string; source_count: number | null; facts_json: string | null }>`SELECT id, source_count, facts_json FROM stories
          WHERE semantic_key = ${storySemanticKey} AND published_at >= ${duplicateCutoff}
          ORDER BY published_at DESC LIMIT 1`];
        const preparedStory = await this.enrichStory(story, context);
        const draft = composeFantasyPost(preparedStory, context);
        const facts = extractStoryFacts(preparedStory, context);
        const deterministicValidation = validateStoryDraft(preparedStory, context, draft, facts);
        const validation = Date.parse(preparedStory.publishedAt) >= now.getTime() - POST_FRESHNESS_MINUTES * 60_000
          ? await this.critiqueForPublishing(preparedStory, context, draft, facts, deterministicValidation)
          : deterministicValidation;
        const relatedPlayers = context?.relatedPlayers ?? (story.category === "weather" ? await findTeamFantasyPlayers(story.sourceContext ?? []) : []);
        const previousFacts = semanticDuplicate.length ? parseJson<StoryFacts | null>(semanticDuplicate[0].facts_json, null) : null;
        const materialUpdate = isMaterialStoryUpdate(previousFacts, facts, preparedStory);
        if (semanticDuplicate.length && !materialUpdate) {
          const canonical = semanticDuplicate[0];
          this.sql`INSERT OR IGNORE INTO story_evidence (story_id, source_story_id, source, url, title, published_at)
            VALUES (${canonical.id}, ${preparedStory.id}, ${preparedStory.source}, ${preparedStory.url}, ${story.title}, ${preparedStory.publishedAt})`;
          const [{ count }] = [...this.sql<{ count: number }>`SELECT COUNT(*) AS count FROM story_evidence WHERE story_id = ${canonical.id}`];
          this.sql`UPDATE stories SET source_count = ${Math.max(1, Number(count))}, lifecycle_stage = ${facts.lifecycleStage}
            WHERE id = ${canonical.id}`;
          continue;
        }
        this.sql`INSERT INTO stories (id, title, url, source, category, published_at, discovered_at, draft, status, semantic_key, parent_story_id, confidence, lifecycle_stage, facts_json, validation_json, related_players_json, source_count)
          VALUES (${preparedStory.id}, ${preparedStory.title}, ${preparedStory.url}, ${preparedStory.source}, ${preparedStory.category}, ${preparedStory.publishedAt}, ${now.toISOString()}, ${draft}, 'draft', ${storySemanticKey}, ${preparedStory.parentId ?? preparedStory.id}, ${facts.confidence}, ${facts.lifecycleStage}, ${JSON.stringify(facts)}, ${JSON.stringify(validation)}, ${JSON.stringify(relatedPlayers)}, 1)`;
        this.sql`INSERT OR IGNORE INTO story_evidence (story_id, source_story_id, source, url, title, published_at)
          VALUES (${preparedStory.id}, ${preparedStory.id}, ${preparedStory.source}, ${preparedStory.url}, ${story.title}, ${preparedStory.publishedAt})`;
        selected ??= preparedStory;
        newlyCreated.push({ story: preparedStory, approved: validation.approvedForX });
      }

      const mode = this.mode();
      const postFreshnessMinutes = gameDay ? GAMEDAY_POST_FRESHNESS_MINUTES : POST_FRESHNESS_MINUTES;
      const postFreshnessCutoff = now.getTime() - postFreshnessMinutes * 60_000;
      const publishableStories = newlyCreated.filter(({ story, approved }) => approved && Date.parse(story.publishedAt) >= postFreshnessCutoff).map(({ story }) => story);
      if (publishableStories.length && mode === "live" && this.eligibleToPost(gameDay)) {
        const credentials = this.credentials();
        if (Object.values(credentials).some((value) => !value)) throw new Error("X posting credentials are incomplete");
        const queue = gameDay ? publishableStories : publishableStories.slice(0, 1);
        let lastPostAt = this.state.lastPostAt;
        for (const story of queue) {
          if (!this.eligibleToPost(gameDay)) break;
          const [{ draft }] = [...this.sql<{ draft: string }>`SELECT draft FROM stories WHERE id = ${story.id} LIMIT 1`];
          const postId = await createXPost(draft, credentials);
          lastPostAt = new Date().toISOString();
          this.sql`UPDATE stories SET status = 'posted', x_post_id = ${postId}, error = NULL WHERE id = ${story.id}`;
        }
        this.setState({ ...this.state, lastRunAt: now.toISOString(), lastPostAt, lastError: null, mode });
      } else {
        this.setState({ ...this.state, lastRunAt: now.toISOString(), lastError: null, mode });
      }
      console.log(JSON.stringify({ event: "social_agent_cycle", mode, gameDay, candidates: candidates.length, selected: selected?.id ?? null }));
      return this.status();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown social agent failure";
      this.setState({ ...this.state, lastRunAt: now.toISOString(), lastError: message, mode: this.mode() });
      console.error(JSON.stringify({ event: "social_agent_error", error: message }));
      throw error;
    }
  }
}

async function authorized(request: Request, env: Env) {
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  return Boolean(env.ADMIN_TOKEN) && safeEqual(provided, env.ADMIN_TOKEN);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/dashboard") {
      return new Response(dashboardHtml, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          "content-security-policy": "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
          "x-content-type-options": "nosniff",
          "x-frame-options": "DENY",
          "referrer-policy": "no-referrer",
        },
      });
    }
    if (url.pathname === "/health") {
      const agent = await getAgentByName(env.SOCIAL_AGENT, "fantasy-hub");
      const current = await agent.status();
      const status = current.state.lastRunAt && current.recent.length > 0
        ? current
        : await agent.runCycle({ trigger: "health-bootstrap" });
      return Response.json({
        ok: !status.state.lastError,
        service: "fantasy-hub-social-agent",
        mode: status.state.mode,
        startedAt: status.state.startedAt,
        lastRunAt: status.state.lastRunAt,
        lastError: status.state.lastError,
        draftCount: status.recent.filter((story) => story.status === "draft").length,
      }, { status: status.state.lastError ? 503 : 200 });
    }
    if (url.pathname === "/feed" && request.method === "GET") {
      const agent = await getAgentByName(env.SOCIAL_AGENT, "fantasy-hub");
      return Response.json(await agent.publicFeed(), {
        headers: {
          "cache-control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
          "x-content-type-options": "nosniff",
        },
      });
    }
    if (!url.pathname.startsWith("/admin/") || !(await authorized(request, env))) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    const agent = await getAgentByName(env.SOCIAL_AGENT, "fantasy-hub");
    if (url.pathname === "/admin/start" && request.method === "POST") return Response.json(await agent.status());
    if (url.pathname === "/admin/run" && request.method === "POST") return Response.json(await agent.runCycle({ trigger: "manual" }));
    if (url.pathname === "/admin/status" && request.method === "GET") return Response.json(await agent.status());
    return Response.json({ error: "Not found" }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
