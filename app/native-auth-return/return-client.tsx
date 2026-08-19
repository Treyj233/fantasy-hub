"use client";

import { useEffect, useState } from "react";

export default function NativeAuthReturnClient({ appUrl }: { appUrl: string }) {
  const [error, setError] = useState(false);

  function finishSignIn() {
    void fetch("/api/native-auth/session", { method: "POST" })
      .then((response) => {
        if (!response.ok) throw new Error("Unable to activate the native session");
        window.location.replace(appUrl);
      })
      .catch(() => setError(true));
  }

  useEffect(() => {
    finishSignIn();
    // The destination is stable for the lifetime of this handoff.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appUrl]);

  return <main className="launch-splash" role="status" aria-live="polite">
    <section className="launch-splash-lockup">
      <div className="launch-splash-logo"><span aria-hidden="true" /><img src="/marketing/app-store/fh-blue-app-mark.png" alt="Fantasy Hub" /></div>
      <p>{error ? "Fantasy Hub could not finish sign-in" : "Opening Fantasy Hub"}</p>
      {error ? <button className="native-auth-return-link" type="button" onClick={() => { setError(false); finishSignIn(); }}>Try again</button> : null}
    </section>
  </main>;
}
