"use client";

import { useSessionList } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { NATIVE_AUTH_EMAIL_KEY } from "../native-auth-intent";

export default function NativeAuthReturnClient() {
  const { isLoaded, sessions, setActive } = useSessionList();
  const [error, setError] = useState(false);

  async function finishSignIn() {
    if (!isLoaded) return;
    try {
      const expectedEmail = window.sessionStorage.getItem(NATIVE_AUTH_EMAIL_KEY)?.trim().toLowerCase() ?? "";
      const matchingSession = expectedEmail
        ? sessions.find((session) => session.user.primaryEmailAddress?.emailAddress.trim().toLowerCase() === expectedEmail)
        : undefined;
      if (expectedEmail && !matchingSession) throw new Error("Selected account session was not created");
      if (matchingSession) await setActive({ session: matchingSession.id });
      const response = await fetch("/api/native-auth/session", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedEmail }),
      });
      if (!response.ok) throw new Error("Unable to activate the native session");
      window.sessionStorage.removeItem(NATIVE_AUTH_EMAIL_KEY);
      window.location.replace("/native-app?handoff=1");
    } catch {
      setError(true);
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
      <p>{error ? "The selected account did not match your sign-in" : "Opening Fantasy Hub"}</p>
      {error ? <button className="native-auth-return-link" type="button" onClick={() => window.location.replace("/native-sign-in")}>Sign in again</button> : null}
    </section>
  </main>;
}
