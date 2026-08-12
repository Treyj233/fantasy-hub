import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../../db";
import { appStoreTransactions, subscriptions } from "../../../../db/schema";
import { verifyAppleTransaction } from "../../../app-store";
import { getChatGPTUser } from "../../../chatgpt-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const body = await request.json().catch(() => null) as { transactionId?: string } | null;
  const transactionId = body?.transactionId?.trim();
  if (!transactionId || !/^\d{5,40}$/.test(transactionId))
    return Response.json({ error: "A valid App Store transaction is required" }, { status: 400 });
  try {
    const verified = await verifyAppleTransaction(transactionId);
    const db = await getDb();
    const [claimed] = await db.select().from(appStoreTransactions)
      .where(eq(appStoreTransactions.originalTransactionId, verified.originalTransactionId)).limit(1);
    if (claimed && claimed.userId !== user.userId)
      return Response.json({ error: "This App Store subscription belongs to another Fantasy Hub account" }, { status: 409 });
    const now = new Date();
    const active = !verified.revokedAt && (!verified.expiresAt || new Date(verified.expiresAt) > now);
    const transactionRecord = { ...verified, userId: user.userId, updatedAt: now.toISOString() };
    await db.insert(appStoreTransactions).values(transactionRecord).onConflictDoUpdate({
      target: appStoreTransactions.originalTransactionId,
      set: transactionRecord,
    });
    const subscriptionRecord = {
      userId: user.userId,
      email: user.email,
      plan: active ? "pro" : "free",
      status: active ? "active" : "canceled",
      provider: "apple",
      providerCustomerId: null,
      providerSubscriptionId: verified.originalTransactionId,
      currentPeriodEnd: verified.expiresAt,
      updatedAt: now.toISOString(),
    };
    await db.insert(subscriptions).values(subscriptionRecord).onConflictDoUpdate({
      target: subscriptions.userId,
      set: subscriptionRecord,
    });
    return Response.json({ verified: true, active, productId: verified.productId, currentPeriodEnd: verified.expiresAt });
  } catch (error) {
    console.error("App Store transaction verification failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "Unable to verify App Store purchase" }, { status: 503 });
  }
}

export async function DELETE() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const db = await getDb();
  const [subscription] = await db.select().from(subscriptions).where(and(
    eq(subscriptions.userId, user.userId), inArray(subscriptions.provider, ["apple", "app_store"]),
  )).limit(1);
  return Response.json({ appStoreManaged: Boolean(subscription), manageInApp: true });
}
