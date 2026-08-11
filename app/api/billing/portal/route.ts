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
  if (!record?.providerCustomerId) return Response.json({ error: "No Stripe billing account found" }, { status: 404 });
  try {
    const { stripe, config } = await getStripe();
    const portal = await stripe.billingPortal.sessions.create({ customer: record.providerCustomerId, return_url: `${config.appUrl}/` });
    return Response.json({ url: portal.url }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Stripe portal failed", error);
    return Response.json({ error: "Billing management is temporarily unavailable" }, { status: 503 });
  }
}
