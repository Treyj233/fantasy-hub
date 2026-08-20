const DEFAULT_FEED_URL = "https://fantasy-hub-social-agent.treyj233.workers.dev/feed";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await fetch(process.env.SOCIAL_AGENT_FEED_URL || DEFAULT_FEED_URL, {
      headers: { accept: "application/json" },
      next: { revalidate: 60 },
    });
    if (!response.ok) throw new Error(`News feed returned ${response.status}`);
    const payload = await response.json();
    return Response.json(payload, {
      headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (error) {
    console.error("news_notes_feed_error", error);
    return Response.json({ error: "News & Notes is refreshing. Try again shortly.", items: [] }, { status: 503 });
  }
}
