"use client";

import dynamic from "next/dynamic";

const FantasyHub = dynamic(() => import("./FantasyHub"), {
  ssr: false,
  loading: () => (
    <main className="auth-shell account-loading-shell">
      <section className="auth-card auth-loading">
        <span>FANTASY HUB</span>
        <h1>Opening your Command Center…</h1>
        <p>The dashboard shell is ready while league tools load on demand.</p>
        <div className="load-progress indeterminate" role="progressbar" aria-label="Loading Fantasy Hub" aria-valuetext="Loading application">
          <span />
        </div>
        <small className="load-progress-label">Loading dashboard tools…</small>
        <i />
        <i />
        <i />
      </section>
    </main>
  ),
});

export default function FantasyHubLoader({
  accountUser,
}: {
  accountUser: { displayName: string; email: string } | null;
}) {
  return <FantasyHub accountUser={accountUser} />;
}
