// Persist only the season's first kickoff, not scores or week-specific data.
// This lets the Tuesday calendar resolve synchronously after a cold restart.
export function saveSeasonCalendar(schedule) {
  try {
    const first = schedule?.weeks?.find(row => row.week === 1)?.games
      ?.filter(game => Number.isFinite(Date.parse(game.date)))
      .sort((a,b) => Date.parse(a.date) - Date.parse(b.date))[0];
    if (first) globalThis.localStorage?.setItem(`fantasy-hub-calendar:${schedule.season}`, JSON.stringify({ week: 1, date: first.date }));
  } catch { /* Storage is optional. */ }
}
export function savedSeasonCalendar(season) {
  try {
    const first = JSON.parse(globalThis.localStorage?.getItem(`fantasy-hub-calendar:${season}`) ?? 'null');
    return first?.week === 1 && Number.isFinite(Date.parse(first.date)) && new Date(first.date).getUTCFullYear() === Number(season) ? [first] : [];
  } catch { return []; }
}
