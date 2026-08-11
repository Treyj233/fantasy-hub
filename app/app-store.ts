import type { AppStoreServerAPIClient as AppStoreServerAPIClientType } from "@apple/app-store-server-library";

export const APP_STORE_PRODUCTS = new Set([
  "com.fantasyhubapp.pro.monthly",
  "com.fantasyhubapp.pro.season",
  "com.fantasyhubapp.pro.annual",
]);

type AppleRuntimeConfig = {
  issuerId: string;
  keyId: string;
  privateKey: string;
  bundleId: string;
};

async function runtimeConfig(): Promise<AppleRuntimeConfig | null> {
  let runtimeEnv: Record<string, unknown> = process.env as Record<string, unknown>;
  try {
    runtimeEnv = (await import("cloudflare:workers")).env as unknown as Record<string, unknown>;
  } catch {
    // Node-based tooling uses process.env.
  }
  const config = {
    issuerId: String(runtimeEnv.APPLE_APP_STORE_ISSUER_ID ?? ""),
    keyId: String(runtimeEnv.APPLE_APP_STORE_KEY_ID ?? ""),
    privateKey: String(runtimeEnv.APPLE_APP_STORE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    bundleId: String(runtimeEnv.APPLE_APP_STORE_BUNDLE_ID ?? "com.fantasyhubapp.ios"),
  };
  return config.issuerId && config.keyId && config.privateKey ? config : null;
}

function decodeJwsPayload(value: string) {
  const payload = value.split(".")[1];
  if (!payload) throw new Error("Apple returned an invalid signed transaction");
  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
}

export async function verifyAppleTransaction(transactionId: string) {
  const config = await runtimeConfig();
  if (!config) throw new Error("App Store Server credentials are not configured");
  // This package initializes cryptographic randomness when it is evaluated.
  // Cloudflare Workers only permits that work inside a request handler, so the
  // runtime import must stay inside this function rather than at module scope.
  const { AppStoreServerAPIClient, Environment } = await import("@apple/app-store-server-library");
  let response: Awaited<ReturnType<AppStoreServerAPIClientType["getTransactionInfo"]>> | null = null;
  let environment = "Production";
  try {
    response = await new AppStoreServerAPIClient(config.privateKey, config.keyId, config.issuerId, config.bundleId, Environment.PRODUCTION).getTransactionInfo(transactionId);
  } catch {
    environment = "Sandbox";
    response = await new AppStoreServerAPIClient(config.privateKey, config.keyId, config.issuerId, config.bundleId, Environment.SANDBOX).getTransactionInfo(transactionId);
  }
  if (!response.signedTransactionInfo) throw new Error("Apple did not return signed transaction information");
  const payload = decodeJwsPayload(response.signedTransactionInfo);
  if (payload.bundleId !== config.bundleId || payload.transactionId !== transactionId)
    throw new Error("Apple transaction identity does not match Fantasy Hub");
  const productId = String(payload.productId ?? "");
  if (!APP_STORE_PRODUCTS.has(productId)) throw new Error("Unknown Fantasy Hub App Store product");
  return {
    transactionId,
    originalTransactionId: String(payload.originalTransactionId ?? transactionId),
    productId,
    environment: String(payload.environment ?? environment),
    expiresAt: typeof payload.expiresDate === "number" ? new Date(payload.expiresDate).toISOString() : null,
    revokedAt: typeof payload.revocationDate === "number" ? new Date(payload.revocationDate).toISOString() : null,
  };
}
