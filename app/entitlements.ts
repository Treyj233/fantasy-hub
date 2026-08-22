import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { subscriptions } from "../db/schema";
import { LOCAL_PREVIEW_USER_ID } from "./chatgpt-auth";

export type AccountEntitlement = {
  plan: "free" | "pro" | "elite";
  status: "inactive" | "trialing" | "active" | "past_due" | "canceled";
  pro: boolean;
  elite: boolean;
  currentPeriodEnd: string | null;
  provider: "stripe" | "apple" | "manual" | null;
  owner: boolean;
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
  if (process.env.FANTASY_HUB_LOCAL_PREVIEW === "1" && userId === LOCAL_PREVIEW_USER_ID)
    return { plan: "elite", status: "active", pro: true, elite: true, currentPeriodEnd: null, provider: "manual", owner: true };
  const owner = Boolean(verifiedEmail && (await ownerEmails()).has(verifiedEmail.trim().toLowerCase()));
  const db = await getDb();
  const [record] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  const status = (record?.status ?? "inactive") as AccountEntitlement["status"];
  const plan = record?.plan === "elite" ? "elite" : record?.plan === "pro" ? "pro" : "free";
  const currentPeriodEnd = record?.currentPeriodEnd ?? null;
  const unexpired = !currentPeriodEnd || new Date(currentPeriodEnd).getTime() > Date.now();
  const provider = record?.provider === "app_store" ? "apple" : record?.provider === "stripe" || record?.provider === "apple" || record?.provider === "manual" ? record.provider : null;
  const active = unexpired && (status === "active" || status === "trialing");
  if (owner)
    return {
      plan: "elite",
      status: "active",
      pro: true,
      elite: true,
      currentPeriodEnd: active ? currentPeriodEnd : null,
      provider: active ? provider : "manual",
      owner: true,
    };
  return { plan, status, pro: (plan === "pro" || plan === "elite") && active, elite: plan === "elite" && active, currentPeriodEnd, provider, owner: false };
}

export async function requirePro(userId: string, verifiedEmail?: string) {
  const entitlement = await entitlementFor(userId, verifiedEmail);
  return entitlement.pro ? null : Response.json({ error: "Fantasy Hub Pro required", code: "PRO_REQUIRED" }, { status: 402 });
}

export async function requireElite(userId: string, verifiedEmail?: string) {
  const entitlement = await entitlementFor(userId, verifiedEmail);
  return entitlement.elite ? null : Response.json({ error: "Fantasy Hub Elite required", code: "ELITE_REQUIRED" }, { status: 402 });
}
