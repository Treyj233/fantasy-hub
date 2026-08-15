import { claimedAppleSubscription, persistAppleEntitlement } from "../../../apple-entitlement-sync";
import { decodeAppleJwsPayload, verifyAppleTransaction } from "../../../app-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type NotificationEnvelope = {
  notificationType?: string;
  notificationUUID?: string;
  data?: { signedTransactionInfo?: string };
};

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { signedPayload?: string } | null;
  const signedPayload = body?.signedPayload?.trim();
  if (!signedPayload || signedPayload.length > 200_000)
    return Response.json({ error: "A valid signedPayload is required" }, { status: 400 });

  try {
    // The decoded IDs are treated only as lookup hints. Entitlement state is
    // taken from a fresh, authenticated App Store Server API transaction lookup.
    const notification = decodeAppleJwsPayload(signedPayload) as NotificationEnvelope;
    const signedTransaction = notification.data?.signedTransactionInfo;
    if (!signedTransaction) {
      // Apple's TEST notifications intentionally contain no transaction.
      return Response.json({ received: true, notificationType: notification.notificationType ?? "TEST" });
    }

    const hintedTransaction = decodeAppleJwsPayload(signedTransaction);
    const transactionId = String(hintedTransaction.transactionId ?? "");
    if (!/^\d{5,40}$/.test(transactionId))
      return Response.json({ error: "Notification transaction is invalid" }, { status: 400 });

    const verified = await verifyAppleTransaction(transactionId);
    const claim = await claimedAppleSubscription(verified.originalTransactionId);
    if (!claim) {
      // The app may still be completing the initial account claim. Apple retries
      // notifications, and app-launch reconciliation is the secondary backstop.
      return Response.json({ received: true, matched: false }, { status: 202 });
    }

    const entitlement = await persistAppleEntitlement(verified, claim.userId, claim.email);
    return Response.json({
      received: true,
      matched: true,
      active: entitlement.active,
      notificationType: notification.notificationType ?? "UNKNOWN",
      notificationUUID: notification.notificationUUID ?? null,
    });
  } catch (error) {
    console.error("App Store server notification rejected", error);
    return Response.json({ error: "Invalid App Store notification" }, { status: 400 });
  }
}
