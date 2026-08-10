import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { subscriptions } from "../db/schema";

export type AccountEntitlement = {
  plan: "free" | "pro";
  status: "inactive" | "trialing" | "active" | "past_due" | "canceled";
  pro: boolean;
  currentPeriodEnd: string | null;
};

export async function entitlementFor(userId: string): Promise<AccountEntitlement> {
  const db = await getDb();
  const [record] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  const status = (record?.status ?? "inactive") as AccountEntitlement["status"];
  const plan = record?.plan === "pro" ? "pro" : "free";
  return { plan, status, pro: plan === "pro" && (status === "active" || status === "trialing"), currentPeriodEnd: record?.currentPeriodEnd ?? null };
}

export async function requirePro(userId: string) {
  const entitlement = await entitlementFor(userId);
  return entitlement.pro ? null : Response.json({ error: "Fantasy Hub Pro required", code: "PRO_REQUIRED" }, { status: 402 });
}
