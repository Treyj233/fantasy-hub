"use client";

import { useSignIn } from "@clerk/nextjs";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export default function NativeAuthTicket() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const searchParams = useSearchParams();
  const ticket = searchParams.get("ticket");
  const attempted = useRef(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (!attempted.current) setError("Secure sign-in could not start. Please try again.");
    }, 8000);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (attempted.current) return;
    if (ticket) {
      try {
        const acceptanceUrl = new URL(ticket);
        const clerkHosted = acceptanceUrl.hostname === "clerk.com" ||
          acceptanceUrl.hostname.endsWith(".clerk.com") ||
          acceptanceUrl.hostname.endsWith(".accounts.dev");
        if (acceptanceUrl.protocol === "https:" && clerkHosted) {
          attempted.current = true;
          window.location.replace(acceptanceUrl.toString());
          return;
        }
      } catch {
        // Legacy raw tickets continue through the embedded Clerk flow below.
      }
    }
    if (!isLoaded) return;
    attempted.current = true;
    if (!ticket) return;

    void signIn.create({ strategy: "ticket", ticket })
      .then(async (result) => {
        if (result.status !== "complete" || !result.createdSessionId) {
          throw new Error("Apple sign-in did not create a complete session.");
        }
        await setActive({ session: result.createdSessionId });
        window.location.replace("/");
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Unable to finish Apple sign-in. Please try again.");
      });
  }, [isLoaded, setActive, signIn, ticket]);

  const visibleError = ticket ? error : "The secure sign-in ticket is missing. Please try again.";

  return <main className="launch-splash" role="status" aria-live="polite">
    <section className="launch-splash-lockup">
      <div className="launch-splash-logo"><span aria-hidden="true" /><img src="/marketing/app-store/fh-blue-app-mark.png" alt="Fantasy Hub" /></div>
      <p>{visibleError || "Finishing Apple sign-in"}</p>
      {visibleError ? <Link className="native-auth-return-link" href="/native-sign-in">Try sign-in again</Link> : null}
    </section>
  </main>;
}
