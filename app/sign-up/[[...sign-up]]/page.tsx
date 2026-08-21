import { SignUp } from "@clerk/nextjs";
import Link from "next/link";
import { chargersClerkAppearance, nativeEmailOnlyClerkAppearance } from "../../entry-theme";
import NativeAppleSignIn from "../../sign-in/[[...sign-in]]/native-apple-sign-in";

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ native?: string }> }) {
  const nativeIos = (await searchParams).native === "ios";
  const emailSignUp = <SignUp routing="path" path="/sign-up" signInUrl={nativeIos ? "/native-sign-in" : "/sign-in"} forceRedirectUrl={nativeIos ? "/native-auth-return" : "/"} appearance={nativeIos ? nativeEmailOnlyClerkAppearance : chargersClerkAppearance} />;
  return <main className="clerk-auth-shell chargers-entry-shell">
    <Link className="clerk-auth-brand" href="/" aria-label="Fantasy Hub home">FH</Link>
    {nativeIos ? <div className="native-auth-card-stack"><NativeAppleSignIn mode="sign-up" />{emailSignUp}</div> : emailSignUp}
  </main>;
}
