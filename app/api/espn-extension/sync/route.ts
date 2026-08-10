import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../../../../db";
import { espnLeagueSnapshots, espnSyncPairings, managedLeagues } from "../../../../db/schema";
import { espnLeagueSummary, type EspnPayload } from "../../espn";

const maxPayloadBytes = 4_500_000;

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") ?? "";
  const allowedOrigin = /^chrome-extension:\/\/[a-p]{32}$/.test(origin) ? origin : "null";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
}

async function hashCode(code: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function POST(request: Request) {
  const headers = corsHeaders(request);
  if (headers["Access-Control-Allow-Origin"] === "null")
    return Response.json({ error: "Use the Fantasy Hub ESPN Sync extension" }, { status: 403, headers });
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maxPayloadBytes)
    return Response.json({ error: "ESPN league data is too large to sync" }, { status: 413, headers });

  let body: { pairingCode?: string; rosterId?: string; payload?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return Response.json({ error: "Invalid sync payload" }, { status: 400, headers });
  }
  const compactCode = body.pairingCode?.toUpperCase().replace(/[^A-Z0-9]/g, "") ?? "";
  if (compactCode.length !== 12)
    return Response.json({ error: "Enter the 12-character pairing code from Fantasy Hub" }, { status: 400, headers });
  const payload = body.payload as Record<string, unknown> | null;
  if (!payload || typeof payload !== "object")
    return Response.json({ error: "No ESPN league data received" }, { status: 400, headers });
  const payloadJson = JSON.stringify(payload);
  if (new TextEncoder().encode(payloadJson).byteLength > maxPayloadBytes)
    return Response.json({ error: "ESPN league data is too large to sync" }, { status: 413, headers });

  const leagueId = String(payload.id ?? "");
  const season = String(payload.seasonId ?? "");
  const teams = Array.isArray(payload.teams) ? payload.teams as { id?: number }[] : [];
  const rosterId = body.rosterId?.trim() ?? "";
  if (!/^\d{4,24}$/.test(leagueId) || !/^20\d{2}$/.test(season) || teams.length < 2 || teams.length > 32)
    return Response.json({ error: "The ESPN response did not contain a valid football league" }, { status: 400, headers });
  if (!rosterId || !teams.some((team) => String(team.id ?? "") === rosterId))
    return Response.json({ error: "Select the ESPN team you manage" }, { status: 400, headers });

  const db = await getDb();
  const codeHash = await hashCode(compactCode);
  const [pairing] = await db.select().from(espnSyncPairings).where(and(eq(espnSyncPairings.codeHash, codeHash), isNull(espnSyncPairings.usedAt))).limit(1);
  if (!pairing || Date.parse(pairing.expiresAt) <= Date.now())
    return Response.json({ error: "Pairing code expired. Generate a new code in Fantasy Hub." }, { status: 401, headers });

  const now = new Date().toISOString();
  const summary = espnLeagueSummary(payload as EspnPayload);
  await db.update(espnSyncPairings).set({ usedAt: now }).where(and(eq(espnSyncPairings.id, pairing.id), isNull(espnSyncPairings.usedAt)));
  await db.insert(espnLeagueSnapshots).values({ id: crypto.randomUUID(), userId: pairing.userId, leagueId, season, payloadJson, syncedAt: now }).onConflictDoUpdate({
    target: [espnLeagueSnapshots.userId, espnLeagueSnapshots.leagueId, espnLeagueSnapshots.season],
    set: { payloadJson, syncedAt: now },
  });
  await db.insert(managedLeagues).values({
    id: crypto.randomUUID(), userId: pairing.userId, provider: "espn", identifierType: "league_id", identifier: leagueId,
    rosterId, leagueName: summary.name, season, status: "live", createdAt: now, updatedAt: now,
  }).onConflictDoUpdate({
    target: [managedLeagues.userId, managedLeagues.provider, managedLeagues.identifierType, managedLeagues.identifier],
    set: { rosterId, leagueName: summary.name, season, status: "live", updatedAt: now },
  });
  return Response.json({ league: { id: leagueId, name: summary.name, season, rosterId }, syncedAt: now }, { headers });
}
