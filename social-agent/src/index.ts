import { Agent, getAgentByName } from "agents";
import { categorizeStory, composeFantasyPost, isFantasyRelevant, isSixPointFantasyPlay, type Story } from "./content";
import { createXPost, xApiGet, type XCredentials } from "./x-client";
import { findPlayerContext } from "./player-data";
import { gameDayWeatherStories } from "./weather";
import { isNflRegularOrPostseasonGameDay } from "./game-day";
import { dashboardHtml } from "./dashboard";

type AgentState = {
  startedAt: string | null;
  lastRunAt: string | null;
  lastPostAt: string | null;
  lastError: string | null;
  mode: "preview" | "live";
};

const RECENT_STORY_HOURS = 18;
const DRAFT_FORMAT_VERSION = "x-sources-v12-actionable-original-attribution";
const RETRACTED_STORY_IDS = ["2090186160634986677"];

type StoredStory = {
  id: string;
  title: string;
  source: string;
  category: string;
  draft: string | null;
  status: string;
  published_at: string;
};

const feedStory = (story: StoredStory) => {
  const sections = (story.draft || "").split(/\n{2,}/).map((section) => section.trim()).filter(Boolean);
  const titleSection = sections[0] || "🏈 FANTASY PULSE";
  const titleMatch = titleSection.match(/^(\p{Extended_Pictographic}(?:\uFE0F)?(?:\u200D\p{Extended_Pictographic})*)?\s*(.*)$/u);
  const impactSection = sections.find((section) => /^FANTASY IMPACT:/i.test(section)) || "";
  const impact = impactSection.replace(/^FANTASY IMPACT:\s*/i, "").trim();
  const reporterSection = sections.find((section) => /^(?:Reported|Curated) by\s+/i.test(section));
  const sentences = impact.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((sentence) => sentence.trim()).filter(Boolean) || [];
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
  };
};

