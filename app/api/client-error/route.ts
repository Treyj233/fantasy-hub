import { getChatGPTUser } from "../../chatgpt-auth";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });

  const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
  const event = String(payload.event ?? "client_render_error").slice(0, 100);
  const level = event === "client_render_error" ? "error" : "info";
  console[level]("[client-product-event]", {
    event,
    user: user.email,
    message: String(payload.message ?? "Unknown client error").slice(0, 1000),
    digest: String(payload.digest ?? "").slice(0, 200),
    path: String(payload.path ?? "/").slice(0, 500),
    root: Boolean(payload.root),
    stack: String(payload.stack ?? "").slice(0, 4000),
    view: String(payload.view ?? "").slice(0, 100),
    durationMs: Number(payload.durationMs ?? 0),
    thresholdMs: Number(payload.thresholdMs ?? 0),
  });
  return Response.json({ received: true });
}
