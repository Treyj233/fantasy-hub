import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { subscriptions } from "../db/schema";

export type AccountEntitlement = {
  plan: "free" | "pro";
  status: "inactive" | "trialing" | "active" | "past_due" | "canceled";
  pro: boolean;
  currentPeriodEnd: string | null;
  provider: "stripe" | "apple" | "manual" | null;
};

async function ownerEmails() {
  let runtimeEnv: Record<string, unknown> = process.env as Record<string, unknown>;
  try {
    runtimeEnv = (await import("cloudflare:workers")).env as unknown as Record<string, unknown>;
  } catch {
    // Local tooling uses process.env; production receives the Sites runtime env.
  }
  return new Set(
    String(runtimeEnv.FANTASY_HUB_OWNER_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function entitlementFor(userId: string, verifiedEmail?: string): Promise<AccountEntitlement> {
  if (verifiedEmail && (await ownerEmails()).has(verifiedEmail.trim().toLowerCase()))
    return { plan: "pro", status: "active", pro: true, currentPeriodEnd: null, provider: "manual" };
  const db = await getDb();
  const [record] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  const status = (record?.status ?? "inactive") as AccountEntitlement["status"];
  const plan = record?.plan === "pro" ? "pro" : "free";
  const currentPeriodEnd = record?.currentPeriodEnd ?? null;
  const unexpired = !currentPeriodEnd || new Date(currentPeriodEnd).getTime() > Date.now();
  const provider = record?.provider === "app_store" ? "apple" : record?.provider === "stripe" || record?.provider === "apple" || record?.provider === "manual" ? record.provider : null;
  return { plan, status, pro: plan === "pro" && unexpired && (status === "active" || status === "trialing"), currentPeriodEnd, provider };
}

export async function requirePro(userId: string, verifiedEmail?: string) {
  const entitlement = await entitlementFor(userId, verifiedEmail);
  return entitlement.pro ? null : Response.json({ error: "Fantasy Hub Pro required", code: "PRO_REQUIRED" }, { status: 402 });
}
