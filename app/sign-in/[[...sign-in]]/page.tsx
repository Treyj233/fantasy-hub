import { SignIn } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { chargersClerkAppearance, nativeEmailOnlyClerkAppearance } from "../../entry-theme";
import NativeAppleSignIn from "./native-apple-sign-in";
import NativeSessionReset from "./native-session-reset";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ native?: string }> }) {
  const nativeIos = (await searchParams).native === "ios";
  const [{ userId }, cookieStore] = await Promise.all([auth(), cookies()]);
  const nativeSignedOut = nativeIos && cookieStore.get("fh_native_signed_out")?.value === "1";
  if (userId && nativeSignedOut) return <NativeSessionReset />;
  if (userId) redirect(nativeIos ? "/native-auth-return" : "/");
  return <main className="clerk-auth-shell chargers-entry-shell">
    <Link className="clerk-auth-brand" href="/" aria-label="Fantasy Hub home">FH</Link>
    {nativeIos ? <NativeAppleSignIn /> : null}
    <SignIn routing="path" path="/sign-in" signUpUrl={nativeIos ? "/sign-up?native=ios" : "/sign-up"} forceRedirectUrl={nativeIos ? "/native-auth-return" : "/"} appearance={nativeIos ? nativeEmailOnlyClerkAppearance : chargersClerkAppearance} />
    {!nativeIos ? <a className="clerk-chatgpt-option" href="/signin-with-chatgpt?return_to=/">Prefer ChatGPT? Continue here</a> : null}
  </main>;
}
