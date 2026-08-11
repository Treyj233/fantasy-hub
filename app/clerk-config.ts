export type ClerkRuntimeKeys = { publishableKey: string; secretKey: string };

export async function getClerkRuntimeKeys(): Promise<ClerkRuntimeKeys | null> {
  let runtimeEnv: Record<string, unknown> = {};
  try {
    runtimeEnv = (await import("cloudflare:workers")).env as unknown as Record<string, unknown>;
  } catch {
    // Local builds and tooling do not expose the Cloudflare runtime module.
  }
  const publishableKey = String(runtimeEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "");
  const secretKey = String(runtimeEnv.CLERK_SECRET_KEY ?? process.env.CLERK_SECRET_KEY ?? "");
  return publishableKey && secretKey ? { publishableKey, secretKey } : null;
}
