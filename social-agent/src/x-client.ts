const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

const nonce = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const hmacSha1 = async (key: string, value: string) => {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
};

export type XCredentials = {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessTokenSecret: string;
  bearerToken?: string;
};

let appBearer: { token: string; expires: number } | null = null;

const getAppBearer = async (credentials: XCredentials) => {
  if (credentials.bearerToken) return credentials.bearerToken;
  if (appBearer && appBearer.expires > Date.now()) return appBearer.token;
  const basic = btoa(`${encode(credentials.apiKey)}:${encode(credentials.apiSecret)}`);
  const response = await fetch("https://api.twitter.com/oauth2/token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: "grant_type=client_credentials",
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`X bearer API ${response.status}: ${body.slice(0, 300)}`);
  const parsed = JSON.parse(body) as { access_token?: string };
  if (!parsed.access_token) throw new Error("X bearer API returned no access token");
  appBearer = { token: parsed.access_token, expires: Date.now() + 50 * 60 * 1000 };
  return appBearer.token;
};

const authorizationHeader = async (
  method: "GET" | "POST",
  endpoint: string,
  credentials: XCredentials,
  query: Record<string, string> = {},
) => {
  const oauth: Record<string, string> = {
    oauth_consumer_key: credentials.apiKey,
    oauth_nonce: nonce(),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: credentials.accessToken,
    oauth_version: "1.0",
  };
  const parameterString = Object.entries({ ...query, ...oauth })
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encode(key)}=${encode(value)}`)
    .join("&");
  const signatureBase = `${method}&${encode(endpoint)}&${encode(parameterString)}`;
  oauth.oauth_signature = await hmacSha1(
    `${encode(credentials.apiSecret)}&${encode(credentials.accessTokenSecret)}`,
    signatureBase,
  );
  return `OAuth ${Object.entries(oauth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encode(key)}="${encode(value)}"`)
    .join(", ")}`;
};

export async function xApiGet<T>(endpoint: string, query: Record<string, string>, credentials: XCredentials): Promise<T> {
  const url = new URL(endpoint);
  Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, { headers: { Authorization: `Bearer ${await getAppBearer(credentials)}` } });
  const body = await response.text();
  if (!response.ok) throw new Error(`X read API ${response.status}: ${body.slice(0, 300)}`);
  return JSON.parse(body) as T;
}

export async function createXPost(text: string, credentials: XCredentials) {
  const endpoint = "https://api.x.com/2/tweets";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: await authorizationHeader("POST", endpoint, credentials), "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`X API ${response.status}: ${body.slice(0, 300)}`);
  const parsed = JSON.parse(body) as { data?: { id?: string } };
  if (!parsed.data?.id) throw new Error("X API returned no post id");
  return parsed.data.id;
}
