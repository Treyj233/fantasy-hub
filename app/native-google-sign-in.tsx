"use client";

import { useClerk } from "@clerk/nextjs";
import { registerPlugin } from "@capacitor/core";
import { useEffect, useState } from "react";
import { NATIVE_AUTH_EMAIL_KEY } from "./native-auth-intent";
import "./native-google-sign-in.css";

const GoogleAuth = registerPlugin<{
  availability(): Promise<{ configured: boolean }>;
  signIn(): Promise<{ token?: string; cancelled?: boolean }>;
}>("FantasyHubGoogleAuth");

export default function NativeGoogleSignIn() {
  const clerk = useClerk();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void GoogleAuth.availability().then((value) => {
      if (active) setConfigured(value.configured);
    }).catch(() => { if (active) setConfigured(false); });
    return () => { active = false; };
  }, []);

  async function signIn() {
    if (working || !configured) return;
    setWorking(true);
    setError("");
    try {
      const credential = await GoogleAuth.signIn();
      if (credential.cancelled) return;
      if (!credential.token) throw new Error("Google did not return a sign-in credential.");
      window.localStorage.removeItem(NATIVE_AUTH_EMAIL_KEY);
      const reset = await fetch("/api/native-auth/session?native=android", { method: "DELETE", credentials: "include", cache: "no-store" });
      if (!reset.ok) throw new Error("Unable to clear the previous account. Please try again.");
      // Clerk verifies Google's signature, audience and account before issuing a session.
      const result = await clerk.authenticateWithGoogleOneTap({ token: credential.token });
      if (result.status !== "complete" || !result.createdSessionId) {
        // Clerk's email-only forms complete missing profile / MFA requirements.
        const isSignUp = 'missingFields' in result;
        window.location.assign(isSignUp ? "/sign-up?native=android" : "/sign-in?native=android");
        return;
      }
      await clerk.setActive({ session: result.createdSessionId });
      window.location.replace("/native-auth-return");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Google sign-in could not complete. Please try again.");
    } finally {
      setWorking(false);
    }
  }

  return <section className="native-sign-in-primary native-google-sign-in" aria-labelledby="google-sign-in-title">
    <span>FANTASY HUB</span>
    <h1 id="google-sign-in-title">Your leagues. One login.</h1>
    <p>Continue with Google or sign in with email below.</p>
    <button type="button" disabled={!configured || working} onClick={signIn}>
      <span aria-hidden="true">G</span>{working ? "Signing in…" : "Continue with Google"}
    </button>
    {configured === false ? <p role="status">Google sign-in needs an updated Android build. Email sign-in is available below.</p> : null}
    {error ? <p className="native-sign-in-error" role="alert">{error}</p> : null}
  </section>;
}
