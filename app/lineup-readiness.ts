type LineupPlayer = { id: string; role: string; status: string; opponent: string };
export function lineupReadiness(players: LineupPlayer[], slots?: string[]) {
  const reserve = new Set(['BN', 'BE', 'BENCH', 'IR', 'TAXI', 'RESERVE']);
  const starters = [...new Map(players.filter(p => !reserve.has(p.role.toUpperCase())).map(p => [p.id, p])).values()];
  const required = slots ? slots.filter(s => !reserve.has(s.toUpperCase())).length : starters.length;
  let unavailable = 0, questionable = 0, byes = 0;
  for (const p of starters) {
    if (/^bye$/i.test(p.opponent)) byes++;
    else if (/^(out|ir|injured reserve|suspend\w*|doubt\w*|pup|nfi|inactive)(\b|$)/i.test(p.status)) unavailable++;
    else if (/question/i.test(p.status)) questionable++;
  }
  const empty = Math.max(0, required - starters.length);
  const ready = Math.max(0, Math.min(required, starters.length - unavailable - questionable - byes));
  const detail = [unavailable ? `${unavailable} unavailable` : '', questionable ? `${questionable} questionable` : '', byes ? `${byes} on bye` : '', empty ? `${empty} empty` : ''].filter(Boolean).join(' · ');
  return { ready, required, empty, unavailable, questionable, byes, value: required ? `${ready}/${required} ready` : '—', detail: detail || (required ? 'All starting slots ready' : 'Lineup settings unavailable') };
}
