import { SignUp } from "@clerk/nextjs";
import Link from "next/link";
import { headers } from "next/headers";
import { chargersClerkAppearance } from "../../entry-theme";

export default async function SignUpPage() {
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
    <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" forceRedirectUrl="/" appearance={nativeAppearance} />
  </main>;
}
