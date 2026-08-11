import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { userPreferences } from "../../../../db/schema";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { entitlementFor } from "../../../entitlements";

const teamIds = new Set(["ARI","ATL","BAL","BUF","CAR","CHI","CIN","CLE","DAL","DEN","DET","GB","HOU","IND","JAX","KC","LV","LAC","LAR","MIA","MIN","NE","NO","NYG","NYJ","PHI","PIT","SF","SEA","TB","TEN","WSH"]);
const badgeThemes = new Set(["arcade", "team", "neon", "minimal"]);

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const payload = await request.json() as { colorMode?: string; teamTheme?: string; badgeTheme?: string; leagueOrder?: string[]; completeOnboarding?: boolean };
  if (payload.colorMode && !["light", "dark"].includes(payload.colorMode)) return Response.json({ error: "Invalid color mode" }, { status: 400 });
  if (payload.teamTheme && !teamIds.has(payload.teamTheme)) return Response.json({ error: "Invalid team theme" }, { status: 400 });
  if (payload.badgeTheme && !badgeThemes.has(payload.badgeTheme)) return Response.json({ error: "Invalid badge theme" }, { status: 400 });
  const db = await getDb();
  const [[current], entitlement] = await Promise.all([
    db.select().from(userPreferences).where(eq(userPreferences.userId, user.userId)).limit(1),
    entitlementFor(user.userId),
  ]);
  const now = new Date().toISOString();
  const values = {
    userId: user.userId,
    email: user.email,
    colorMode: payload.colorMode ?? current?.colorMode ?? "light",
    teamTheme: entitlement.pro ? payload.teamTheme ?? current?.teamTheme ?? "GB" : "GB",
    badgeTheme: entitlement.pro ? payload.badgeTheme ?? current?.badgeTheme ?? "arcade" : "arcade",
    leagueOrderJson: payload.leagueOrder ? JSON.stringify(payload.leagueOrder.slice(0, 100)) : current?.leagueOrderJson ?? "[]",
    onboardingCompletedAt: payload.completeOnboarding ? current?.onboardingCompletedAt ?? now : current?.onboardingCompletedAt ?? null,
    updatedAt: now,
  };
  await db.insert(userPreferences).values(values).onConflictDoUpdate({ target: userPreferences.userId, set: values });
  return Response.json({ preferences: values });
}
