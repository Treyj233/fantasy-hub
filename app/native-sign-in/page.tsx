"use client";

import { SignIn, useClerk, useSessionList } from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react";
import { nativeEmailOnlyClerkAppearance } from "../entry-theme";
import NativeAuthIntent from "../native-auth-intent";
import NativeAppleSignIn from "../sign-in/[[...sign-in]]/native-apple-sign-in";

export default function NativeSignInPage() {
  const { isLoaded, sessions } = useSessionList();
  const { client, signOut } = useClerk();
  const resetRequested = useRef(false);
  const [resetComplete, setResetComplete] = useState(false);
  const [resetError, setResetError] = useState(false);

  useEffect(() => {
    if (!isLoaded || resetRequested.current) return;
    resetRequested.current = true;
    void sessions.reduce(
      (pending, session) => pending.then(() => signOut({ sessionId: session.id })),
      Promise.resolve(),
    )
      .then(() => {
        client.resetSignIn();
        client.resetSignUp();
        client.clearCache();
        window.localStorage.removeItem("fantasy-hub-native-auth-email");
        setResetComplete(true);
      })
      .catch(() => {
        resetRequested.current = false;
        setResetError(true);
      });
  }, [client, isLoaded, sessions, signOut]);

  if (!isLoaded || !resetComplete) return <main className="launch-splash" role="status" aria-live="polite">
    <section className="launch-splash-lockup">
      <div className="launch-splash-logo"><span aria-hidden="true" /><img src="/marketing/app-store/fh-blue-app-mark.png" alt="Fantasy Hub" /></div>
      <p>{resetError ? "Fantasy Hub could not switch accounts" : "Preparing secure sign-in"}</p>
      {resetError ? <button className="native-auth-return-link" type="button" onClick={() => window.location.reload()}>Try again</button> : null}
    </section>
  </main>;

  return <main className="clerk-auth-shell chargers-entry-shell">
    <a className="clerk-auth-brand" href="/" aria-label="Fantasy Hub home">FH</a>
    <div className="native-auth-card-stack">
      <NativeAuthIntent />
      <NativeAppleSignIn />
      <SignIn
        routing="path"
        path="/native-sign-in"
        signUpUrl="/sign-up?native=ios"
        forceRedirectUrl="/native-auth-return"
        appearance={nativeEmailOnlyClerkAppearance}
      />
    </div>
  </main>;
}
