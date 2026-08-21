import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { getDb } from "../../../../db";
import { subscriptions } from "../../../../db/schema";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { getStripe, priceForPlan, type FantasyHubBillingPlan } from "../../../stripe";

const plans = new Set<FantasyHubBillingPlan>(["monthly", "season", "annual", "elite_monthly", "elite_season", "elite_annual"]);

const elitePriceSpecs = {
  elite_monthly: { amount: 799, interval: "month" as const, intervalCount: 1 },
  elite_season: { amount: 3499, interval: "month" as const, intervalCount: 6 },
  elite_annual: { amount: 5999, interval: "year" as const, intervalCount: 1 },
};

function isSeasonPrice(price: Stripe.Price, unitAmount: number) {
  return price.active
    && price.currency === "usd"
    && price.unit_amount === unitAmount
    && price.recurring?.interval === "month"
    && price.recurring.interval_count === 6;
}

async function resolveSeasonPrice(stripe: Stripe, configuredPriceId: string, unitAmount: number, tier: "pro" | "elite") {
  const configuredPrice = await stripe.prices.retrieve(configuredPriceId);
  if (isSeasonPrice(configuredPrice, unitAmount)) return configuredPrice.id;

  const productId = typeof configuredPrice.product === "string"
    ? configuredPrice.product
    : configuredPrice.product.id;
  const prices = await stripe.prices.list({ product: productId, active: true, limit: 100 });
  const matchingPrice = prices.data.find((price) => isSeasonPrice(price, unitAmount));
  if (matchingPrice) return matchingPrice.id;

  const newPrice = await stripe.prices.create({
    product: productId,
    currency: "usd",
    unit_amount: unitAmount,
    recurring: { interval: "month", interval_count: 6 },
    metadata: { fantasyHubPlan: `${tier}_season`, fantasyHubTier: tier },
  });
  return newPrice.id;
}

async function resolveElitePrice(stripe: Stripe, plan: keyof typeof elitePriceSpecs, configuredPriceId: string) {
  const spec = elitePriceSpecs[plan];
  if (configuredPriceId) {
    try {
      const configured = await stripe.prices.retrieve(configuredPriceId);
      if (configured.active && configured.currency === "usd" && configured.unit_amount === spec.amount
        && configured.recurring?.interval === spec.interval && configured.recurring.interval_count === spec.intervalCount) return configured.id;
    } catch {
      // Recover from a missing or stale configured price by resolving the live Elite catalog below.
    }
  }
  const products = await stripe.products.list({ active: true, limit: 100 });
  let product = products.data.find((candidate) => candidate.metadata.fantasyHubTier === "elite" || candidate.name === "Fantasy Hub Elite");
  if (!product) product = await stripe.products.create({
    name: "Fantasy Hub Elite",
    description: "Premium Draft HQ intelligence, Manager Reports, every theme, and all future Fantasy Hub Elite tools.",
    metadata: { fantasyHubTier: "elite" },
  });
  const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
  const matching = prices.data.find((price) => price.currency === "usd" && price.unit_amount === spec.amount
    && price.recurring?.interval === spec.interval && price.recurring.interval_count === spec.intervalCount);
  if (matching) return matching.id;
  const price = await stripe.prices.create({
    product: product.id,
    currency: "usd",
    unit_amount: spec.amount,
    recurring: { interval: spec.interval, interval_count: spec.intervalCount },
    metadata: { fantasyHubPlan: plan, fantasyHubTier: "elite" },
  });
  return price.id;
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const payload = await request.json().catch(() => null) as { plan?: FantasyHubBillingPlan } | null;
  if (!payload?.plan || !plans.has(payload.plan)) return Response.json({ error: "Choose a valid plan" }, { status: 400 });
  const billingPlan = payload.plan;

  const db = await getDb();
  const [existing] = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.userId)).limit(1);
  try {
    const { stripe, config } = await getStripe();
    const tier = billingPlan.startsWith("elite_") ? "elite" : "pro";
    let price = tier === "elite"
      ? await resolveElitePrice(stripe, billingPlan as keyof typeof elitePriceSpecs, priceForPlan(config, billingPlan))
      : priceForPlan(config, billingPlan);
    if (!price) return Response.json({ error: "This billing plan is not available yet" }, { status: 503 });
    if (billingPlan === "season") price = await resolveSeasonPrice(stripe, price, 2499, tier);
    const membershipActive = existing && (existing.status === "active" || existing.status === "trialing");
    if (membershipActive) {
      if (existing.plan === "elite" || tier === "pro") return Response.json({ error: `Your ${existing.plan === "elite" ? "Elite" : "Pro"} membership is already active`, manageBilling: true }, { status: 409 });
      if (existing.provider !== "stripe" || !existing.providerCustomerId || !existing.providerSubscriptionId) {
        return Response.json({ error: "Manage or end your current subscription with its billing provider before upgrading to Elite." }, { status: 409 });
      }
      const subscription = await stripe.subscriptions.retrieve(existing.providerSubscriptionId);
      const item = subscription.items.data[0];
      if (!item) return Response.json({ error: "Your current subscription could not be upgraded. Open billing management and try again." }, { status: 409 });
      const portal = await stripe.billingPortal.sessions.create({
        customer: existing.providerCustomerId,
        return_url: `${config.appUrl}/?checkout=upgrade-return`,
        flow_data: {
          type: "subscription_update_confirm",
          subscription_update_confirm: { subscription: subscription.id, items: [{ id: item.id, price, quantity: 1 }] },
          after_completion: { type: "redirect", redirect: { return_url: `${config.appUrl}/?checkout=success` } },
        },
      });
      return Response.json({ url: portal.url }, { headers: { "Cache-Control": "private, no-store" } });
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
      automatic_tax: { enabled: true },
      billing_address_collection: "required",
      ...(customerId ? { customer_update: { address: "auto" as const } } : {}),
      success_url: `${config.appUrl}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.appUrl}/?checkout=canceled`,
      metadata: { fantasyHubUserId: user.userId, fantasyHubPlan: billingPlan, fantasyHubTier: tier },
      subscription_data: {
        metadata: { fantasyHubUserId: user.userId, fantasyHubPlan: billingPlan, fantasyHubTier: tier },
        ...(billingPlan === "monthly" ? { trial_period_days: 7 } : {}),
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
