import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../../db";
import { appStoreTransactions, subscriptions } from "../../../../db/schema";
import { verifyAppleTransaction } from "../../../app-store";
import { persistAppleEntitlement } from "../../../apple-entitlement-sync";
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
    if (claimed && claimed.userId !== user.userId) {
      const [previousSubscription] = await db.select({ email: subscriptions.email })
        .from(subscriptions)
        .where(eq(subscriptions.userId, claimed.userId))
        .limit(1);
      const previousEmail = previousSubscription?.email?.trim().toLowerCase();
      const currentEmail = user.email.trim().toLowerCase();
      const sameVerifiedEmail = Boolean(previousEmail && previousEmail === currentEmail);
      const isSandboxTransaction = verified.environment.trim().toLowerCase() === "sandbox";
      if (!sameVerifiedEmail && !isSandboxTransaction) {
        return Response.json({
          error: "This App Store subscription is linked to another Fantasy Hub login. Sign in with the Fantasy Hub email that originally claimed it, then restore purchases.",
        }, { status: 409 });
      }

      // Clerk can issue a new user ID for the same verified email after an auth
      // migration. TestFlight also reuses sandbox Apple subscriptions across
      // app logins on the same test device. Move either entitlement forward
      // while preventing duplicate access. Production purchases remain locked
      // to the original verified Fantasy Hub email.
      await db.update(subscriptions).set({
        plan: "free",
        status: "canceled",
        currentPeriodEnd: null,
        updatedAt: new Date().toISOString(),
      }).where(and(
        eq(subscriptions.userId, claimed.userId),
        inArray(subscriptions.provider, ["apple", "app_store"]),
      ));
    }
    const entitlement = await persistAppleEntitlement(verified, user.userId, user.email);
    return Response.json({ verified: true, active: entitlement.active, productId: verified.productId, currentPeriodEnd: entitlement.currentPeriodEnd });
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
  if (subscription) {
    await db.update(subscriptions)
      .set({
        plan: "free",
        status: "canceled",
        currentPeriodEnd: null,
        updatedAt: new Date().toISOString(),
      })
      .where(and(
        eq(subscriptions.userId, user.userId),
        inArray(subscriptions.provider, ["apple", "app_store"]),
      ));
  }
  return Response.json({ reconciled: true, active: false });
}
