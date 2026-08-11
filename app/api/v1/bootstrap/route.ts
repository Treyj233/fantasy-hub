import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { managedLeagues, sleeperConnections, userPreferences } from "../../../../db/schema";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { apiError, apiJson } from "../_shared/http";
import { checkLocalRateLimit, clientKey } from "../_shared/rate-limit";
import { entitlementFor } from "../../../entitlements";

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return apiError("AUTH_REQUIRED", "Sign in required", 401);
  const rate = checkLocalRateLimit(clientKey(request, user.userId), 90);
  if (!rate.allowed)
    return apiError("RATE_LIMITED", "Too many requests. Try again shortly.", 429);
  const db = await getDb();
  const [[connection], [preferences], leagues, entitlement] = await Promise.all([
    db.select().from(sleeperConnections).where(eq(sleeperConnections.userId, user.userId)).limit(1),
    db.select().from(userPreferences).where(eq(userPreferences.userId, user.userId)).limit(1),
    db.select().from(managedLeagues).where(eq(managedLeagues.userId, user.userId)).orderBy(desc(managedLeagues.updatedAt)),
    entitlementFor(user.userId),
  ]);
  const effectivePreferences = preferences ? {
    ...preferences,
    teamTheme: entitlement.pro ? preferences.teamTheme : "GB",
    badgeTheme: entitlement.pro ? preferences.badgeTheme : "arcade",
  } : null;
  return apiJson({
    user: { id: user.userId, displayName: user.displayName, email: user.email },
    connection: connection ?? null,
    preferences: effectivePreferences,
    leagues,
    entitlement,
    serverTime: new Date().toISOString(),
  });
}
