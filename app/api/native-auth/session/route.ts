import { auth, clerkClient } from "@clerk/nextjs/server";
import { getClerkRuntimeKeys } from "../../../clerk-config";
import { createNativeSession } from "../../../native-session";

const cookieBase = "Path=/; Domain=fantasyhubapp.com; Secure; HttpOnly; SameSite=Lax";

export async function DELETE(request: Request) {
  const headers = new Headers({ "Cache-Control": "no-store" });
  headers.append("Set-Cookie", `fh_native_session=; ${cookieBase}; Max-Age=0`);
  if (new URL(request.url).searchParams.get("native") === "ios") {
    // This durable tombstone prevents a stale Clerk WebView cookie from
    // restoring authentication after the native app is force-closed.
    headers.append("Set-Cookie", `fh_native_signed_out=1; ${cookieBase}; Max-Age=31536000`);
  }
  return new Response(null, { status: 204, headers });
}

export async function POST() {
  const headers = new Headers({ "Cache-Control": "no-store" });
  headers.append("Set-Cookie", `fh_native_signed_out=; ${cookieBase}; Max-Age=0`);
  const [{ userId }, keys] = await Promise.all([auth(), getClerkRuntimeKeys()]);
  if (!userId || !keys) return new Response(null, { status: 204, headers });

  try {
    const user = await (await clerkClient()).users.getUser(userId);
    const primaryEmail = user.emailAddresses.find((entry) => entry.id === user.primaryEmailAddressId);
    if (primaryEmail?.verification?.status !== "verified")
      return Response.json({ error: "A verified email is required" }, { status: 401, headers });
    const email = primaryEmail.emailAddress;
    const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || email;
    const session = await createNativeSession(userId, keys.secretKey, { email, displayName });
    headers.append("Set-Cookie", `fh_native_session=${session}; ${cookieBase}; Max-Age=2592000`);
    return new Response(null, { status: 204, headers });
  } catch {
    return Response.json({ error: "Native session could not be created" }, { status: 500, headers });
  }
}
