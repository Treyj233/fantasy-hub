import { SignIn } from "@clerk/nextjs";
import Link from "next/link";
import { chargersClerkAppearance } from "../../entry-theme";

export default function SignInPage() {
  return <main className="clerk-auth-shell chargers-entry-shell">
    <Link className="clerk-auth-brand" href="/" aria-label="Fantasy Hub home">FH</Link>
    <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" forceRedirectUrl="/" appearance={chargersClerkAppearance} />
    <a className="clerk-chatgpt-option chatgpt-web-only" href="/signin-with-chatgpt?return_to=/">Prefer ChatGPT? Continue here</a>
  </main>;
}
