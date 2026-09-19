import { SignUp } from "@clerk/nextjs";
import Link from "next/link";
import { chargersClerkAppearance, nativeEmailOnlyClerkAppearance } from "../../entry-theme";
import NativeAuthIntent from "../../native-auth-intent";
import NativeAppleSignIn from "../../sign-in/[[...sign-in]]/native-apple-sign-in";

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ native?: string }> }) {
  const params = await searchParams;
  const nativeIos = params.native === "ios";
  const nativeApp = nativeIos || params.native === "android";
  const emailSignUp = <><NativeAuthIntent /><SignUp routing="path" path="/sign-up" signInUrl={nativeApp ? "/native-sign-in" : "/sign-in"} forceRedirectUrl={nativeApp ? "/native-auth-return" : "/"} appearance={nativeApp ? nativeEmailOnlyClerkAppearance : chargersClerkAppearance} /></>;
  return <main className="clerk-auth-shell chargers-entry-shell">
    <Link className="clerk-auth-brand" href="/" aria-label="Fantasy Hub home">FH</Link>
    {nativeIos ? <div className="native-auth-card-stack"><NativeAppleSignIn mode="sign-up" />{emailSignUp}</div> : emailSignUp}
  </main>;
}
