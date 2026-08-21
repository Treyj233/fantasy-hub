"use client";

import { useClerk, useSessionList } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { isNativeIosApp, nativeAppleSignOut } from "../native-runtime";

export default function SignOutPage() {
  const { client, signOut } = useClerk();
  const { isLoaded, sessions } = useSessionList();
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isLoaded) return;
    void (async () => {
      try {
        const nativeIos = isNativeIosApp();
        const response = await fetch(`/api/native-auth/session${nativeIos ? "?native=ios" : ""}`, { method: "DELETE" });
        if (!response.ok) throw new Error("Fantasy Hub session cleanup failed");
        for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
          const key = window.localStorage.key(index);
          if (key?.startsWith("fantasy-hub-account-bootstrap:") || key?.startsWith("fantasy-hub-league-bootstrap:"))
            window.localStorage.removeItem(key);
        }
        window.localStorage.removeItem("fantasy-hub-native-user");
        window.localStorage.removeItem("fantasy-hub-active-league");
        window.localStorage.removeItem("fantasy-hub-native-auth-email");
        client.resetSignIn();
        client.resetSignUp();
        client.clearCache();
        if (nativeIos) {
          // The iOS app has both a Clerk session in the WebView and a native
          // Clerk session. Clear both: otherwise the persisted WebView cookie
          // authenticates the next cold launch even after native sign-out.
          // Email-authenticated users may not have a native Apple SDK session.
          // Its absence must never prevent the active Clerk WebView account
          // from being cleared and replaced with a different login.
          await nativeAppleSignOut().catch(() => undefined);
          await sessions.reduce(
            (pending, session) => pending.then(() => signOut({ sessionId: session.id })),
            Promise.resolve(),
          );
          window.location.replace("/native-sign-in");
          return;
        }
        await sessions.reduce(
          (pending, session) => pending.then(() => signOut({ sessionId: session.id })),
          Promise.resolve(),
        );
        window.location.replace("/sign-in");
      } catch (signOutError) {
        console.error("Fantasy Hub sign-out failed", signOutError);
        setError(true);
      }
    })();
  }, [attempt, client, isLoaded, sessions, signOut]);

  return (
    <main className="clerk-auth-shell chargers-entry-shell">
      {error ? (
        <section className="auth-card" role="alert">
          <span>FANTASY HUB</span>
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
        <section className="auth-card" aria-live="polite">
          <span>FANTASY HUB</span>
          <h1>Securing your exit.</h1>
          <p>Signing you out and clearing this device session…</p>
        </section>
      )}
    </main>
  );
}
