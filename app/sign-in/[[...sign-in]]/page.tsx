import { SignIn } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { chargersClerkAppearance } from "../../entry-theme";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ native?: string }> }) {
  const { userId } = await auth();
  const nativeIos = (await searchParams).native === "ios";
  if (userId) redirect(nativeIos ? "/native-auth-return" : "/");
  return <main className="clerk-auth-shell chargers-entry-shell">
    <Link className="clerk-auth-brand" href="/" aria-label="Fantasy Hub home">FH</Link>
    <SignIn routing="path" path="/sign-in" signUpUrl={nativeIos ? "/sign-up?native=ios" : "/sign-up"} forceRedirectUrl={nativeIos ? "/native-auth-return" : "/"} appearance={chargersClerkAppearance} />
    <a className="clerk-chatgpt-option chatgpt-web-only" href="/signin-with-chatgpt?return_to=/">Prefer ChatGPT? Continue here</a>
  </main>;
}
