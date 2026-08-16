"use client";

import { useEffect } from "react";

export default function NativeAuthReturn() {
  useEffect(() => {
    window.location.replace("fantasyhub://auth/complete");
  }, []);

  return <main className="launch-splash" role="status" aria-live="polite">
    <section className="launch-splash-lockup">
      <div className="launch-splash-logo"><span aria-hidden="true" /><img src="/marketing/app-store/fh-blue-app-mark.png" alt="Fantasy Hub" /></div>
      <p>Returning to Fantasy Hub</p>
      <a className="native-auth-return-link" href="fantasyhub://auth/complete">Open the Fantasy Hub app</a>
    </section>
  </main>;
}
