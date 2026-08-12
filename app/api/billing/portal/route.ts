import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { subscriptions } from "../../../../db/schema";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { getStripe } from "../../../stripe";

export async function POST() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const db = await getDb();
  const [record] = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.userId)).limit(1);
  if (record?.provider && record.provider !== "stripe") {
    return Response.json({ error: record.provider === "apple" || record.provider === "app_store" ? "Manage this subscription through Apple" : "This Pro access has no recurring billing account" }, { status: 409 });
  }
  try {
    const { stripe, config } = await getStripe();
    let customerId = record?.providerCustomerId ?? null;
    if (!customerId) {
      const customers = await stripe.customers.list({ email: user.email, limit: 10 });
      for (const customer of customers.data) {
        const active = await stripe.subscriptions.list({ customer: customer.id, status: "all", limit: 20 });
        const subscription = active.data.find((entry) => entry.status === "active" || entry.status === "trialing");
        if (!subscription) continue;
        customerId = customer.id;
        const periodEnd = subscription.items.data.reduce((latest, item) => Math.max(latest, item.current_period_end ?? 0), 0);
        const recovered = { userId: user.userId, email: user.email, plan: "pro", status: subscription.status === "trialing" ? "trialing" : "active", provider: "stripe", providerCustomerId: customer.id, providerSubscriptionId: subscription.id, currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : null, updatedAt: new Date().toISOString() };
        await db.insert(subscriptions).values(recovered).onConflictDoUpdate({ target: subscriptions.userId, set: recovered });
        break;
      }
    }
    if (!customerId) return Response.json({ error: "No active Stripe subscription was found for this account" }, { status: 404 });
    const portal = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: `${config.appUrl}/` });
    return Response.json({ url: portal.url }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Stripe portal failed", error);
    return Response.json({ error: "Billing management is temporarily unavailable" }, { status: 503 });
  }
}
