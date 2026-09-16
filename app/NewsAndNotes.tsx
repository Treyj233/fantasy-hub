"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { startVisiblePolling } from "./live-polling.mjs";
import { createNewsFeedRequest } from "./news-feed-request.mjs";

type NewsItem = {
  id: string;
  emoji: string;
  title: string;
  category: string;
  headline: string;
  summary?: string | null;
  whyItMatters?: string;
  impact: string;
  nextSteps: string[];
  reporter: string | null;
  publishedAt: string;
  confidence?: "high" | "medium" | "low";
  lifecycleStage?: string;
  sourceCount?: number;
  relatedPlayers?: RelatedPlayer[];
};

export type RelatedPlayer = {
  id: string;
  name: string;
  position: string;
  team: string;
  relationship: "subject" | "beneficiary" | "backup";
};

const filters = [
  ["all", "All updates"],
  ["news", "Fantasy Pulse"],
  ["injury", "Injuries"],
  ["depth-chart", "Role watch"],
  ["contract", "Roster moves"],
  ["performance", "Game highlights"],
  ["weather", "Weather"],
] as const;

const teamHashtag = /#(?=(?:49ers|Bears|Bengals|Bills|Broncos|Browns|Buccaneers|Bucs|Cardinals|Chargers|Chiefs|Colts|Commanders|Cowboys|Dolphins|Eagles|Falcons|Giants|Jaguars|Jags|Jets|Lions|Packers|Panthers|Patriots|Pats|Raiders|Rams|Ravens|Saints|Seahawks|Steelers|Texans|Titans|Vikings)\b)/gi;
const cleanTeamHashtags = (value: string) => value.replace(teamHashtag, "");

