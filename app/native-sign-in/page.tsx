"use client";

import { useSignIn } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { nativeAppleCredential } from "../native-runtime";

export default function NativeSignInPage() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [identityToken, setIdentityToken] = useState("");
  const completing = useRef(false);

  useEffect(() => {
    if (!identityToken) return;
    if (!isLoaded) {
      const timeout = window.setTimeout(() => {
        setIdentityToken("");
        setWorking(false);
        setError("Fantasy Hub could not initialize secure sign-in. Please try again.");
      }, 12000);
      return () => window.clearTimeout(timeout);
    }
    if (completing.current) return;
    completing.current = true;

    void signIn.create({
      strategy: "apple_id_token",
      token: identityToken,
      signUpIfMissing: true,
    }).then(async (result) => {
      if (result.status !== "complete" || !result.createdSessionId) {
        throw new Error("Clerk could not complete Apple sign-in.");
      }
      await setActive({ session: result.createdSessionId });
      window.location.replace("/");
    }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "Apple sign-in could not be completed.");
      setWorking(false);
      setIdentityToken("");
      completing.current = false;
    });
  }, [identityToken, isLoaded, setActive, signIn]);

  async function continueWithApple() {
    if (working) return;
    setWorking(true);
    setError("");
    completing.current = false;
    try {
      const credential = await nativeAppleCredential();
      if (credential.cancelled) {
        setWorking(false);
        return;
      }
      if (!credential.identityToken) throw new Error("Apple did not return a sign-in credential.");
      setIdentityToken(credential.identityToken);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Apple sign-in could not be completed.");
      setWorking(false);
    }
  }

  return <main className="clerk-auth-shell chargers-entry-shell">
    <section className="auth-card">
      <span>FANTASY HUB</span>
      <h1>Welcome back.</h1>
      <p>Sign in securely without leaving the app.</p>
      <button className="auth-primary" type="button" disabled={working} onClick={continueWithApple}>
        {working ? (identityToken ? "Finishing sign-in…" : "Signing in…") : "Sign in with Apple"}
      </button>
      {error ? <p role="alert">{error}</p> : null}
      <Link className="auth-secondary" href="/sign-in">Use email or another method</Link>
    </section>
  </main>;
}
