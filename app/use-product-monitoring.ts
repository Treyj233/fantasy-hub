"use client";

import { useEffect, useRef } from "react";

function report(event: string, details: Record<string, unknown> = {}) {
  const payload = JSON.stringify({ event, path: window.location.pathname, ...details });
  if (navigator.sendBeacon)
    navigator.sendBeacon("/api/client-error", new Blob([payload], { type: "application/json" }));
  else
    void fetch("/api/client-error", { method: "POST", headers: { "content-type": "application/json" }, body: payload, keepalive: true });
}

export function useProductMonitoring(view: string, loading: boolean, accountError: string) {
  const viewStartedAt = useRef(0);
  useEffect(() => {
    const now = performance.now();
    const durationMs = viewStartedAt.current ? Math.round(now - viewStartedAt.current) : 0;
    report("view_ready", { view, durationMs });
    viewStartedAt.current = now;
  }, [view]);
  useEffect(() => {
    if (!accountError) return;
    report("recoverable_data_error", { view, message: accountError.slice(0, 500) });
  }, [accountError, view]);
  useEffect(() => {
    if (!loading) return;
    const timer = window.setTimeout(() => report("league_refresh_slow", { view, thresholdMs: 12000 }), 12000);
    return () => window.clearTimeout(timer);
  }, [loading, view]);
}
