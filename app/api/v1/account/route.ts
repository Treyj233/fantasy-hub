import { eq } from "drizzle-orm";
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
} from "../../../../db/schema";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { entitlementFor } from "../../../entitlements";
import { apiError, apiJson } from "../_shared/http";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return apiError("AUTH_REQUIRED", "Sign in required", 401);
  const entitlement = await entitlementFor(user.userId);
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
  await db.delete(decisionMemory).where(eq(decisionMemory.userId, user.userId));
  await db.delete(seasonNarrativeSnapshots).where(eq(seasonNarrativeSnapshots.userId, user.userId));
  await db.delete(leagueDataSnapshots).where(eq(leagueDataSnapshots.userId, user.userId));
  await db.delete(espnLeagueSnapshots).where(eq(espnLeagueSnapshots.userId, user.userId));
  await db.delete(espnSyncPairings).where(eq(espnSyncPairings.userId, user.userId));
  await db.delete(managedLeagues).where(eq(managedLeagues.userId, user.userId));
  await db.delete(sleeperConnections).where(eq(sleeperConnections.userId, user.userId));
  await db.delete(userPreferences).where(eq(userPreferences.userId, user.userId));
  await db.delete(subscriptions).where(eq(subscriptions.userId, user.userId));
  return apiJson({ deleted: true, deletedAt: new Date().toISOString() });
}
