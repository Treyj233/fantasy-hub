export const REFRESH = Object.freeze({
  portfolio: 15 * 60_000, roster: 5 * 60_000, live: 60_000,
  inactive: 6 * 60 * 60_000, settings: 6 * 60 * 60_000,
  directory: 24 * 60 * 60_000, weather: 60 * 60_000,
  sleeperPerMinute: 500, jobsPerTick: 24,
});
export function accountRefreshInterval(lastActiveAt, now = Date.now()) {
  return now - Date.parse(lastActiveAt ?? '') < 7 * 86400_000 ? REFRESH.portfolio : REFRESH.inactive;
}
export function retryDelay(failures) {
  return Math.min(6 * 3600_000, 60_000 * 2 ** Math.min(9, Math.max(0, failures)));
}
export function leagueRefreshKey(record, season) {
  if (record.status !== 'live' || (record.season && Number(record.season) !== season)) return null;
  if (record.provider === 'sleeper' && /^\d{6,24}$/.test(record.identifier)) return record.identifier;
  if (record.provider === 'espn') {
    const parts = record.identifier.split(':');
    const id = parts.at(-1);
    if (parts.length === 3 && Number(parts[1]) !== season) return null;
    return /^\d+$/.test(id) ? `espn:${season}:${id}` : null;
  }
  return null;
}
