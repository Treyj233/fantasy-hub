import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { appStoreTransactions, subscriptions, userPreferences } from "../db/schema";
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

  const themePack = {
    "com.fantasyhubapp.theme.aurora": { theme: "CROWN", badge: "crown-chrome" },
    "com.fantasyhubapp.theme.primetime": { theme: "NEONX", badge: "neon-endzone" },
    "com.fantasyhubapp.theme.sunset": { theme: "HERITAGE", badge: "heritage-gridiron" },
  }[verified.productId];
  if (themePack) {
    const [current] = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1);
    const parseLibrary = (value: string | null | undefined, fallback: string) => {
      try { return [...new Set([fallback, ...(JSON.parse(value ?? "[]") as string[])])]; }
      catch { return [fallback]; }
    };
    const ownedTeamThemes = parseLibrary(current?.ownedTeamThemesJson, current?.teamTheme ?? "LAC");
    const ownedBadgeThemes = parseLibrary(current?.ownedBadgeThemesJson, current?.badgeTheme ?? "arcade");
    if (active) {
      ownedTeamThemes.push(themePack.theme);
      ownedBadgeThemes.push(themePack.badge);
    }
    const preferences = {
      userId,
      email,
      colorMode: current?.colorMode ?? "light",
      teamTheme: current?.teamTheme ?? "LAC",
      badgeTheme: current?.badgeTheme ?? "arcade",
      leagueOrderJson: current?.leagueOrderJson ?? "[]",
      hiddenLeagueIdsJson: current?.hiddenLeagueIdsJson ?? "[]",
      ownedTeamThemesJson: JSON.stringify([...new Set(ownedTeamThemes)]),
      ownedBadgeThemesJson: JSON.stringify([...new Set(ownedBadgeThemes)]),
      pushPreferencesJson: current?.pushPreferencesJson ?? "{}",
      onboardingCompletedAt: current?.onboardingCompletedAt ?? null,
      updatedAt: now.toISOString(),
    };
    await db.insert(userPreferences).values(preferences).onConflictDoUpdate({
      target: userPreferences.userId,
      set: preferences,
    });
    return { active, currentPeriodEnd: null };
  }

  const subscriptionRecord = {
    userId,
    email,
    plan: active ? verified.productId.includes(".elite.") ? "elite" : "pro" : "free",
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
