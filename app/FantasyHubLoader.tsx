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
