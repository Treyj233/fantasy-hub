import { eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { pushDevices } from "../../../../../db/schema";
import { sendApplePush } from "../../../../apns";
import { getChatGPTUser } from "../../../../chatgpt-auth";

export async function POST() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const db = await getDb();
  const devices = await db.select().from(pushDevices).where(eq(pushDevices.userId, user.userId));
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
