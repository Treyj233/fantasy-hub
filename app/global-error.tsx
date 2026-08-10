"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[Fantasy Hub] Root render failed", error);
    void fetch("/api/client-error", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        digest: error.digest,
        stack: error.stack?.slice(0, 4000),
        path: window.location.pathname,
        root: true,
      }),
    }).catch(() => undefined);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#f4f1e8", color: "#17201b", fontFamily: "system-ui, sans-serif" }}>
        <main className="fatal-recovery">
          <section>
            <span>FANTASY HUB RECOVERY</span>
            <h1>The dashboard could not finish loading.</h1>
            <p>Your account and league data are safe. Retry the application to restore the dashboard.</p>
            <button onClick={() => unstable_retry()}>Retry dashboard</button>
            {error.digest && <small>Reference: {error.digest}</small>}
          </section>
        </main>
      </body>
    </html>
  );
}
