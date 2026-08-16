import { clerkClient, verifyToken } from "@clerk/nextjs/server";
import { getClerkRuntimeKeys } from "../../../clerk-config";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const keys = await getClerkRuntimeKeys();
  if (!token || !keys) return Response.json({ error: "Secure native session required" }, { status: 401 });

  try {
    const payload = await verifyToken(token, { secretKey: keys.secretKey });
    if (!payload.sub) return Response.json({ error: "Secure native session required" }, { status: 401 });
    const client = await clerkClient();
    const signInToken = await client.signInTokens.createSignInToken({ userId: payload.sub, expiresInSeconds: 60 });
    return Response.json({ ticket: signInToken.token });
  } catch {
    return Response.json({ error: "Native session could not be verified" }, { status: 401 });
  }
}
