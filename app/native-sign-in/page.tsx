"use client";

import { SignIn, useAuth, useClerk } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { nativeEmailOnlyClerkAppearance } from "../entry-theme";
import NativeAppleSignIn from "../sign-in/[[...sign-in]]/native-apple-sign-in";
import LaunchSplash from "../LaunchSplash";

export default function NativeSignInPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const [sessionCleared, setSessionCleared] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setSessionCleared(true);
      return;
    }
    void signOut()
      .catch(() => undefined)
      .finally(() => setSessionCleared(true));
  }, [isLoaded, isSignedIn, signOut]);

  if (!isLoaded || !sessionCleared) return <LaunchSplash />;

  return <main className="clerk-auth-shell chargers-entry-shell">
    <a className="clerk-auth-brand" href="/" aria-label="Fantasy Hub home">FH</a>
    <div className="native-auth-card-stack">
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
