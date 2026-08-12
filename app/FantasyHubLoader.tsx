"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

function InitialLoadingShell() {
  const [progress, setProgress] = useState(8);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setProgress((current) =>
        Math.min(99, current + Math.max(0.7, (99 - current) * 0.07)),
      );
    }, 350);
    return () => window.clearInterval(timer);
  }, []);

  const roundedProgress = Math.round(progress);
  return (
    <main className="auth-shell account-loading-shell chargers-entry-shell">
      <section className="auth-card auth-loading">
        <span>FANTASY HUB</span>
        <h1>Opening your Command Center…</h1>
        <p>The dashboard shell is ready while league tools load on demand.</p>
        <div className="load-progress" role="progressbar" aria-label="Loading Fantasy Hub" aria-valuemin={0} aria-valuemax={100} aria-valuenow={roundedProgress}>
          <span style={{ width: `${roundedProgress}%` }} />
        </div>
        <small className="load-progress-label">Loading dashboard tools… {roundedProgress}%</small>
        <i />
        <i />
        <i />
      </section>
    </main>
  );
}

const FantasyHub = dynamic(() => import("./FantasyHub"), {
  ssr: false,
  loading: InitialLoadingShell,
});

export default function FantasyHubLoader({
  accountUser,
}: {
  accountUser: { displayName: string; email: string; provider: "clerk" | "chatgpt"; signOutPath: string } | null;
}) {
  return <FantasyHub accountUser={accountUser} />;
}
