"use client";

import { useClerk } from "@clerk/nextjs";
import { useEffect, useState } from "react";

export default function SignOutPage() {
  const { signOut } = useClerk();
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // Clerk performs the redirect only after the active session is invalidated.
    // Never race it with a timer: an early redirect lets the existing session
    // auto-complete sign-in and sends the user straight back into the app.
    void signOut({ redirectUrl: "/sign-in" }).catch((signOutError) => {
      console.error("Fantasy Hub sign-out failed", signOutError);
      setError(true);
    });
  }, [attempt, signOut]);

  return (
    <main className="clerk-auth-shell">
      {error ? (
        <section className="clerk-auth-card" role="alert">
          <h1>Sign out did not finish</h1>
          <p>Your session is still protected. Try signing out again.</p>
          <button type="button" onClick={() => {
            setError(false);
            setAttempt((value) => value + 1);
          }}>
            Try again
          </button>
        </section>
      ) : (
        <p aria-live="polite">Signing you out…</p>
      )}
    </main>
  );
}
