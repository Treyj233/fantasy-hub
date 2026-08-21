"use client";

import { useClerk } from "@clerk/nextjs";
import { FormEvent, useState } from "react";
import { NATIVE_AUTH_EMAIL_KEY } from "./native-auth-intent";

export default function NativeEmailSignIn() {
  const { client, setActive } = useClerk();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (working) return;
    // iOS Password AutoFill can update the visible input without delivering a
    // React change event. Read the submitted controls so the account the user
    // sees is always the account we authenticate.
    const formData = new FormData(event.currentTarget);
    const submittedEmail = String(formData.get("email") ?? email);
    const submittedPassword = String(formData.get("password") ?? password);
    const normalizedEmail = submittedEmail.trim().toLowerCase();
    if (!normalizedEmail || !submittedPassword) return;
    setWorking(true);
    setError("");
    window.localStorage.setItem(NATIVE_AUTH_EMAIL_KEY, normalizedEmail);
    try {
      // Do not let a Clerk session left in the WebView satisfy a new email
      // attempt. The password attempt below must create a session for the
      // identifier that was explicitly submitted.
      await setActive({ session: null });
      const completedSignIn = await client.signIn.create({
        identifier: normalizedEmail,
        password: submittedPassword,
        strategy: "password",
      });
      if (completedSignIn.status !== "complete" || !completedSignIn.createdSessionId)
        throw new Error("This account needs an additional verification step");
      const session = client.sessions.find((candidate) => candidate.id === completedSignIn.createdSessionId);
      if (!session) throw new Error("Email session was not created");
      const sessionToken = await session.getToken({ skipCache: true });
      if (!sessionToken) throw new Error("Email session did not provide a secure token");
      const response = await fetch("/api/native-auth/session", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Authorization": `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ expectedEmail: normalizedEmail }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || "Unable to activate the native email session");
      }
      const nativeSession = await response.json() as { session?: string; email?: string };
      if (!nativeSession.session || nativeSession.email?.trim().toLowerCase() !== normalizedEmail)
        throw new Error("Native email session did not match the selected account");
      for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
        const key = window.localStorage.key(index);
        if (key?.startsWith("fantasy-hub-account-bootstrap:") || key?.startsWith("fantasy-hub-league-bootstrap:"))
          window.localStorage.removeItem(key);
      }
      window.localStorage.removeItem("fantasy-hub-native-user");
      window.localStorage.removeItem("fantasy-hub-active-league");
      window.localStorage.removeItem(NATIVE_AUTH_EMAIL_KEY);
      const installForm = document.createElement("form");
      installForm.method = "POST";
      installForm.action = "/api/native-auth/install";
      for (const [name, value] of Object.entries({ session: nativeSession.session, expectedEmail: normalizedEmail })) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = value;
        installForm.appendChild(input);
      }
      document.body.appendChild(installForm);
      installForm.submit();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Email sign-in could not be completed");
      setWorking(false);
    }
  }

  return <form className="native-email-sign-in" onSubmit={submit}>
    <span>OR CONTINUE WITH EMAIL</span>
    <label htmlFor="native-email-address">Email address</label>
    <input id="native-email-address" name="email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
    <label htmlFor="native-email-password">Password</label>
    <input id="native-email-password" name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
    <button type="submit" disabled={working}>{working ? "Signing in…" : "Sign in with email"}</button>
    {error ? <p className="native-sign-in-error" role="alert">{error}</p> : null}
    <a href="/sign-up?native=ios">Create an account</a>
  </form>;
}
