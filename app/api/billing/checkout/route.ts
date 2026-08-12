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
    if (payload.plan === "season") {
      const configuredPrice = await stripe.prices.retrieve(price);
      if (configuredPrice.currency !== "usd" || configuredPrice.unit_amount !== 2499 || configuredPrice.recurring?.interval !== "month" || configuredPrice.recurring.interval_count !== 6) {
        console.error("Stripe season price does not match the advertised $24.99 six-month plan");
        return Response.json({ error: "Season billing is temporarily unavailable" }, { status: 503 });
      }
    }
    const storedStripeCustomerId = existing?.provider === "stripe" && existing.providerCustomerId?.startsWith("cus_")
      ? existing.providerCustomerId
      : undefined;
    const createCheckout = (customerId?: string) => stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
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
    let checkout;
    try {
      checkout = await createCheckout(storedStripeCustomerId);
    } catch (error) {
      const stripeError = error as { code?: string; param?: string };
      if (!storedStripeCustomerId || stripeError.code !== "resource_missing" || stripeError.param !== "customer") throw error;
      console.warn("Stored Stripe customer no longer exists; creating checkout with the verified account email", { userId: user.userId });
      checkout = await createCheckout();
    }
    return Response.json({ url: checkout.url }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const stripeError = error as { type?: string; code?: string; param?: string; message?: string };
    console.error("Stripe checkout failed", { type: stripeError.type, code: stripeError.code, param: stripeError.param, message: stripeError.message });
    if (stripeError.code === "resource_missing" && stripeError.param === "price") {
      return Response.json({ error: "Stripe subscription pricing is missing or not available." }, { status: 503 });
    }
    if (stripeError.code === "resource_missing" && stripeError.param === "customer") {
      return Response.json({ error: "Stripe customer record could not be verified. Please try again." }, { status: 503 });
    }
    return Response.json({ error: stripeError.message ?? "Checkout is temporarily unavailable" }, { status: 503 });
  }
}
