"use client";
import { useEffect, useRef, useState } from 'react';
import { recapReady } from './weekly-recap.mjs';
import { startVisiblePolling, fetchLiveJson } from './live-polling.mjs';

type League = { id: string; name: string; season?: string; rosterId: string };
type Result = { id: string; name: string; outcome: string; points?: number; opponentPoints?: number };
export default function WeeklyRecap({ leagues, season, week, enabled, prepare }: { leagues: League[]; season: string; week: number; enabled: boolean; prepare: boolean }) {
  const [results, setResults] = useState<Result[] | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const dismissed = useRef('');
  const recapKey = `${season}:${week}`;
  const leagueSignature = JSON.stringify(leagues.filter(l => !l.season || l.season === season).map(l => ({ id: l.id, name: l.name, rosterId: l.rosterId })));
  useEffect(() => {
    setResults(null);
    if (!prepare || week < 1 || dismissed.current === recapKey) return;
    const selected = JSON.parse(leagueSignature) as League[];
    if (!selected.length) return;
    const collected = new Map<string, Result>();
    let seenChecked = false;
    let done = false;
    return startVisiblePolling(async (signal: AbortSignal) => {
      if (done || dismissed.current === recapKey) return;
      if (!seenChecked) {
        const data = await fetchLiveJson('/api/account', signal);
        if (signal.aborted) return;
        if (data.preferences?.weeklyRecapSeen === recapKey) { done = true; return; }
        seenChecked = true;
      }
      const payload = await fetchLiveJson(`/api/account/weekly-recap?season=${encodeURIComponent(season)}&week=${week}`, signal);
      if (signal.aborted) return;
      for (const league of selected) {
        const result = (payload.results ?? []).find((row: Result) => row.id === league.id);
        if (result && recapReady([result], 1)) collected.set(league.id, { ...result, name: league.name });
      }
      const complete = selected.map(league => collected.get(league.id)).filter((row): row is Result => Boolean(row));
      if (!signal.aborted && recapReady(complete, selected.length)) { setResults(complete); done = true; }
    }, 30_000);
  }, [prepare, season, week, recapKey, leagueSignature]);
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
