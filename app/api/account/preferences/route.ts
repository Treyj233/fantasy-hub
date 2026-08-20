import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { userPreferences } from "../../../../db/schema";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { entitlementFor } from "../../../entitlements";

const premiumTeamIds = new Set(["CROWN", "NEONX", "HERITAGE"]);
const premiumBadgeThemes = new Set(["crown-chrome", "neon-endzone", "heritage-gridiron"]);
const proTeamIds = ["ARI","ATL","BAL","BUF","CAR","CHI","CIN","CLE","DAL","DEN","DET","GB","HOU","IND","JAX","KC","LV","LAC","LAR","MIA","MIN","NE","NO","NYG","NYJ","PHI","PIT","SF","SEA","TB","TEN","WSH"];
const proBadgeThemes = ["arcade", "team", "neon", "minimal", "stadium", "broadcast", "playbook", "varsity", "championship", "gridiron", "neon-sunday", "retro", "glass", "carbon", "helmet", "trading-cards"];
const teamIds = new Set([...proTeamIds,...premiumTeamIds]);
const badgeThemes = new Set([...proBadgeThemes,...premiumBadgeThemes]);

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
  const parseLibrary = (value: string | null | undefined, fallback: string) => {
    try { return [...new Set([fallback, ...(JSON.parse(value ?? "[]") as string[])])]; }
    catch { return [fallback]; }
  };
  const ownedTeamThemes = parseLibrary(current?.ownedTeamThemesJson, current?.teamTheme ?? "LAC");
  const ownedBadgeThemes = parseLibrary(current?.ownedBadgeThemesJson, current?.badgeTheme ?? "arcade");
  if (entitlement.pro) {
    ownedTeamThemes.push(...proTeamIds);
    ownedBadgeThemes.push(...proBadgeThemes);
  }
  if (entitlement.owner) {
    ownedTeamThemes.push(...premiumTeamIds);
    ownedBadgeThemes.push(...premiumBadgeThemes);
  }
  if (payload.acquireTeamTheme) {
    if (!teamIds.has(payload.acquireTeamTheme)) return Response.json({ error: "Invalid team theme" }, { status: 400 });
    if (!entitlement.pro) return Response.json({ error: "Theme purchase required" }, { status: 402 });
    if (premiumTeamIds.has(payload.acquireTeamTheme) && !entitlement.owner) return Response.json({ error: "Coming soon" }, { status: 403 });
    ownedTeamThemes.push(payload.acquireTeamTheme);
  }
  if (payload.acquireBadgeTheme) {
    if (!badgeThemes.has(payload.acquireBadgeTheme)) return Response.json({ error: "Invalid badge theme" }, { status: 400 });
    if (!entitlement.pro) return Response.json({ error: "Theme purchase required" }, { status: 402 });
    if (premiumBadgeThemes.has(payload.acquireBadgeTheme) && !entitlement.owner) return Response.json({ error: "Coming soon" }, { status: 403 });
    ownedBadgeThemes.push(payload.acquireBadgeTheme);
  }
  const nextTeamTheme = payload.teamTheme ?? current?.teamTheme ?? "LAC";
  const nextBadgeTheme = payload.badgeTheme ?? current?.badgeTheme ?? "arcade";
  if (payload.teamTheme && !ownedTeamThemes.includes(payload.teamTheme)) return Response.json({ error: "Add this theme to your library first" }, { status: 403 });
  if (payload.badgeTheme && !ownedBadgeThemes.includes(payload.badgeTheme)) return Response.json({ error: "Add this badge pack to your library first" }, { status: 403 });
  const values = {
    userId: user.userId,
    email: user.email,
    colorMode: payload.colorMode ?? current?.colorMode ?? "light",
    teamTheme: ownedTeamThemes.includes(nextTeamTheme) ? nextTeamTheme : "LAC",
    badgeTheme: ownedBadgeThemes.includes(nextBadgeTheme) ? nextBadgeTheme : "arcade",
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
