"use client";

import { useEffect } from "react";

export default function NativeAuthReturnClient({ appUrl }: { appUrl: string }) {
  useEffect(() => {
    window.location.replace(appUrl);
  }, [appUrl]);

  return <main className="launch-splash" role="status" aria-live="polite">
    <section className="launch-splash-lockup">
      <div className="launch-splash-logo"><span aria-hidden="true" /><img src="/marketing/app-store/fh-blue-app-mark.png" alt="Fantasy Hub" /></div>
      <p>Opening Fantasy Hub</p>
      <a className="native-auth-return-link" href={appUrl}>Open the Fantasy Hub app</a>
    </section>
  </main>;
}
