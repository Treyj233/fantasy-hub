"use client";

import Link from "next/link";
import { useState } from "react";
import { nativeAppleCredential } from "../native-runtime";

export default function NativeSignInPage() {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function continueWithApple() {
    if (working) return;
    setWorking(true);
    setError("");
    try {
      const result = await nativeAppleCredential();
      if (result.cancelled) return;
      if (!result.authenticated) throw new Error("Clerk did not create a secure session.");
      if (!result.redirect) throw new Error("Fantasy Hub did not receive a secure browser session.");
      window.location.replace(result.redirect);
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
      <button className="auth-primary" type="button" disabled={working} onClick={continueWithApple}>
        {working ? "Signing in…" : "Sign in with Apple"}
      </button>
      {error ? <p role="alert">{error}</p> : null}
      <Link className="auth-secondary" href="/sign-in">Use email or another method</Link>
    </section>
  </main>;
}
