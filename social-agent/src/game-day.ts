type EspnEvent = { date?: string; season?: { type?: number }; status?: { type?: { state?: string } } };

let gameDayCache: { expires: number; active: boolean } | null = null;

const centralDate = (value: string | number | Date) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Chicago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date(value));

export async function isNflRegularOrPostseasonGameDay() {
  if (gameDayCache?.expires && gameDayCache.expires > Date.now()) return gameDayCache.active;
  const response = await fetch("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard");
  if (!response.ok) return false;
  const events = (await response.json() as { events?: EspnEvent[] }).events ?? [];
  const today = centralDate(Date.now());
  const active = events.some((event) =>
    (event.season?.type === 2 || event.season?.type === 3) &&
    Boolean(event.date) &&
    centralDate(event.date!) === today &&
    ["pre", "in", "post"].includes(event.status?.type?.state ?? ""));
  gameDayCache = { expires: Date.now() + 5 * 60_000, active };
  return active;
}
