import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { managedLeagues } from "../../../../db/schema";
import { getChatGPTUser } from "../../../chatgpt-auth";

type Provider = "sleeper" | "espn" | "yahoo";
type IdentifierType = "username" | "league_id";

function validate(provider: Provider, identifierType: IdentifierType, identifier: string) {
  if (!identifier || identifier.length > 100) return "Enter a valid username or league ID";
  if (identifierType === "league_id" && provider !== "yahoo" && !/^\d{4,24}$/.test(identifier)) return "League ID must be numeric";
  if (identifierType === "league_id" && provider === "yahoo" && !/^(?:\d+\.l\.)?\d+$/.test(identifier)) return "Enter a Yahoo league ID or full league key";
  if (identifierType === "username" && !/^[\w.@ -]{2,50}$/.test(identifier)) return "Enter a valid username";
  return null;
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const db = await getDb();
  const leagues = await db.select().from(managedLeagues).where(eq(managedLeagues.userId, user.userId)).orderBy(desc(managedLeagues.updatedAt));
  return Response.json({ leagues });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const payload = await request.json() as { provider?: Provider; identifierType?: IdentifierType; identifier?: string };
  const provider = payload.provider;
  const identifierType = payload.identifierType;
  const identifier = payload.identifier?.trim() ?? "";
  if (!provider || !["sleeper", "espn", "yahoo"].includes(provider) || !identifierType || !["username", "league_id"].includes(identifierType)) {
    return Response.json({ error: "Choose a supported provider and connection method" }, { status: 400 });
  }
  const validationError = validate(provider, identifierType, identifier);
  if (validationError) return Response.json({ error: validationError }, { status: 400 });
  if (provider === "sleeper" && identifierType === "league_id") {
    const sleeperResponse = await fetch(`https://api.sleeper.app/v1/league/${encodeURIComponent(identifier)}`);
    if (!sleeperResponse.ok) return Response.json({ error: "Sleeper league not found" }, { status: 404 });
  }
  const now = new Date().toISOString();
  const status = provider === "sleeper" ? "live" : provider === "yahoo" ? "oauth_required" : "saved";
  const league = { id: crypto.randomUUID(), userId: user.userId, provider, identifierType, identifier, status, createdAt: now, updatedAt: now };
  const db = await getDb();
  await db.insert(managedLeagues).values(league).onConflictDoUpdate({
    target: [managedLeagues.userId, managedLeagues.provider, managedLeagues.identifierType, managedLeagues.identifier],
    set: { status, updatedAt: now },
  });
  const [saved] = await db.select().from(managedLeagues).where(and(eq(managedLeagues.userId, user.userId), eq(managedLeagues.provider, provider), eq(managedLeagues.identifierType, identifierType), eq(managedLeagues.identifier, identifier))).limit(1);
  return Response.json({ league: saved });
}

export async function DELETE(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) return Response.json({ error: "League connection ID required" }, { status: 400 });
  const db = await getDb();
  await db.delete(managedLeagues).where(and(eq(managedLeagues.id, id), eq(managedLeagues.userId, user.userId)));
  return Response.json({ removed: true });
}
