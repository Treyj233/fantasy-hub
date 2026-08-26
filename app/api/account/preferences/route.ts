import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { userPreferences } from "../../../../db/schema";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { entitlementFor } from "../../../entitlements";
import { normalizeThemePreferences, premiumBadgeThemeIds, premiumTeamThemeIds, proBadgeThemeIds, proTeamThemeIds } from "../../../theme-entitlements";

const teamIds = new Set([...proTeamThemeIds,...premiumTeamThemeIds]);
const badgeThemes = new Set([...proBadgeThemeIds,...premiumBadgeThemeIds]);

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const payload = await request.json() as { colorMode?: string; teamTheme?: string; badgeTheme?: string; leagueOrder?: string[]; hiddenLeagueIds?: string[]; acquireTeamTheme?: string; acquireBadgeTheme?: string; completeOnboarding?: boolean };
  if (payload.colorMode && !["light", "dark"].includes(payload.colorMode)) return Response.json({ error: "Invalid color mode" }, { status: 400 });
  if (payload.teamTheme && !teamIds.has(payload.teamTheme)) return Response.json({ error: "Invalid team theme" }, { status: 400 });
  if (payload.badgeTheme && !badgeThemes.has(payload.badgeTheme)) return Response.json({ error: "Invalid badge theme" }, { status: 400 });
  const db = await getDb();
  const [[current], entitlement] = await Promise.all([
    db.select().from(userPreferences).where(eq(userPreferences.userId, user.userId)).limit(1),
    entitlementFor(user.userId, user.email),
  ]);
  const now = new Date().toISOString();
  const normalizedCurrent = normalizeThemePreferences({
    teamTheme: current?.teamTheme ?? "LAC",
    badgeTheme: current?.badgeTheme ?? "arcade",
    ownedTeamThemesJson: current?.ownedTeamThemesJson ?? "[]",
    ownedBadgeThemesJson: current?.ownedBadgeThemesJson ?? "[]",
  }, entitlement);
  const ownedTeamThemes = JSON.parse(normalizedCurrent.ownedTeamThemesJson) as string[];
  const ownedBadgeThemes = JSON.parse(normalizedCurrent.ownedBadgeThemesJson) as string[];
  if (entitlement.owner) {
    ownedTeamThemes.push(...premiumTeamThemeIds);
    ownedBadgeThemes.push(...premiumBadgeThemeIds);
  }
  if (payload.acquireTeamTheme) {
    if (!teamIds.has(payload.acquireTeamTheme)) return Response.json({ error: "Invalid team theme" }, { status: 400 });
    if (!entitlement.pro) return Response.json({ error: "Theme purchase required" }, { status: 402 });
    if (premiumTeamThemeIds.has(payload.acquireTeamTheme) && !entitlement.owner && !entitlement.elite) return Response.json({ error: "Theme purchase required" }, { status: 402 });
    ownedTeamThemes.push(payload.acquireTeamTheme);
  }
  if (payload.acquireBadgeTheme) {
    if (!badgeThemes.has(payload.acquireBadgeTheme)) return Response.json({ error: "Invalid badge theme" }, { status: 400 });
    if (!entitlement.pro) return Response.json({ error: "Theme purchase required" }, { status: 402 });
    if (premiumBadgeThemeIds.has(payload.acquireBadgeTheme) && !entitlement.owner && !entitlement.elite) return Response.json({ error: "Theme purchase required" }, { status: 402 });
    ownedBadgeThemes.push(payload.acquireBadgeTheme);
  }
  const nextTeamTheme = payload.teamTheme ?? current?.teamTheme ?? "LAC";
  const nextBadgeTheme = payload.badgeTheme ?? current?.badgeTheme ?? "arcade";
  const canUseTeamTheme = (themeId: string) => ownedTeamThemes.includes(themeId) || (entitlement.pro && proTeamThemeIds.includes(themeId));
  const canUseBadgeTheme = (themeId: string) => ownedBadgeThemes.includes(themeId) || (entitlement.pro && proBadgeThemeIds.includes(themeId));
  if (payload.teamTheme && !canUseTeamTheme(payload.teamTheme)) return Response.json({ error: "Add this theme to your library first" }, { status: 403 });
  if (payload.badgeTheme && !canUseBadgeTheme(payload.badgeTheme)) return Response.json({ error: "Add this badge pack to your library first" }, { status: 403 });
  const values = {
    userId: user.userId,
    email: user.email,
    colorMode: payload.colorMode ?? current?.colorMode ?? "light",
    teamTheme: canUseTeamTheme(nextTeamTheme) ? nextTeamTheme : "LAC",
    badgeTheme: canUseBadgeTheme(nextBadgeTheme) ? nextBadgeTheme : "arcade",
    leagueOrderJson: payload.leagueOrder ? JSON.stringify(payload.leagueOrder.slice(0, 100)) : current?.leagueOrderJson ?? "[]",
    hiddenLeagueIdsJson: payload.hiddenLeagueIds ? JSON.stringify(payload.hiddenLeagueIds.slice(0, 100)) : current?.hiddenLeagueIdsJson ?? "[]",
    ownedTeamThemesJson: JSON.stringify([...new Set(ownedTeamThemes)]),
    ownedBadgeThemesJson: JSON.stringify([...new Set(ownedBadgeThemes)]),
    onboardingCompletedAt: payload.completeOnboarding ? current?.onboardingCompletedAt ?? now : current?.onboardingCompletedAt ?? null,
    updatedAt: now,
  };
  await db.insert(userPreferences).values(values).onConflictDoUpdate({ target: userPreferences.userId, set: values });
  return Response.json({ preferences: values });
}
