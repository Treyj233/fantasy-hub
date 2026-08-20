const DEFAULT_FEED_URL = "https://fantasy-hub-social-agent.treyj233.workers.dev/feed";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await fetch(process.env.SOCIAL_AGENT_FEED_URL || DEFAULT_FEED_URL, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`News feed returned ${response.status}`);
    const payload = await response.json();
    return Response.json(payload, {
      headers: { "cache-control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    console.error("news_notes_feed_error", error);
    return Response.json(
      { error: "News & Notes is refreshing. Try again shortly.", items: [] },
      { status: 503, headers: { "cache-control": "private, no-store, max-age=0" } },
    );
  }
}
