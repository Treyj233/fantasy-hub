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
  return new Response(null, {
    status: 204,
    headers: {
      "Set-Cookie": `fh_native_signed_out=; ${cookieBase}; Max-Age=0`,
      "Cache-Control": "no-store",
    },
  });
}
