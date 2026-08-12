import { SignIn } from "@clerk/nextjs";
import Link from "next/link";
import { headers } from "next/headers";
import { chargersClerkAppearance } from "../../entry-theme";

export default async function SignInPage() {
  const userAgent = (await headers()).get("user-agent") ?? "";
  const nativeIos = userAgent.includes("FantasyHub-iOS/");
  const nativeAppearance = nativeIos ? {
    ...chargersClerkAppearance,
    elements: {
      ...chargersClerkAppearance.elements,
      socialButtonsBlockButton: { display: "none" },
      dividerRow: { display: "none" },
    },
  } : chargersClerkAppearance;
  return <main className="clerk-auth-shell chargers-entry-shell">
    <Link className="clerk-auth-brand" href="/" aria-label="Fantasy Hub home">FH</Link>
    <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" forceRedirectUrl="/" appearance={nativeAppearance} />
    {!nativeIos && <a className="clerk-chatgpt-option" href="/signin-with-chatgpt?return_to=/">Prefer ChatGPT? Continue here</a>}
  </main>;
}
