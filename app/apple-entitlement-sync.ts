import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { appStoreTransactions, subscriptions } from "../db/schema";
import type { VerifiedAppleTransaction } from "./app-store";

export async function persistAppleEntitlement(
  verified: VerifiedAppleTransaction,
  userId: string,
  email: string,
) {
  const db = await getDb();
  const now = new Date();
  const active = !verified.revokedAt && (!verified.expiresAt || new Date(verified.expiresAt) > now);
  const transactionRecord = { ...verified, userId, updatedAt: now.toISOString() };

  await db.insert(appStoreTransactions).values(transactionRecord).onConflictDoUpdate({
    target: appStoreTransactions.originalTransactionId,
    set: transactionRecord,
  });

  const subscriptionRecord = {
    userId,
    email,
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

  return { active, currentPeriodEnd: verified.expiresAt };
}

export async function claimedAppleSubscription(originalTransactionId: string) {
  const db = await getDb();
  const [claim] = await db.select({
    userId: appStoreTransactions.userId,
  }).from(appStoreTransactions)
    .where(eq(appStoreTransactions.originalTransactionId, originalTransactionId))
    .limit(1);
  if (!claim) return null;

  const [subscription] = await db.select({ email: subscriptions.email })
    .from(subscriptions)
    .where(eq(subscriptions.userId, claim.userId))
    .limit(1);
  return { userId: claim.userId, email: subscription?.email ?? "apple-managed" };
}
