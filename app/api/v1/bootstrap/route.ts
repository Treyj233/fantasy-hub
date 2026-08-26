import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { managedLeagues, sleeperConnections, userPreferences } from "../../../../db/schema";
import { getChatGPTUser, LOCAL_PREVIEW_USER_ID } from "../../../chatgpt-auth";
import { apiError, apiJson } from "../_shared/http";
import { checkLocalRateLimit, clientKey } from "../_shared/rate-limit";
import { entitlementFor } from "../../../entitlements";
import { normalizeThemePreferences } from "../../../theme-entitlements";

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return apiError("AUTH_REQUIRED", "Sign in required", 401);
  if (user.userId === LOCAL_PREVIEW_USER_ID) return apiJson({
    user: { id: user.userId, displayName: user.displayName, email: user.email },
    connection: null,
    preferences: {
      colorMode: "light",
      teamTheme: "LAC",
      badgeTheme: "arcade",
      leagueOrderJson: "[]",
      hiddenLeagueIdsJson: "[]",
      ownedTeamThemesJson: "[\"LAC\"]",
      ownedBadgeThemesJson: "[\"arcade\"]",
      onboardingCompletedAt: "local-preview",
    },
    leagues: [],
    connectedLeagues: [],
    entitlement: { plan: "elite", status: "active", pro: true, elite: true, currentPeriodEnd: null, provider: "manual", owner: true },
    serverTime: new Date().toISOString(),
  });
  const rate = checkLocalRateLimit(clientKey(request, user.userId), 90);
  if (!rate.allowed)
    return apiError("RATE_LIMITED", "Too many requests. Try again shortly.", 429);
  const db = await getDb();
  const [[connection], [preferences], leagues, entitlement] = await Promise.all([
    db.select().from(sleeperConnections).where(eq(sleeperConnections.userId, user.userId)).limit(1),
    db.select().from(userPreferences).where(eq(userPreferences.userId, user.userId)).limit(1),
    db.select().from(managedLeagues).where(eq(managedLeagues.userId, user.userId)).orderBy(desc(managedLeagues.updatedAt)),
    entitlementFor(user.userId, user.email),
  ]);
  const effectivePreferences = preferences ? normalizeThemePreferences(preferences, entitlement) : null;
  const connectedLeagues = leagues.flatMap((record) => {
    if (record.status !== "live" || record.identifierType !== "league_id") return [];
    let meta: { teams?: number; format?: string; scoring?: string; starterCount?: number } = {};
    try { meta = JSON.parse(record.leagueMetaJson || "{}"); } catch { /* Older records use safe defaults. */ }
    return [{
      id: record.provider === "espn" ? `espn:${record.season}:${record.identifier}` : record.identifier,
      sourceId: record.identifier,
      provider: record.provider,
      name: record.leagueName ?? "Saved League",
      season: record.season ?? String(new Date().getUTCFullYear()),
      teams: meta.teams ?? 0,
      format: meta.format ?? "Redraft",
      scoring: meta.scoring ?? "Platform scoring",
      rosterId: record.rosterId ?? "",
      starterCount: meta.starterCount ?? 0,
    }];
  });
  return apiJson({
    user: { id: user.userId, displayName: user.displayName, email: user.email },
    connection: connection ?? null,
    preferences: effectivePreferences,
    leagues,
    connectedLeagues,
    entitlement,
    serverTime: new Date().toISOString(),
  });
}