const timeAgo = (value: string, now: number) => {
  const elapsed = now - Date.parse(value);
  if (!Number.isFinite(elapsed)) return "Recently";
  const minutes = Math.max(1, Math.round(elapsed / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};

export default function NewsAndNotes({ onOpenPlayer }: { onOpenPlayer?: (player: RelatedPlayer) => void }) {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [filter, setFilter] = useState<(typeof filters)[number][0]>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [manualRefreshState, setManualRefreshState] = useState<"idle" | "refreshing" | "updated">("idle");
  const [visibleCount, setVisibleCount] = useState(10);
  const [updatedAt, setUpdatedAt] = useState(Date.now);
  const request = useMemo(() => createNewsFeedRequest(), []);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(false);

  const loadFeed = useCallback(async (signal?: AbortSignal) => {
    const result = await request.load(signal);
    if (!mounted.current || result.status === "cancelled") return false;
    if (result.status === "success") {
      setItems(result.items);
      setUpdatedAt(Date.now());
      setError("");
    } else {
      setError("Couldn’t refresh the news. Please try again.");
    }
    setLoading(false);
    return result.status === "success";
  }, [request]);

  const refreshNow = useCallback(async () => {
    setManualRefreshState("refreshing");
    clearTimeout(feedbackTimer.current);
    const success = await loadFeed();
    if (!mounted.current) return;
    setManualRefreshState(success ? "updated" : "idle");
    if (success) feedbackTimer.current = setTimeout(() => setManualRefreshState("idle"), 1_800);
  }, [loadFeed]);

  useEffect(() => {
    mounted.current = true;
    const stop = startVisiblePolling(loadFeed, 120_000);
    const cancelHiddenRequest = () => { if (document.visibilityState !== "visible") request.cancel(); };
    document.addEventListener("visibilitychange", cancelHiddenRequest);
    return () => {
      mounted.current = false;
      stop();
      request.cancel();
      clearTimeout(feedbackTimer.current);
      document.removeEventListener("visibilitychange", cancelHiddenRequest);
    };
  }, [loadFeed, request]);

  const filteredItems = useMemo(
    () => filter === "all" ? items : items.filter((item) => item.category === filter),
    [filter, items],
  );
  const visibleItems = useMemo(() => filteredItems.slice(0, visibleCount), [filteredItems, visibleCount]);

  return (
    <div className="page-content news-notes-page">
      <section className="section-intro compact news-notes-intro">
        <span>LIVE LEAGUE INTELLIGENCE</span>
        <p>Fantasy football news translated into what matters—and what you should do next.</p>
      </section>

      <section className="news-notes-console" aria-label="News feed controls">
        <div>
          <span className="news-live-dot" aria-hidden="true" />
          <div><b>THE FANTASY HUB WIRE</b><small>Fresh updates from trusted football insiders</small></div>
        </div>
        <button
          type="button"
          className={manualRefreshState === "updated" ? "updated" : ""}
          onClick={() => void refreshNow()}
          disabled={manualRefreshState === "refreshing"}
          aria-live="polite"
        >
          {manualRefreshState === "refreshing" ? "Refreshing…" : manualRefreshState === "updated" ? "Updated ✓" : "Refresh"}
        </button>
      </section>

      <div className="news-filter-row" role="group" aria-label="Filter news">
        {filters.map(([value, label]) => (
          <button key={value} type="button" aria-pressed={filter === value} className={filter === value ? "active" : ""} onClick={() => { setFilter(value); setVisibleCount(10); }}>{label}</button>
        ))}
      </div>

      {loading && !items.length && <div className="news-feed-skeleton" aria-label="Loading news"><i /><i /><i /></div>}
      {error && !!items.length && <p className="news-refresh-warning" role="status">Showing your last loaded updates. {error}</p>}
      {error && !items.length && (
        <section className="panel news-empty"><span>📡</span><h3>The wire is reconnecting</h3><p>{error}</p><button type="button" onClick={() => void loadFeed()}>Try again</button></section>
      )}
      {!loading && !error && !visibleItems.length && (
        <section className="panel news-empty"><span>✓</span><h3>You&apos;re all caught up</h3><p>New fantasy-impacting updates will appear here as they break.</p></section>
      )}

      <div className="news-feed" aria-label={`${filteredItems.length} fantasy news updates`}>
        {visibleItems.map((item) => {
          const steps = item.nextSteps.length ? item.nextSteps : [item.impact];
          return (
            <article className={`news-feed-card category-${item.category}${item.emoji.includes("❄") ? " news-cold" : ""}`} key={item.id}>
              <aside><span>{item.emoji}</span><i /></aside>
              <div className="news-card-body">
                <header>
                  <div><span>{item.title}</span><small>{timeAgo(item.publishedAt, updatedAt)}</small></div>
                  {updatedAt - Date.parse(item.publishedAt) >= 0 && updatedAt - Date.parse(item.publishedAt) < 3_600_000 && <b>NEW</b>}
                </header>
                <h3>{cleanTeamHashtags(item.headline)}</h3>
                {item.summary && item.summary !== item.headline && <p className="news-story-summary">{cleanTeamHashtags(item.summary)}</p>}
                {!!item.relatedPlayers?.length && (
                  <div className="news-related-players" aria-label="Players affected by this update">
                    <span>IMPACTED PLAYERS</span>
                    <div>{item.relatedPlayers.map((player) => (
                      <button type="button" key={`${item.id}-${player.id}-${player.relationship}`} onClick={() => onOpenPlayer?.(player)} disabled={!onOpenPlayer}>
                        <b>{player.name}</b><small>{player.position} · {player.team}</small>
                      </button>
                    ))}</div>
                  </div>
                )}
                <section className="news-next-move">
                  {item.whyItMatters && <p className="news-why-it-matters"><b>WHY IT MATTERS</b>{cleanTeamHashtags(item.whyItMatters)}</p>}
                  <span>YOUR NEXT MOVE</span>
                  <ul>{steps.map((step, stepIndex) => <li key={`${item.id}-${stepIndex}`}>{cleanTeamHashtags(step)}</li>)}</ul>
                </section>
                <footer>{item.reporter && <span>Reported by <b>{item.reporter}</b></span>}{(item.sourceCount ?? 1) > 1 && <span>Confirmed by {item.sourceCount} sources</span>}{item.confidence && <span className={`confidence-${item.confidence}`}>{item.confidence} confidence</span>}</footer>
              </div>
            </article>
          );
        })}
      </div>
      {visibleCount < filteredItems.length && (
        <button type="button" className="news-load-more" onClick={() => setVisibleCount((count) => count + 10)}>
          Show {Math.min(10, filteredItems.length - visibleCount)} older updates <span>{filteredItems.length - visibleCount} remaining</span>
        </button>
      )}
    </div>
  );
}
