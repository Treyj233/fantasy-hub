"use client";
import { useEffect, useRef, useState } from 'react';
import { recapResult } from './weekly-recap.mjs';

type League = { id: string; name: string; season?: string; rosterId: string };
type Result = { id: string; name: string; outcome: string; points?: number; opponentPoints?: number };
export default function WeeklyRecap({ leagues, season, week, enabled }: { leagues: League[]; season: string; week: number; enabled: boolean }) {
  const [results, setResults] = useState<Result[] | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const dismissed = useRef('');
  const recapKey = `${season}:${week}`;
  const leagueSignature = JSON.stringify(leagues.filter(l => !l.season || l.season === season).map(l => ({ id: l.id, name: l.name, rosterId: l.rosterId })));
  useEffect(() => {
    if (!enabled || week < 1 || dismissed.current === recapKey) return;
    const selected = JSON.parse(leagueSignature) as League[];
    if (!selected.length) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 60_000);
    void (async () => {
      const account = await fetch('/api/account', { signal: controller.signal, cache: 'no-store' });
      if (!account.ok) return;
      const data = await account.json();
      if (data.preferences?.weeklyRecapSeen === recapKey) return;
      const collected: Result[] = [];
      // Limit fan-out for managers with many leagues, without blocking sign-in.
      for (let index = 0; index < selected.length; index += 3) {
        const batch = await Promise.all(selected.slice(index, index + 3).map(async league => {
          try {
            const response = await fetch(`/api/scoreboard?leagueId=${encodeURIComponent(league.id)}&week=${week}&scope=mine`, { signal: controller.signal });
            if (!response.ok) throw new Error('Scores unavailable');
            return { id: league.id, name: league.name, ...recapResult(await response.json(), week, league.rosterId) };
          } catch { return { id: league.id, name: league.name, outcome: 'Unavailable' }; }
        }));
        collected.push(...batch);
      }
      if (!controller.signal.aborted && collected.some(row => ['W','L','T'].includes(row.outcome))) setResults(collected);
    })().catch(() => { /* Recap availability must never block the dashboard. */ }).finally(() => window.clearTimeout(timeout));
    return () => { controller.abort(); window.clearTimeout(timeout); };
  }, [enabled, week, recapKey, leagueSignature]);
  useEffect(() => { if (results && enabled && !dialog.current?.open) dialog.current?.showModal(); }, [results, enabled]);
  const close = () => {
    dismissed.current = recapKey;
    setResults(null);
    void fetch('/api/account/preferences', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ weeklyRecapSeen: recapKey }) }).catch(() => {});
  };
  if (!results) return null;
  const count = (outcome: string) => results.filter(row => row.outcome === outcome).length;
  const settled = results.filter(row => ['W','L','T'].includes(row.outcome)).length;
  return <dialog ref={dialog} className="weekly-recap-dialog" aria-labelledby="weekly-recap-title" onClose={close}>
    <header><div><small>WEEK {week} · YOUR LEAGUES</small><h2 id="weekly-recap-title">Your week in review</h2></div><button type="button" aria-label="Close weekly recap" onClick={() => dialog.current?.close()}>×</button></header>
    <div className="weekly-recap-record"><strong>{count('W')}–{count('L')}{count('T') ? `–${count('T')}` : ''}</strong><span>Wins · Losses{count('T') ? ' · Ties' : ''}</span><small>{settled} of {results.length} league results available</small></div>
    <div className="weekly-recap-results">{results.map(row => <article key={row.id}><span className={`weekly-result result-${row.outcome}`}>{row.outcome}</span><strong>{row.name}</strong>{row.points != null && <small>{row.points.toFixed(2)} – {row.opponentPoints?.toFixed(2)}</small>}</article>)}</div>
    <footer><small>Based on reported scores. Later stat corrections may change results.</small><button type="button" className="primary" onClick={() => dialog.current?.close()}>Continue to my hub</button></footer>
  </dialog>;
}
