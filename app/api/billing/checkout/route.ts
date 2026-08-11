import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { subscriptions } from "../../../../db/schema";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { getStripe, priceForPlan, type FantasyHubBillingPlan } from "../../../stripe";

const plans = new Set<FantasyHubBillingPlan>(["monthly", "season", "annual"]);

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const payload = await request.json().catch(() => null) as { plan?: FantasyHubBillingPlan } | null;
  if (!payload?.plan || !plans.has(payload.plan)) return Response.json({ error: "Choose a valid plan" }, { status: 400 });

  const db = await getDb();
  const [existing] = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.userId)).limit(1);
  if (existing && (existing.status === "active" || existing.status === "trialing")) {
    return Response.json({ error: "Your Pro membership is already active", manageBilling: true }, { status: 409 });
  }

  try {
    const { stripe, config } = await getStripe();
    const price = priceForPlan(config, payload.plan);
    if (!price) return Response.json({ error: "This billing plan is not available yet" }, { status: 503 });
    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: existing?.providerCustomerId || undefined,
      customer_email: existing?.providerCustomerId ? undefined : user.email,
      client_reference_id: user.userId,
      line_items: [{ price, quantity: 1 }],
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      success_url: `${config.appUrl}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.appUrl}/?checkout=canceled`,
      metadata: { fantasyHubUserId: user.userId, fantasyHubPlan: payload.plan },
      subscription_data: {
        metadata: { fantasyHubUserId: user.userId, fantasyHubPlan: payload.plan },
        ...(payload.plan === "monthly" ? { trial_period_days: 7 } : {}),
      },
    });
    return Response.json({ url: checkout.url }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Stripe checkout failed", error);
    return Response.json({ error: "Checkout is temporarily unavailable" }, { status: 503 });
  }
}