const semanticKey = (story: Story, player: { player: string; team: string; position: string }) =>
  [player.player, player.team, player.position, story.category]
    .map((value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-"))
    .join(":");

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

  private migrateDraftFormat() {
    this.sql`CREATE TABLE IF NOT EXISTS agent_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`;
    const [format] = [...this.sql<{ value: string }>`SELECT value FROM agent_meta WHERE key = 'draft_format' LIMIT 1`];
    if (format?.value === DRAFT_FORMAT_VERSION) return;
    this.sql`DELETE FROM stories WHERE status = 'draft'`;
    for (const storyId of RETRACTED_STORY_IDS) this.sql`DELETE FROM stories WHERE id = ${storyId}`;
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
        data?: Array<{ id: string; text: string; created_at?: string; author_id?: string; referenced_tweets?: Array<{ type: string; id: string }> }>;
        includes?: {
          tweets?: Array<{ id: string; text: string; author_id?: string }>;
          users?: Array<{ id: string; username: string }>;
        };
      }>(
        `https://api.x.com/2/users/${userId}/tweets`,
        {
          "tweet.fields": "created_at,author_id,referenced_tweets",
          "user.fields": "username",
          expansions: "referenced_tweets.id,referenced_tweets.id.author_id",
          "max_results": "10",
          exclude: handle.toLowerCase() === "32beatwriters" ? "replies" : "retweets,replies",
        },
        this.credentials(),
      );
      const referencedPosts = new Map((timeline.includes?.tweets ?? []).map((post) => [post.id, post]));
      const includedUsers = new Map((timeline.includes?.users ?? []).map((user) => [user.id, user]));
      return (timeline.data ?? []).map((post): Story => {
        const cleanText = post.text.replace(/https:\/\/t\.co\/\w+/g, "").replace(/^RT\s+@\w+:\s*/i, "").replace(/\s+/g, " ").trim();
        const reference = post.referenced_tweets?.find((item) => item.type === "quoted")
          ?? post.referenced_tweets?.find((item) => item.type === "retweeted");
        const referencedPost = reference ? referencedPosts.get(reference.id) : undefined;
        const referencedText = referencedPost?.text.replace(/https:\/\/t\.co\/\w+/g, "").replace(/\s+/g, " ").trim() ?? "";
        const originalReporter = referencedPost?.author_id ? includedUsers.get(referencedPost.author_id) : undefined;
        const curated = handle.toLowerCase() === "32beatwriters";
        const primaryText = curated && referencedText ? referencedText : cleanText;
        const contextText = curated && referencedText ? referencedText : primaryText;
        const originalUrl = curated && reference && originalReporter
          ? `https://x.com/${originalReporter.username}/status/${reference.id}`
          : `https://x.com/${handle}/status/${post.id}`;
        return {
          id: post.id,
          title: primaryText,
          summary: contextText,
          url: originalUrl,
          source: `@${handle}`,
          publishedAt: post.created_at ?? new Date().toISOString(),
          category: categorizeStory(contextText),
          reporter: originalReporter ? `@${originalReporter.username}` : curated ? "@32BeatWriters" : undefined,
          curator: curated ? "@32BeatWriters" : undefined,
        };
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
      WHERE status = 'posted' AND discovered_at >= ${start.toISOString()}`;
    const dailyLimit = gameDay ? Number(this.env.GAMEDAY_MAX_POSTS_PER_DAY || 100) : Number(this.env.MAX_POSTS_PER_DAY || 20);
    return Number(count) < Math.max(1, dailyLimit);
  }

  private async enrichCuratedStory(story: Story, context: Awaited<ReturnType<typeof findPlayerContext>>) {
    if (story.source.toLowerCase() !== "@32beatwriters" || !context) return story;
    try {
      const result = await this.env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
        messages: [
          {
            role: "system",
            content: "You edit a fantasy-football news wire. Paraphrase the evidence; never copy a full quote. Explain only what the report reasonably implies. Distinguish observation from confirmation, avoid certainty when a role is not official, and never invent stats, injuries, transactions, depth-chart facts, or recommendations. Return JSON only.",
          },
          {
            role: "user",
            content: `Player: ${context.player} (${context.position}, ${context.team})\nCategory: ${story.category}\nSource material: ${story.title} ${story.summary}\nWrite a headline under 130 characters and a fantasyImpact under 230 characters. For injury news, retain the reported body part or diagnosis, absence/practice context, and severity or timetable when the source provides them. The impact must say what the report implies and the appropriate action (monitor, adjust projection, waiver, draft, or lineup) with calibrated confidence.`,
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
        max_tokens: 180,
        temperature: 0.1,
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
      console.warn(JSON.stringify({ event: "curated_story_enrichment_fallback", storyId: story.id, error: error instanceof Error ? error.message : "Unknown enrichment error" }));
      return story;
    }
  }

  private recentDrafts() {
    return [...this.sql<{ id: string; title: string; source: string; category: string; draft: string; status: string; published_at: string; x_post_id: string | null }>`
      SELECT id, title, source, category, draft, status, published_at, x_post_id
      FROM stories ORDER BY discovered_at DESC LIMIT 20`];
  }

  async publicFeed() {
    const stories = [...this.sql<StoredStory>`
      SELECT id, title, source, category, draft, status, published_at
      FROM stories
      WHERE status IN ('draft', 'posted') AND draft IS NOT NULL
      ORDER BY published_at DESC LIMIT 30`];
    return {
      updatedAt: this.state.lastRunAt,
      items: stories.map(feedStory),
    };
  }

  async status() {
    return { state: this.state, postingConfigured: Boolean(this.env.X_API_KEY && this.env.X_ACCESS_TOKEN), recent: this.recentDrafts() };
  }

  async runCycle(_payload?: { trigger: string }) {
    const now = new Date();
    try {
      const gameDay = await isNflRegularOrPostseasonGameDay();
      this.migrateDraftFormat();
      const storyColumns = [...this.sql<{ name: string }>`PRAGMA table_info(stories)`];
      if (!storyColumns.some((column) => column.name === "semantic_key")) {
        this.sql`ALTER TABLE stories ADD COLUMN semantic_key TEXT`;
      }
      // Remove drafts created by the retired RSS source. X-origin stories use an @handle.
      this.sql`DELETE FROM stories WHERE source NOT LIKE '@%' AND source != 'weather'`;
      const cutoff = now.getTime() - RECENT_STORY_HOURS * 60 * 60 * 1000;
      const candidates = [...await this.sourceStories(), ...await gameDayWeatherStories()]
        .filter(isFantasyRelevant)
        .filter((story) => !gameDay || story.category !== "performance" || isSixPointFantasyPlay(story))
        .filter((story) => Date.parse(story.publishedAt) >= cutoff)
        .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));

      let selected: Story | null = null;
      const newlyCreated: Story[] = [];
      for (const story of candidates) {
        const existing = [...this.sql<{ id: string }>`SELECT id FROM stories WHERE id = ${story.id} LIMIT 1`];
        if (existing.length) continue;
        const context = story.category === "weather" ? null : await findPlayerContext(`${story.title} ${story.summary}`);
        if (!context && story.category !== "weather") continue;
        const storySemanticKey = context ? semanticKey(story, context) : story.id;
        const duplicateWindowMs = story.category === "performance" ? 20 * 60_000 : 24 * 60 * 60_000;
        const duplicateCutoff = new Date(Date.parse(story.publishedAt) - duplicateWindowMs).toISOString();
        const semanticDuplicate = [...this.sql<{ id: string }>`SELECT id FROM stories
          WHERE semantic_key = ${storySemanticKey} AND published_at >= ${duplicateCutoff}
          ORDER BY published_at DESC LIMIT 1`];
        if (semanticDuplicate.length) continue;
        const preparedStory = await this.enrichCuratedStory(story, context);
        const draft = composeFantasyPost(preparedStory, context);
        this.sql`INSERT INTO stories (id, title, url, source, category, published_at, discovered_at, draft, status, semantic_key)
          VALUES (${preparedStory.id}, ${preparedStory.title}, ${preparedStory.url}, ${preparedStory.source}, ${preparedStory.category}, ${preparedStory.publishedAt}, ${now.toISOString()}, ${draft}, 'draft', ${storySemanticKey})`;
        selected ??= preparedStory;
        newlyCreated.push(preparedStory);
      }

      const mode = this.mode();
      if (selected && mode === "live" && this.eligibleToPost(gameDay)) {
        const credentials = this.credentials();
        if (Object.values(credentials).some((value) => !value)) throw new Error("X posting credentials are incomplete");
        const freshnessCutoff = now.getTime() - 20 * 60_000;
        const queue = gameDay ? newlyCreated.filter((story) => Date.parse(story.publishedAt) >= freshnessCutoff) : [selected];
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
