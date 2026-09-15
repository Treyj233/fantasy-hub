import { loadNflSeasonSchedule } from './nfl-schedule-data';
import { fantasyWeek } from './fantasy-week.mjs';

export async function currentFantasyWeek(season: number, fallback = 1) {
  if (!Number.isInteger(season) || season < 2020 || season > 2035) return fantasyWeek([], Date.now(), fallback);
  return fantasyWeek(await loadNflSeasonSchedule(season), Date.now(), fallback);
}
