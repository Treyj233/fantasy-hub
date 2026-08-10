"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[Fantasy Hub] Route render failed", error);
    void fetch("/api/client-error", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        digest: error.digest,
        stack: error.stack?.slice(0, 4000),
        path: window.location.pathname,
      }),
    }).catch(() => undefined);
  }, [error]);

  return (
    <main className="fatal-recovery">
      <section>
        <span>FANTASY HUB RECOVERY</span>
        <h1>The dashboard hit a rendering error.</h1>
        <p>
          Your league data is safe. Retry the dashboard, or clear only Fantasy
          Hub&apos;s saved display preferences if the problem continues.
        </p>
        <div>
          <button onClick={() => unstable_retry()}>Retry dashboard</button>
          <button
            className="secondary"
            onClick={() => {
              [
                "fantasy-hub-theme",
                "fantasy-hub-team-theme",
                "fantasy-hub-sidebar-collapsed",
                "fantasy-hub-league-order",
              ].forEach((key) => window.localStorage.removeItem(key));
              window.location.reload();
            }}
          >
            Reset display settings
          </button>
        </div>
        {error.digest && <small>Reference: {error.digest}</small>}
      </section>
    </main>
  );
}
