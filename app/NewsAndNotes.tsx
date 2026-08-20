"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type NewsItem = {
  id: string;
  emoji: string;
  title: string;
  category: string;
  headline: string;
  impact: string;
  nextSteps: string[];
  reporter: string | null;
  publishedAt: string;
};

type NewsPayload = { items?: NewsItem[]; updatedAt?: string | null; error?: string };

const filters = [
  ["all", "All updates"],
  ["injury", "Injuries"],
  ["depth-chart", "Role watch"],
  ["contract", "Roster moves"],
  ["performance", "Game day"],
] as const;

const timeAgo = (value: string) => {
  const elapsed = Date.now() - Date.parse(value);
  if (!Number.isFinite(elapsed)) return "Recently";
  const minutes = Math.max(1, Math.round(elapsed / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};

export default function NewsAndNotes() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [filter, setFilter] = useState<(typeof filters)[number][0]>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadFeed = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const response = await fetch("/api/news-notes", { signal });
      const payload = await response.json() as NewsPayload;
      if (!response.ok) throw new Error(payload.error || "News feed unavailable");
      setItems(Array.isArray(payload.items) ? payload.items : []);
      setError("");
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === "AbortError") return;
      setError(requestError instanceof Error ? requestError.message : "News feed unavailable");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const initialRefresh = window.setTimeout(() => void loadFeed(controller.signal), 0);
    const interval = window.setInterval(() => void loadFeed(), 120_000);
    return () => {
      controller.abort();
      window.clearTimeout(initialRefresh);
      window.clearInterval(interval);
    };
  }, [loadFeed]);

  const visibleItems = useMemo(
    () => filter === "all" ? items : items.filter((item) => item.category === filter),
    [filter, items],
  );

  return (
    <div className="news-notes-page">
      <section className="section-intro">
        <span>LIVE LEAGUE INTELLIGENCE</span>
        <h2>News &amp; Notes</h2>
        <p>Fantasy football news translated into what matters—and what you should do next.</p>
      </section>

      <section className="news-notes-console" aria-label="News feed controls">
        <div>
          <span className="news-live-dot" aria-hidden="true" />
          <div><b>THE FANTASY HUB WIRE</b><small>Fresh updates from trusted NFL insiders</small></div>
        </div>
        <button type="button" onClick={() => void loadFeed()} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
      </section>

      <div className="news-filter-row" role="group" aria-label="Filter news">
        {filters.map(([value, label]) => (
          <button key={value} type="button" className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{label}</button>
        ))}
      </div>

      {loading && !items.length && <div className="news-feed-skeleton" aria-label="Loading news"><i /><i /><i /></div>}
      {error && !items.length && (
        <section className="panel news-empty"><span>📡</span><h3>The wire is reconnecting</h3><p>{error}</p><button type="button" onClick={() => void loadFeed()}>Try again</button></section>
      )}
      {!loading && !error && !visibleItems.length && (
        <section className="panel news-empty"><span>✓</span><h3>You&apos;re all caught up</h3><p>New fantasy-impacting updates will appear here as they break.</p></section>
      )}

      <div className="news-feed">
        {visibleItems.map((item, index) => {
          const steps = item.nextSteps.length ? item.nextSteps : [item.impact];
          return (
            <article className={`news-feed-card category-${item.category}`} key={item.id}>
              <aside><span>{item.emoji}</span><i /></aside>
              <div className="news-card-body">
                <header>
                  <div><span>{item.title}</span><small>{timeAgo(item.publishedAt)}</small></div>
                  {index === 0 && <b>NEW</b>}
                </header>
                <h3>{item.headline}</h3>
                <section className="news-next-move">
                  <span>YOUR NEXT MOVE</span>
                  <ul>{steps.map((step, stepIndex) => <li key={`${item.id}-${stepIndex}`}>{step}</li>)}</ul>
                </section>
                {item.reporter && <footer>Reported by <b>{item.reporter}</b></footer>}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
