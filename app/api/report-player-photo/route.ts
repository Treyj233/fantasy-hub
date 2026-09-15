// Fixed-host public headshots only; never accept arbitrary upstream URLs.
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id || !/^\d{1,12}$/.test(id)) return new Response(null, { status: 400 });
  try {
    const response = await fetch(`https://sleepercdn.com/content/nfl/players/${id}.jpg`, {
      redirect: 'error', signal: AbortSignal.timeout(5000), next: { revalidate: 86400 },
    });
    if (!response.ok) return new Response(null, { status: 404 });
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > 2_000_000) return new Response(null, { status: 413 });
    const b = new Uint8Array(bytes);
    const type = b[0] === 0xff && b[1] === 0xd8 ? 'image/jpeg' : b[0] === 137 && b[1] === 80 ? 'image/png' : null;
    if (!type) return new Response(null, { status: 415 });
    return new Response(bytes, { headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' } });
  } catch { return new Response(null, { status: 502 }); }
}
