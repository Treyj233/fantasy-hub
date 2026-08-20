import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { sleeperConnections, userPreferences } from "../../../db/schema";
import { getChatGPTUser, LOCAL_PREVIEW_USER_ID } from "../../chatgpt-auth";
import { entitlementFor } from "../../entitlements";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  if (user.userId === LOCAL_PREVIEW_USER_ID) return Response.json({
    user: { displayName: user.displayName, email: user.email },
    connection: null,
    preferences: {
      colorMode: "light",
      teamTheme: "LAC",
      badgeTheme: "arcade",
      leagueOrderJson: "[]",
      hiddenLeagueIdsJson: "[]",
      onboardingCompletedAt: "local-preview",
    },
    entitlement: { plan: "elite", status: "active", pro: true, elite: true, currentPeriodEnd: null, provider: "manual", owner: true },
    leagues: [],
  });
  const db = await getDb();
  const [[connection], [preferences], entitlement] = await Promise.all([
    db.select().from(sleeperConnections).where(eq(sleeperConnections.userId, user.userId)).limit(1),
    db.select().from(userPreferences).where(eq(userPreferences.userId, user.userId)).limit(1),
    entitlementFor(user.userId, user.email),
  ]);
  const effectivePreferences = preferences ? {
    ...preferences,
    teamTheme: entitlement.pro ? preferences.teamTheme : "LAC",
    badgeTheme: entitlement.pro ? preferences.badgeTheme : "arcade",
  } : null;
  return Response.json({ user: { displayName: user.displayName, email: user.email }, connection: connection ?? null, preferences: effectivePreferences, entitlement });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const payload = await request.json() as { username?: string };
  const username = payload.username?.trim();
  if (!username || username.length > 50) return Response.json({ error: "Enter a valid Sleeper username" }, { status: 400 });
  const response = await fetch(`https://api.sleeper.app/v1/user/${encodeURIComponent(username)}`);
  if (!response.ok) return Response.json({ error: "Sleeper account not found" }, { status: 404 });
  const sleeper = await response.json() as { user_id?: string; username?: string; display_name?: string; avatar?: string | null };
  if (!sleeper.user_id) return Response.json({ error: "Sleeper account not found" }, { status: 404 });
  const connection = { userId: user.userId, email: user.email, sleeperUserId: sleeper.user_id, sleeperUsername: sleeper.username ?? username, displayName: sleeper.display_name ?? sleeper.username ?? username, avatar: sleeper.avatar ?? null, updatedAt: new Date().toISOString() };
  const db = await getDb();
  await db.insert(sleeperConnections).values(connection).onConflictDoUpdate({ target: sleeperConnections.userId, set: connection });
  return Response.json({ connection });
}

export async function DELETE() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const db = await getDb();
  await db.delete(sleeperConnections).where(eq(sleeperConnections.userId, user.userId));
  return Response.json({ disconnected: true });
}
