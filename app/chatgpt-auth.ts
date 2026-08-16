import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { accountIdentities, sleeperConnections, subscriptions, userPreferences } from "../db/schema";
import { getClerkRuntimeKeys } from "./clerk-config";

export type ChatGPTUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
  provider: "clerk" | "chatgpt";
  signOutPath: string;
};

const USER_ID_HEADER = "oai-authenticated-user-id";
const USER_EMAIL_HEADER = "oai-authenticated-user-email";
const USER_FULL_NAME_HEADER = "oai-authenticated-user-full-name";
const USER_FULL_NAME_ENCODING_HEADER =
  "oai-authenticated-user-full-name-encoding";
const PERCENT_ENCODED_UTF8 = "percent-encoded-utf-8";
const SIGN_IN_PATH = "/signin-with-chatgpt";
const SIGN_OUT_PATH = "/signout-with-chatgpt";
const CALLBACK_PATH = "/callback";

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const clerkUser = await getClerkUser();
  if (clerkUser) return clerkUser;

  const requestHeaders = await headers();
  const userId = requestHeaders.get(USER_ID_HEADER);
  const email = requestHeaders.get(USER_EMAIL_HEADER);
  if (!userId || !email) return null;

  const encodedFullName = requestHeaders.get(USER_FULL_NAME_HEADER);
  const fullName =
    encodedFullName &&
    requestHeaders.get(USER_FULL_NAME_ENCODING_HEADER) === PERCENT_ENCODED_UTF8
      ? safeDecodeURIComponent(encodedFullName)
      : null;

  return {
    userId: await resolveCanonicalUserId("chatgpt", userId, email),
    displayName: fullName ?? email,
    email,
    fullName,
    provider: "chatgpt",
    signOutPath: chatGPTSignOutPath(),
  };
}

async function getClerkUser(): Promise<ChatGPTUser | null> {
  if (!await getClerkRuntimeKeys()) return null;
  const session = await auth();
  if (!session.userId) return null;
  const user = await currentUser();
  if (!user) return null;
  const primaryEmail = user.emailAddresses.find((entry) => entry.id === user.primaryEmailAddressId);
  const verifiedEmail = primaryEmail?.verification?.status === "verified" ? primaryEmail.emailAddress : null;
  if (!verifiedEmail) return null;
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ") || null;
  return {
    userId: await resolveCanonicalUserId("clerk", user.id, verifiedEmail),
    displayName: fullName ?? user.username ?? verifiedEmail,
    email: verifiedEmail,
    fullName,
    provider: "clerk",
    signOutPath: "/sign-out",
  };
}

async function resolveCanonicalUserId(provider: "clerk" | "chatgpt", providerUserId: string, email: string): Promise<string> {
  const db = await getDb();
  const [existingIdentity] = await db.select().from(accountIdentities).where(and(
    eq(accountIdentities.provider, provider),
    eq(accountIdentities.providerUserId, providerUserId),
  )).limit(1);

  const normalizedEmail = email.trim().toLowerCase();
  const [connection] = await db.select({ userId: sleeperConnections.userId }).from(sleeperConnections)
    .where(sql`lower(${sleeperConnections.email}) = ${normalizedEmail}`).limit(1);
  const preferenceRows = connection ? [] : await db.select({ userId: userPreferences.userId }).from(userPreferences)
    .where(sql`lower(${userPreferences.email}) = ${normalizedEmail}`).limit(1);
  const subscriptionRows = connection || preferenceRows[0] ? [] : await db.select({ userId: subscriptions.userId }).from(subscriptions)
    .where(sql`lower(${subscriptions.email}) = ${normalizedEmail}`).limit(1);
  const emailIdentityRows = connection || preferenceRows[0] || subscriptionRows[0] ? [] : await db.select({ canonicalUserId: accountIdentities.canonicalUserId }).from(accountIdentities)
    .where(sql`lower(${accountIdentities.verifiedEmail}) = ${normalizedEmail}`).limit(1);
  const canonicalUserId = connection?.userId ?? preferenceRows[0]?.userId ?? subscriptionRows[0]?.userId ?? emailIdentityRows[0]?.canonicalUserId ?? existingIdentity?.canonicalUserId ?? `${provider}:${providerUserId}`;
  if (existingIdentity) {
    if (existingIdentity.canonicalUserId !== canonicalUserId || existingIdentity.verifiedEmail !== normalizedEmail) {
      await db.update(accountIdentities).set({ canonicalUserId, verifiedEmail: normalizedEmail, updatedAt: new Date().toISOString() })
        .where(eq(accountIdentities.id, existingIdentity.id));
    }
    return canonicalUserId;
  }
  await db.insert(accountIdentities).values({
    id: crypto.randomUUID(), provider, providerUserId, canonicalUserId,
    verifiedEmail: normalizedEmail, updatedAt: new Date().toISOString(),
  }).onConflictDoNothing();
  const [createdIdentity] = await db.select().from(accountIdentities).where(and(
    eq(accountIdentities.provider, provider),
    eq(accountIdentities.providerUserId, providerUserId),
  )).limit(1);
  return createdIdentity?.canonicalUserId ?? canonicalUserId;
}

export async function requireChatGPTUser(
  returnTo: string,
): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (user) return user;

  redirect(chatGPTSignInPath(returnTo));
}

export function chatGPTSignInPath(returnTo: string): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_IN_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export function chatGPTSignOutPath(returnTo = "/"): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_OUT_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";

  let url: URL;
  try {
    url = new URL(value, "https://app.local");
  } catch {
    return "/";
  }
  if (url.origin !== "https://app.local") return "/";
  if (isReservedAuthPath(url.pathname)) return "/";

  return `${url.pathname}${url.search}${url.hash}`;
}

function isReservedAuthPath(pathname: string): boolean {
  return (
    pathname === SIGN_IN_PATH ||
    pathname === SIGN_OUT_PATH ||
    pathname === CALLBACK_PATH
  );
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
