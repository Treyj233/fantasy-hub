"use client";

import { useClerk, useSessionList } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { NATIVE_AUTH_EMAIL_KEY } from "../native-auth-intent";

export default function NativeAuthReturnClient() {
  const { isLoaded, sessions, setActive } = useSessionList();
  const { client } = useClerk();
  const [error, setError] = useState("");

  async function finishSignIn() {
    if (!isLoaded) return;
    try {
      const createdSessionId = client.signIn.createdSessionId ?? client.signUp.createdSessionId;
      const clerkIdentifier = client.signIn.identifier ?? client.signUp.emailAddress;
      // Clerk can retain the identifier from an older attempt after a new
      // session has completed. Prefer the address captured from the current
      // native form so a stale account cannot invalidate the new session.
      const enteredEmail = (window.localStorage.getItem(NATIVE_AUTH_EMAIL_KEY) ?? clerkIdentifier ?? "").trim().toLowerCase();
      // A typed email is authoritative. Never fall back to another session
      // (including a retained Gmail session) when the user chose an account.
      const matchingSession = enteredEmail
        ? sessions.find((session) => session.user?.primaryEmailAddress?.emailAddress.trim().toLowerCase() === enteredEmail)
        : ((createdSessionId
          ? sessions.find((session) => session.id === createdSessionId)
          : undefined)
          // The native sign-in page signs out every pre-existing Clerk session
          // before rendering. This fallback is only safe when no email intent
          // was captured from the current form.
          ?? (sessions.length === 1 ? sessions[0] : undefined));
      if (!matchingSession) throw new Error("Selected account session was not created");
      const expectedEmail = matchingSession.user?.primaryEmailAddress?.emailAddress.trim().toLowerCase() ?? "";
      if (!expectedEmail)
        throw new Error("Selected account does not have a primary email");
      if (enteredEmail && expectedEmail !== enteredEmail)
        throw new Error("Selected account session did not match the entered email");
      await setActive({ session: matchingSession.id });
      const sessionToken = await matchingSession.getToken({ skipCache: true });
      if (!sessionToken) throw new Error("Selected account session did not provide a secure token");
      const response = await fetch("/api/native-auth/session", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Authorization": `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ expectedEmail }),
      });
      if (!response.ok) throw new Error("Unable to activate the native session");
      for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
        const key = window.localStorage.key(index);
        if (key?.startsWith("fantasy-hub-account-bootstrap:") || key?.startsWith("fantasy-hub-league-bootstrap:"))
          window.localStorage.removeItem(key);
      }
      window.localStorage.removeItem("fantasy-hub-native-user");
      window.localStorage.removeItem("fantasy-hub-active-league");
      window.localStorage.removeItem(NATIVE_AUTH_EMAIL_KEY);
      window.location.replace("/native-app?handoff=1");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to finish sign-in");
    }
  }

  useEffect(() => {
    if (isLoaded) void finishSignIn();
    // The destination is stable for the lifetime of this handoff.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]);

  return <main className="launch-splash" role="status" aria-live="polite">
    <section className="launch-splash-lockup">
      <div className="launch-splash-logo"><span aria-hidden="true" /><img src="/marketing/app-store/fh-blue-app-mark.png" alt="Fantasy Hub" /></div>
      <p>{error || "Opening Fantasy Hub"}</p>
      {error ? <button className="native-auth-return-link" type="button" onClick={() => window.location.replace("/native-sign-in")}>Sign in again</button> : null}
    </section>
  </main>;
}
