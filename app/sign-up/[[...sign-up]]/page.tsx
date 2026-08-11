import { SignUp } from "@clerk/nextjs";
import Link from "next/link";

export default function SignUpPage() {
  return <main className="clerk-auth-shell">
    <Link className="clerk-auth-brand" href="/" aria-label="Fantasy Hub home">FH</Link>
    <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" forceRedirectUrl="/" />
  </main>;
}
