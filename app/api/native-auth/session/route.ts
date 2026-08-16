export async function DELETE() {
  return new Response(null, {
    status: 204,
    headers: {
      "Set-Cookie": "fh_native_session=; Path=/; Domain=fantasyhubapp.com; Max-Age=0; Secure; HttpOnly; SameSite=Lax",
      "Cache-Control": "no-store",
    },
  });
}
