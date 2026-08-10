import { getChatGPTUser } from "../../chatgpt-auth";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });

  const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
  console.error("[client-render-error]", {
    user: user.email,
    message: String(payload.message ?? "Unknown client error").slice(0, 1000),
    digest: String(payload.digest ?? "").slice(0, 200),
    path: String(payload.path ?? "/").slice(0, 500),
    root: Boolean(payload.root),
    stack: String(payload.stack ?? "").slice(0, 4000),
  });
  return Response.json({ received: true });
}
