type ApnsConfig = { keyId: string; teamId: string; privateKey: string; topic: string; production: boolean };

async function config(): Promise<ApnsConfig | null> {
  let env: Record<string, unknown> = process.env as Record<string, unknown>;
  try { env = (await import("cloudflare:workers")).env as unknown as Record<string, unknown>; } catch { /* local tooling */ }
  const value = {
    keyId: String(env.APPLE_APNS_KEY_ID ?? ""),
    teamId: String(env.APPLE_APNS_TEAM_ID ?? ""),
    privateKey: String(env.APPLE_APNS_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    topic: String(env.APPLE_APNS_TOPIC ?? "com.fantasyhubapp.ios"),
    production: String(env.APPLE_APNS_ENVIRONMENT ?? "production") !== "sandbox",
  };
  return value.keyId && value.teamId && value.privateKey ? value : null;
}

function base64url(value: Uint8Array | string) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function bearerToken(value: ApnsConfig) {
  const pem = value.privateKey.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const binary = Uint8Array.from(atob(pem), (character) => character.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", binary, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const header = base64url(JSON.stringify({ alg: "ES256", kid: value.keyId }));
  const payload = base64url(JSON.stringify({ iss: value.teamId, iat: Math.floor(Date.now() / 1000) }));
  const message = `${header}.${payload}`;
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(message));
  return `${message}.${base64url(new Uint8Array(signature))}`;
}

export type ApplePushCategory = "KICKOFF_SOON" | "SLATE_STARTED" | "BIG_PLAY" | "MATCHUP_RESULT" | "CLOSE_GAME" | "PATH_TO_VICTORY" | "WEATHER_RISK" | "LINEUP_URGENCY" | "INJURY_STATUS" | "GENERAL";

export async function sendApplePush(token: string, notification: { title: string; body: string; path?: string; category?: ApplePushCategory; threadId?: string; interruptionLevel?: "active" | "time-sensitive" }) {
  const value = await config();
  if (!value) throw new Error("APNs credentials are not configured");
  const response = await fetch(`https://${value.production ? "api.push.apple.com" : "api.sandbox.push.apple.com"}/3/device/${encodeURIComponent(token)}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${await bearerToken(value)}`,
      "apns-topic": value.topic,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      aps: {
        alert: { title: notification.title, body: notification.body },
        sound: "default",
        category: notification.category ?? "GENERAL",
        "thread-id": notification.threadId ?? "fantasy-hub",
        "interruption-level": notification.interruptionLevel ?? "active",
      },
      path: notification.path ?? "/",
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    const error = new Error(`APNs rejected notification (${response.status}): ${detail}`) as Error & { status?: number; reason?: string };
    error.status = response.status;
    error.reason = detail;
    throw error;
  }
}
