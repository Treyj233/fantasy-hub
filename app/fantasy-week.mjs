// Calendar weeks roll over Tuesday at midnight Central, independently of a
// provider's scoring-period update. Date-only arithmetic avoids DST offsets.
const dayMs = 86400000;
function centralDay(now) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now));
  const part = type => Number(parts.find(p => p.type === type)?.value);
  return Date.UTC(part('year'), part('month') - 1, part('day'));
}
export function fantasyWeek(games, now = Date.now(), fallback = 1) {
  const first = games.filter(g => g.week === 1 && Number.isFinite(Date.parse(g.date))).sort((a,b) => Date.parse(a.date)-Date.parse(b.date))[0];
  if (!first) return { currentWeek: Math.min(18, Math.max(1, fallback)), completedWeek: 0, ready: false };
  const firstDay = centralDay(first.date);
  const firstTuesday = firstDay - ((new Date(firstDay).getUTCDay() + 5) % 7) * dayMs;
  const calendarWeek = Math.floor((centralDay(now) - firstTuesday) / (7 * dayMs)) + 1;
  return { currentWeek: Math.min(18, Math.max(1, calendarWeek)), completedWeek: Math.min(18, Math.max(0, calendarWeek - 1)), ready: true };
}
export function requestedFantasyWeek(value) {
  const week = Number(value);
  return Number.isInteger(week) && week >= 1 && week <= 18 ? week : null;
}
