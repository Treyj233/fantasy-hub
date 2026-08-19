"use client";

import { useState } from "react";
import { nativeAppleCredential } from "../../native-runtime";

export default function NativeAppleSignIn({ mode = "sign-in" }: { mode?: "sign-in" | "sign-up" }) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const signingUp = mode === "sign-up";

  async function continueWithApple() {
    if (working) return;
    setWorking(true);
    setError("");
    try {
      const result = await nativeAppleCredential();
      if (result.cancelled) return;
      if (!result.authenticated) throw new Error(signingUp ? "Clerk did not create your secure account." : "Clerk did not create a secure session.");
      if (!result.redirect) throw new Error("Fantasy Hub did not receive a secure browser session.");
      window.location.replace(result.redirect);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : signingUp ? "Apple account creation could not be completed." : "Apple sign-in could not be completed.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="native-sign-in-primary" aria-labelledby="native-sign-in-title">
      <span>FANTASY HUB</span>
      <h1 id="native-sign-in-title">{signingUp ? "Create your account." : "Welcome back."}</h1>
      <p>{signingUp ? "Start securely with Apple without leaving the app, or create an account with email below." : "Use Apple for the fastest in-app sign-in, or choose another secure method below."}</p>
      <button type="button" disabled={working} onClick={continueWithApple}>
        <b aria-hidden="true"></b>
        {working ? (signingUp ? "Creating account…" : "Signing in…") : (signingUp ? "Create account with Apple" : "Continue with Apple")}
      </button>
      {error ? <p className="native-sign-in-error" role="alert">{error}</p> : null}
      <div className="native-sign-in-divider"><span>OR CONTINUE WITH EMAIL</span></div>
    </section>
  );
}
