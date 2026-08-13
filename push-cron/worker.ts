export default {
  async fetch(request: Request, env: { TARGET_URL: string; PUSH_CRON_SECRET: string }) {
    if (new URL(request.url).pathname !== "/health") return new Response("Not found", { status: 404 });
    return Response.json({ ok: true, target: new URL(env.TARGET_URL).host });
  },
  async scheduled(_controller: ScheduledController, env: { TARGET_URL: string; PUSH_CRON_SECRET: string }, ctx: ExecutionContext) {
    ctx.waitUntil(fetch(env.TARGET_URL, { method: "POST", headers: { authorization: `Bearer ${env.PUSH_CRON_SECRET}` } }).then(async (response) => {
      if (!response.ok) throw new Error(`Fantasy Hub notification evaluator returned ${response.status}`);
      console.log(JSON.stringify({ event: "fantasy_hub_push_tick", result: await response.json() }));
    }));
  },
};
