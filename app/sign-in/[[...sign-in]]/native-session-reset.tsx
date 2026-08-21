"use client";

import { useClerk } from "@clerk/nextjs";
import { useEffect, useState } from "react";

export default function NativeSessionReset() {
  const { signOut } = useClerk();
  const [error, setError] = useState(false);

  useEffect(() => {
    void signOut()
      .then(() => window.location.replace("/native-sign-in"))
      .catch(() => setError(true));
  }, [signOut]);

  return <main className="launch-splash" role="status" aria-live="polite">
    <section className="launch-splash-lockup">
      <div className="launch-splash-logo"><span aria-hidden="true" /><img src="/marketing/app-store/fh-blue-app-mark.png" alt="Fantasy Hub" /></div>
      <p>{error ? "Sign-in reset needs another try" : "Preparing secure sign-in"}</p>
      {error ? <button className="native-auth-return-link" type="button" onClick={() => window.location.reload()}>Try again</button> : null}
    </section>
  </main>;
}
