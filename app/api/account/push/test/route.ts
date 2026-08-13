import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { pushDevices } from "../../../../../db/schema";
import { sendApplePush } from "../../../../apns";
import { getChatGPTUser } from "../../../../chatgpt-auth";

async function temporaryAdminSecret() {
  let env: Record<string, unknown> = process.env as Record<string, unknown>;
  try { env = (await import("cloudflare:workers")).env as unknown as Record<string, unknown>; } catch { /* local tooling */ }
  return String(env.PUSH_ADMIN_TEST_TOKEN ?? "");
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  const db = await getDb();
  const testToken = request.headers.get("x-push-admin-token") ?? "";
  const adminSecret = await temporaryAdminSecret();
  const adminRequest = adminSecret.length >= 32 && testToken === adminSecret;
  if (!user && !adminRequest) return Response.json({ error: "Sign in required" }, { status: 401 });
  const devices = user
    ? await db.select().from(pushDevices).where(eq(pushDevices.userId, user.userId))
    : await db.select().from(pushDevices).where(eq(pushDevices.enabled, true)).orderBy(desc(pushDevices.lastSeenAt)).limit(1);
  if (!devices.length) return Response.json({ error: "Enable notifications on an iPhone first" }, { status: 409 });
  const results = await Promise.allSettled(devices.filter((device) => device.enabled).map((device) => sendApplePush(device.token, {
    title: "Fantasy Hub is ready",
    body: "Game-day alerts are connected to your account.",
    path: "/",
  })));
  const sent = results.filter((result) => result.status === "fulfilled").length;
  if (!sent) return Response.json({ error: results[0]?.status === "rejected" ? String(results[0].reason) : "No enabled devices" }, { status: 503 });
  return Response.json({ sent, failed: results.length - sent });
}
