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
      const enteredEmail = window.localStorage.getItem(NATIVE_AUTH_EMAIL_KEY)?.trim().toLowerCase() ?? "";
      const newestSession = [...sessions].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0];
      const matchingSession = enteredEmail
        ? sessions.find((session) => session.user?.primaryEmailAddress?.emailAddress.trim().toLowerCase() === enteredEmail)
        : newestSession;
      if (!matchingSession) throw new Error("Selected account session was not created");
      const expectedEmail = matchingSession.user?.primaryEmailAddress?.emailAddress.trim().toLowerCase() ?? "";
      if (!expectedEmail || (enteredEmail && expectedEmail !== enteredEmail))
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
