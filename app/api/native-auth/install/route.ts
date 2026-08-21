import { getClerkRuntimeKeys } from "../../../clerk-config";
import { verifyNativeSession } from "../../../native-session";

const cookieBase = "Path=/; Domain=fantasyhubapp.com; Secure; HttpOnly; SameSite=Lax";

export async function POST(request: Request) {
  const form = await request.formData();
  const session = String(form.get("session") ?? "");
  const expectedEmail = String(form.get("expectedEmail") ?? "").trim().toLowerCase();
  const keys = await getClerkRuntimeKeys();
  const verified = keys && session ? await verifyNativeSession(session, keys.secretKey) : null;
  const verifiedEmail = verified?.email?.trim().toLowerCase() ?? "";
  if (!verified || verified.v !== 3 || !verifiedEmail || verifiedEmail !== expectedEmail)
    return Response.json({ error: "Native email session could not be installed" }, { status: 401 });

  const headers = new Headers({
    "Cache-Control": "no-store",
    "Location": "/native-app?handoff=1",
  });
  headers.append("Set-Cookie", `fh_native_signed_out=; ${cookieBase}; Max-Age=0`);
  headers.append("Set-Cookie", `fh_native_selected_session=${session}; ${cookieBase}; Max-Age=2592000`);
  return new Response(null, { status: 303, headers });
}
