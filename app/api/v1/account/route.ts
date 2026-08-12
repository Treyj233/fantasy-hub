import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import {
  decisionMemory,
  espnLeagueSnapshots,
  espnSyncPairings,
  leagueDataSnapshots,
  managedLeagues,
  seasonNarrativeSnapshots,
  sleeperConnections,
  userPreferences,
  subscriptions,
  accountIdentities,
  appStoreTransactions,
  pushDevices,
} from "../../../../db/schema";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { entitlementFor } from "../../../entitlements";
import { getStripe } from "../../../stripe";
import { clerkClient } from "@clerk/nextjs/server";
import { apiError, apiJson } from "../_shared/http";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return apiError("AUTH_REQUIRED", "Sign in required", 401);
  const entitlement = await entitlementFor(user.userId, user.email);
  return apiJson({
    user: { id: user.userId, displayName: user.displayName, email: user.email },
    entitlement,
    deletion: { supported: true, confirmationPhrase: "DELETE" },
  });
}

export async function DELETE(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return apiError("AUTH_REQUIRED", "Sign in required", 401);
  const payload = await request.json().catch(() => null) as { confirmation?: string } | null;
  if (payload?.confirmation !== "DELETE")
    return apiError("CONFIRMATION_REQUIRED", "Enter DELETE to permanently remove the account.", 400);
  const db = await getDb();
  const [clerkIdentity] = user.provider === "clerk"
    ? await db.select({ providerUserId: accountIdentities.providerUserId }).from(accountIdentities)
      .where(and(eq(accountIdentities.canonicalUserId, user.userId), eq(accountIdentities.provider, "clerk"))).limit(1)
    : [];
  const [billing] = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.userId)).limit(1);
  if (billing?.provider === "stripe" && billing.providerSubscriptionId) {
    try {
      const { stripe } = await getStripe();
      await stripe.subscriptions.cancel(billing.providerSubscriptionId);
    } catch (error) {
      console.error("Unable to cancel Stripe subscription during account deletion", error);
      return apiError("BILLING_CANCELLATION_FAILED", "We could not safely cancel billing. Try again or contact support before deleting your account.", 503);
    }
  }
  await db.delete(decisionMemory).where(eq(decisionMemory.userId, user.userId));
  await db.delete(seasonNarrativeSnapshots).where(eq(seasonNarrativeSnapshots.userId, user.userId));
  await db.delete(leagueDataSnapshots).where(eq(leagueDataSnapshots.userId, user.userId));
  await db.delete(espnLeagueSnapshots).where(eq(espnLeagueSnapshots.userId, user.userId));
  await db.delete(espnSyncPairings).where(eq(espnSyncPairings.userId, user.userId));
  await db.delete(managedLeagues).where(eq(managedLeagues.userId, user.userId));
  await db.delete(sleeperConnections).where(eq(sleeperConnections.userId, user.userId));
  await db.delete(userPreferences).where(eq(userPreferences.userId, user.userId));
  await db.delete(subscriptions).where(eq(subscriptions.userId, user.userId));
  await db.delete(appStoreTransactions).where(eq(appStoreTransactions.userId, user.userId));
  await db.delete(pushDevices).where(eq(pushDevices.userId, user.userId));
  if (clerkIdentity?.providerUserId) {
    try {
      const client = await clerkClient();
      await client.users.deleteUser(clerkIdentity.providerUserId);
    } catch (error) {
      console.error("Unable to delete Clerk identity after Fantasy Hub account deletion", error);
      return apiError("IDENTITY_DELETION_FAILED", "Fantasy Hub data was removed, but the sign-in identity could not be closed automatically. Contact support to finish identity deletion.", 503);
    }
  }
  await db.delete(accountIdentities).where(eq(accountIdentities.canonicalUserId, user.userId));
  return apiJson({ deleted: true, deletedAt: new Date().toISOString() });
}
