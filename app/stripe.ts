import Stripe from "stripe";

type StripeRuntimeConfig = {
  secretKey: string;
  webhookSecret: string;
  monthlyPriceId: string;
  seasonPriceId: string;
  annualPriceId: string;
  appUrl: string;
};

async function runtimeEnv(): Promise<Record<string, unknown>> {
  try {
    return (await import("cloudflare:workers")).env as unknown as Record<string, unknown>;
  } catch {
    return process.env as Record<string, unknown>;
  }
}

export async function getStripeConfig(): Promise<StripeRuntimeConfig> {
  const env = await runtimeEnv();
  const config = {
    secretKey: String(env.STRIPE_SECRET_KEY ?? ""),
    webhookSecret: String(env.STRIPE_WEBHOOK_SECRET ?? ""),
    monthlyPriceId: String(env.STRIPE_PRICE_MONTHLY ?? ""),
    seasonPriceId: String(env.STRIPE_PRICE_SEASON ?? ""),
    annualPriceId: String(env.STRIPE_PRICE_ANNUAL ?? ""),
    appUrl: String(env.NEXT_PUBLIC_APP_URL ?? "https://www.fantasyhubapp.com"),
  };
  if (!config.secretKey) throw new Error("Stripe is not configured");
  return config;
}

export async function getStripe() {
  const config = await getStripeConfig();
  return { stripe: new Stripe(config.secretKey, { typescript: true }), config };
}

export type FantasyHubBillingPlan = "monthly" | "season" | "annual";

export function priceForPlan(config: StripeRuntimeConfig, plan: FantasyHubBillingPlan) {
  return plan === "monthly" ? config.monthlyPriceId : plan === "season" ? config.seasonPriceId : config.annualPriceId;
}
