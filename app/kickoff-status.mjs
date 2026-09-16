// Kickoff determines live mode; only explicit provider results determine final.
/** @returns {'pre' | 'in' | 'post'} */
export function kickoffState(game, now = Date.now()) {
  if (game.state === 'post' || /final|finished/i.test(game.status ?? '')) return 'post';
  if (/postpon|cancel|suspend|delay/i.test(game.status ?? '')) return 'pre';
  if (game.state === 'in') return 'in';
  const kickoff = Date.parse(game.date);
  return Number.isFinite(kickoff) && now >= kickoff ? 'in' : 'pre';
}

export function activateScheduledScoreboard(data, now = Date.now()) {
  if (!data?.kickoffGames?.some(game => kickoffState(game, now) === 'in')) return data;
  let changed = false;
  const matchups = data.matchups.map(matchup => {
    if (matchup.status !== 'Scheduled') return matchup;
    changed = true;
    return { ...matchup, status: 'Live' };
  });
  return changed ? { ...data, matchups } : data;
}
