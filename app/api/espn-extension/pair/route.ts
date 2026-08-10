import { getDb } from "../../../../db";
import { espnSyncPairings } from "../../../../db/schema";
import { getChatGPTUser } from "../../../chatgpt-auth";

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function createPairingCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

async function hashCode(code: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function POST() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const compactCode = createPairingCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const db = await getDb();
  await db.insert(espnSyncPairings).values({
    id: crypto.randomUUID(),
    userId: user.userId,
    codeHash: await hashCode(compactCode),
    expiresAt,
  });
  return Response.json({
    code: `${compactCode.slice(0, 4)}-${compactCode.slice(4, 8)}-${compactCode.slice(8)}`,
    expiresAt,
  });
}
