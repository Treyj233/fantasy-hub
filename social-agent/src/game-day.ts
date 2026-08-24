import { getNflGames } from "../../app/highlightly-nfl";

let gameDayCache: { expires: number; active: boolean } | null = null;

const centralDate = (value: string | number | Date) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Chicago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date(value));

export async function isNflRegularOrPostseasonGameDay() {
  if (gameDayCache?.expires && gameDayCache.expires > Date.now()) return gameDayCache.active;
  const today = centralDate(Date.now());
  const games = await getNflGames({ date: today, cacheSeconds: 60 }).catch(() => []);
  const active = games.some((game) =>
    /regular|playoff|wild card|divisional|conference|championship/i.test(game.round) &&
    Boolean(game.date) && centralDate(game.date) === today);
  gameDayCache = { expires: Date.now() + 5 * 60_000, active };
  return active;
}
