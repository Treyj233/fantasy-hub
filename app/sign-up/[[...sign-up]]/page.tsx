import { SignUp } from "@clerk/nextjs";
import Link from "next/link";
import { chargersClerkAppearance } from "../../entry-theme";

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ native?: string }> }) {
  const nativeIos = (await searchParams).native === "ios";
  return <main className="clerk-auth-shell chargers-entry-shell">
    <Link className="clerk-auth-brand" href="/" aria-label="Fantasy Hub home">FH</Link>
    <SignUp routing="path" path="/sign-up" signInUrl={nativeIos ? "/sign-in?native=ios" : "/sign-in"} forceRedirectUrl={nativeIos ? "/native-auth-return" : "/"} appearance={chargersClerkAppearance} />
  </main>;
}
