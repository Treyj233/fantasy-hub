import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { pushDevices } from "../../../../db/schema";
import { getChatGPTUser } from "../../../chatgpt-auth";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const db = await getDb();
  const devices = await db.select({ enabled: pushDevices.enabled, platform: pushDevices.platform, lastSeenAt: pushDevices.lastSeenAt })
    .from(pushDevices).where(eq(pushDevices.userId, user.userId));
  return Response.json({ enabled: devices.some((device) => device.enabled), devices });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const body = await request.json().catch(() => null) as { token?: string; platform?: string } | null;
  const token = body?.token?.trim() ?? "";
  if (!/^[A-Za-z0-9:_-]{20,512}$/.test(token)) return Response.json({ error: "Invalid push token" }, { status: 400 });
  const now = new Date().toISOString();
  const record = { token, userId: user.userId, platform: body?.platform === "ios" ? "ios" : "ios", enabled: true, lastSeenAt: now };
  const db = await getDb();
  await db.insert(pushDevices).values(record).onConflictDoUpdate({ target: pushDevices.token, set: record });
  return Response.json({ registered: true, enabled: true });
}

export async function DELETE(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const body = await request.json().catch(() => null) as { token?: string } | null;
  const db = await getDb();
  if (body?.token) await db.delete(pushDevices).where(and(eq(pushDevices.userId, user.userId), eq(pushDevices.token, body.token)));
  else await db.delete(pushDevices).where(eq(pushDevices.userId, user.userId));
  return Response.json({ enabled: false });
}
