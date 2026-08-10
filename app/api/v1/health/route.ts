import { getDb } from "../../../../db";
import { sql } from "drizzle-orm";
import { apiJson } from "../_shared/http";

export async function GET() {
  const startedAt = Date.now();
  let database: "ok" | "unavailable" = "unavailable";
  try {
    const db = await getDb();
    await db.run(sql`SELECT 1 AS healthy`);
    database = "ok";
  } catch {
    database = "unavailable";
  }
  const healthy = database === "ok";
  return apiJson(
    {
      status: healthy ? "ok" : "degraded",
      service: "fantasy-hub-api",
      database,
      latencyMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503, cacheControl: "no-store" },
  );
}
