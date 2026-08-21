"use client";

import { useSignIn } from "@clerk/nextjs";
import { FormEvent, useState } from "react";
import { NATIVE_AUTH_EMAIL_KEY } from "./native-auth-intent";

export default function NativeEmailSignIn() {
  const { signIn } = useSignIn();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (working) return;
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) return;
    setWorking(true);
    setError("");
    window.localStorage.setItem(NATIVE_AUTH_EMAIL_KEY, normalizedEmail);
    try {
      const result = await signIn.password({ emailAddress: normalizedEmail, password });
      if (result.error) throw new Error(result.error.message || "Email or password was not accepted");
      const finalized = await signIn.finalize();
      if (finalized.error) throw new Error(finalized.error.message || "Email sign-in could not be completed");
      window.location.replace("/native-auth-return");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Email sign-in could not be completed");
      setWorking(false);
    }
  }

  return <form className="native-email-sign-in" onSubmit={submit}>
    <span>OR CONTINUE WITH EMAIL</span>
    <label htmlFor="native-email-address">Email address</label>
    <input id="native-email-address" type="email" autoComplete="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
    <label htmlFor="native-email-password">Password</label>
    <input id="native-email-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
    <button type="submit" disabled={working}>{working ? "Signing in…" : "Sign in with email"}</button>
    {error ? <p className="native-sign-in-error" role="alert">{error}</p> : null}
    <a href="/sign-up?native=ios">Create an account</a>
  </form>;
}
