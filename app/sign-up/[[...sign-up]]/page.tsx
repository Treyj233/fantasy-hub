import { SignUp } from "@clerk/nextjs";
import Link from "next/link";
import { chargersClerkAppearance } from "../../entry-theme";

export default function SignUpPage() {
  return <main className="clerk-auth-shell chargers-entry-shell">
    <Link className="clerk-auth-brand" href="/" aria-label="Fantasy Hub home">FH</Link>
    <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" forceRedirectUrl="/" appearance={chargersClerkAppearance} />
  </main>;
}
