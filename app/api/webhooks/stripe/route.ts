import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { subscriptions } from "../../../../db/schema";
import { getStripe } from "../../../stripe";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "Missing signature" }, { status: 400 });
  try {
    const rawBody = await request.text();
    const { stripe, config } = await getStripe();
    if (!config.webhookSecret) return Response.json({ error: "Webhook is not configured" }, { status: 503 });
    const event = stripe.webhooks.constructEvent(rawBody, signature, config.webhookSecret);
    if (event.type === "checkout.session.completed") await syncCheckout(stripe, event.data.object);
    if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      await syncSubscription(event.data.object);
    }
    return Response.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook rejected", error);
    return Response.json({ error: "Invalid webhook" }, { status: 400 });
  }
}

async function syncCheckout(stripe: Stripe, session: Stripe.Checkout.Session) {
  if (!session.subscription) return;
  const subscription = typeof session.subscription === "string" ? await stripe.subscriptions.retrieve(session.subscription) : session.subscription;
  await syncSubscription(subscription, session.client_reference_id ?? session.metadata?.fantasyHubUserId, typeof session.customer === "string" ? session.customer : session.customer?.id);
}

async function syncSubscription(subscription: Stripe.Subscription, fallbackUserId?: string | null, fallbackCustomerId?: string | null) {
  const userId = subscription.metadata.fantasyHubUserId || fallbackUserId;
  if (!userId) return;
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id || fallbackCustomerId || null;
  const status = normalizeStatus(subscription.status);
  const periodEnd = subscription.items.data.reduce((latest, item) => Math.max(latest, item.current_period_end ?? 0), 0);
  const db = await getDb();
  const [existing] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  const record = {
    userId,
    email: existing?.email ?? "stripe-managed",
    plan: status === "canceled" ? "free" : "pro",
    status,
    provider: "stripe",
    providerCustomerId: customerId,
    providerSubscriptionId: subscription.id,
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    updatedAt: new Date().toISOString(),
  };
  await db.insert(subscriptions).values(record).onConflictDoUpdate({ target: subscriptions.userId, set: record });
}

function normalizeStatus(status: Stripe.Subscription.Status): "inactive" | "trialing" | "active" | "past_due" | "canceled" {
  if (status === "trialing") return "trialing";
  if (status === "active") return "active";
  if (status === "past_due") return "past_due";
  if (status === "canceled") return "canceled";
  return "inactive";
}
