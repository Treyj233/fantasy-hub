import { auth, clerkClient, verifyToken } from "@clerk/nextjs/server";
import { getClerkRuntimeKeys } from "../../../clerk-config";
import { createNativeSession } from "../../../native-session";

const cookieBase = "Path=/; Domain=fantasyhubapp.com; Secure; HttpOnly; SameSite=Lax";

export async function DELETE(request: Request) {
  const headers = new Headers({ "Cache-Control": "no-store" });
  headers.append("Set-Cookie", `fh_native_selected_session=; ${cookieBase}; Max-Age=0`);
  headers.append("Set-Cookie", `fh_native_session=; ${cookieBase}; Max-Age=0`);
  if (new URL(request.url).searchParams.get("native") === "ios") {
    // This durable tombstone prevents a stale Clerk WebView cookie from
    // restoring authentication after the native app is force-closed.
    headers.append("Set-Cookie", `fh_native_signed_out=${Math.floor(Date.now() / 1000)}; ${cookieBase}; Max-Age=31536000`);
  }
  return new Response(null, { status: 204, headers });
}

export async function POST(request: Request) {
  const headers = new Headers({ "Cache-Control": "no-store" });
  let expectedEmail = "";
  try {
    const body = await request.json() as { expectedEmail?: string };
    expectedEmail = body.expectedEmail?.trim().toLowerCase() ?? "";
  } catch {
    // Native Apple exchange and older clients do not provide an email guard.
  }
  const keys = await getClerkRuntimeKeys();
  if (!keys) return Response.json({ error: "Native authentication is unavailable" }, { status: 503, headers });
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  let userId = "";
  if (token) {
    try {
      const payload = await verifyToken(token, { secretKey: keys.secretKey });
      userId = payload.sub ?? "";
    } catch {
      return Response.json({ error: "Native session could not be verified" }, { status: 401, headers });
    }
  } else {
    userId = (await auth()).userId ?? "";
  }
  if (!userId) return Response.json({ error: "A signed-in account is required" }, { status: 401, headers });

  try {
    const user = await (await clerkClient()).users.getUser(userId);
    const primaryEmail = user.emailAddresses.find((entry) => entry.id === user.primaryEmailAddressId);
    if (primaryEmail?.verification?.status !== "verified")
      return Response.json({ error: "A verified email is required" }, { status: 401, headers });
    const email = primaryEmail.emailAddress.trim().toLowerCase();
    if (expectedEmail && email !== expectedEmail)
      return Response.json({ error: "The authenticated account did not match the selected email" }, { status: 409, headers });
    const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || email;
    const session = await createNativeSession(userId, keys.secretKey, { email, displayName });
    headers.append("Set-Cookie", `fh_native_signed_out=; ${cookieBase}; Max-Age=0`);
    if (expectedEmail)
      headers.append("Set-Cookie", `fh_native_selected_session=${session}; ${cookieBase}; Max-Age=2592000`);
    headers.append("Set-Cookie", `fh_native_session=${session}; ${cookieBase}; Max-Age=2592000`);
    return Response.json({ session, email }, { status: 200, headers });
  } catch {
    return Response.json({ error: "Native session could not be created" }, { status: 500, headers });
  }
}
