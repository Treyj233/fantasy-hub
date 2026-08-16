"use client";

import { useSignIn } from "@clerk/nextjs";
import Link from "next/link";
import { useState } from "react";
import { nativeAppleCredential } from "../native-runtime";

export default function NativeSignInPage() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function continueWithApple() {
    if (!isLoaded || working) return;
    setWorking(true);
    setError("");
    try {
      const credential = await nativeAppleCredential();
      if (credential.cancelled) return;
      if (!credential.identityToken) throw new Error("Apple did not return a sign-in credential.");
      const result = await signIn.create({
        strategy: "apple_id_token",
        token: credential.identityToken,
        signUpIfMissing: true,
      });
      if (result.status !== "complete" || !result.createdSessionId) {
        throw new Error("Clerk could not complete Apple sign-in.");
      }
      await setActive({ session: result.createdSessionId });
      window.location.replace("/");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Apple sign-in could not be completed.");
    } finally {
      setWorking(false);
    }
  }

  return <main className="clerk-auth-shell chargers-entry-shell">
    <section className="auth-card">
      <span>FANTASY HUB</span>
      <h1>Welcome back.</h1>
      <p>Sign in securely without leaving the app.</p>
      <button className="auth-primary" type="button" disabled={!isLoaded || working} onClick={continueWithApple}>
        {working ? "Signing in…" : "Sign in with Apple"}
      </button>
      {error ? <p role="alert">{error}</p> : null}
      <Link className="auth-secondary" href="/sign-in">Use email or another method</Link>
    </section>
  </main>;
}
