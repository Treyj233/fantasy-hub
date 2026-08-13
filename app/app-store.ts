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

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function privateKeyBytes(value: string) {
  let normalized = value.trim();
  if (normalized.startsWith('"') && normalized.endsWith('"')) {
    try {
      normalized = JSON.parse(normalized) as string;
    } catch {
      throw new Error("App Store private key has invalid quoting");
    }
  }
  normalized = normalized.replace(/\\r/g, "").replace(/\\n/g, "\n").trim();
  const match = normalized.match(/-----BEGIN PRIVATE KEY-----\s*([A-Za-z0-9+/=\s]+?)\s*-----END PRIVATE KEY-----/);
  const encoded = (match?.[1] ?? normalized).replace(/\s/g, "");
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0)
    throw new Error("App Store private key is not valid PKCS#8 PEM data");
  try {
    return Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
  } catch {
    throw new Error("App Store private key could not be decoded");
  }
}

async function appStoreToken(config: AppleRuntimeConfig) {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: Record<string, unknown>) => base64Url(new TextEncoder().encode(JSON.stringify(value)));
  const unsignedToken = `${encode({ alg: "ES256", kid: config.keyId, typ: "JWT" })}.${encode({
    iss: config.issuerId,
    iat: now,
    exp: now + 300,
    aud: "appstoreconnect-v1",
    bid: config.bundleId,
  })}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    privateKeyBytes(config.privateKey),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(unsignedToken),
  );
  return `${unsignedToken}.${base64Url(new Uint8Array(signature))}`;
}

async function getTransactionInfo(config: AppleRuntimeConfig, transactionId: string, sandbox: boolean) {
  const host = sandbox ? "api.storekit-sandbox.itunes.apple.com" : "api.storekit.itunes.apple.com";
  const response = await fetch(`https://${host}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${await appStoreToken(config)}`,
    },
  });
  if (!response.ok) throw new Error(`Apple transaction lookup failed (${response.status})`);
  return await response.json() as { signedTransactionInfo?: string };
}

export async function verifyAppleTransaction(transactionId: string) {
  const config = await runtimeConfig();
  if (!config) throw new Error("App Store Server credentials are not configured");
  let response: { signedTransactionInfo?: string };
  let environment = "Production";
  try {
    response = await getTransactionInfo(config, transactionId, false);
  } catch {
    environment = "Sandbox";
    response = await getTransactionInfo(config, transactionId, true);
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
