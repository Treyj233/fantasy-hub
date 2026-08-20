import type { Story } from "./content";

type Venue = { fullName?: string; indoor?: boolean; address?: { city?: string; state?: string; country?: string } };
type Competitor = { team?: { abbreviation?: string; displayName?: string } };
type EspnEvent = { id?: string; date?: string; competitions?: Array<{ venue?: Venue; competitors?: Competitor[] }> };
type HourlyForecast = { time?: string[]; temperature_2m?: number[]; precipitation_probability?: number[]; precipitation?: number[]; wind_speed_10m?: number[]; wind_gusts_10m?: number[] };

const coordinateCache = new Map<string, { latitude: number; longitude: number }>();
let weatherCache: { expires: number; stories: Story[] } | null = null;

const normalizeTeam = (team?: string) => ({ JAC: "JAX", WSH: "WAS" }[team ?? ""] ?? team ?? "");

async function coordinatesFor(venue: Venue) {
  const place = [venue.address?.city, venue.address?.state, venue.address?.country].filter(Boolean).join(", ");
  if (!place) return null;
  const cached = coordinateCache.get(place);
  if (cached) return cached;
  const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=en&format=json`);
  if (!response.ok) return null;
  const payload = await response.json() as { results?: Array<{ latitude?: number; longitude?: number }> };
  const result = payload.results?.[0];
  if (typeof result?.latitude !== "number" || typeof result.longitude !== "number") return null;
  const coordinates = { latitude: result.latitude, longitude: result.longitude };
  coordinateCache.set(place, coordinates);
  return coordinates;
}

async function forecastFor(date: string, venue: Venue) {
  const coordinates = await coordinatesFor(venue);
  if (!coordinates) return null;
  const day = date.slice(0, 10);
  const params = new URLSearchParams({ latitude: String(coordinates.latitude), longitude: String(coordinates.longitude), hourly: "temperature_2m,precipitation_probability,precipitation,wind_speed_10m,wind_gusts_10m", temperature_unit: "fahrenheit", wind_speed_unit: "mph", timezone: "UTC", start_date: day, end_date: day });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!response.ok) return null;
  const hourly = (await response.json() as { hourly?: HourlyForecast }).hourly;
  const times = hourly?.time ?? [];
  const kickoff = Date.parse(date);
  const index = times.reduce((best, value, candidate) => Math.abs(Date.parse(`${value}Z`) - kickoff) < Math.abs(Date.parse(`${times[best]}Z`) - kickoff) ? candidate : best, 0);
  if (!times[index]) return null;
  return { temperatureF: hourly?.temperature_2m?.[index] ?? null, precipitationProbability: hourly?.precipitation_probability?.[index] ?? null, precipitationInches: hourly?.precipitation?.[index] != null ? Number((hourly.precipitation[index] / 25.4).toFixed(2)) : null, windMph: hourly?.wind_speed_10m?.[index] ?? null, windGustMph: hourly?.wind_gusts_10m?.[index] ?? null };
}

function weatherImpact(teams: string, forecast: NonNullable<Awaited<ReturnType<typeof forecastFor>>>) {
  const windy = (forecast.windMph ?? 0) >= 18 || (forecast.windGustMph ?? 0) >= 30;
  const wet = (forecast.precipitationProbability ?? 0) >= 60 && (forecast.precipitationInches ?? 0) >= .03;
  if (windy && wet) return `${teams}: downgrade deep passing and kickers; favor rushing and short-area volume. Both defenses gain turnover upside. Recheck near kickoff.`;
  if (windy) return `${teams}: downgrade deep passing and long field goals; favor rushing and short-area volume. Recheck wind near kickoff.`;
  if (wet) return `${teams}: trim passing efficiency and protect high-risk flex plays. Both defenses gain turnover upside. Recheck near kickoff.`;
  if ((forecast.temperatureF ?? 60) <= 25) return `${teams}: extreme cold can reduce kicking range and scoring efficiency. Avoid major downgrades unless wind also rises.`;
  return `${teams}: extreme heat raises conditioning and rotation risk. Monitor high-volume players and sideline reports.`;
}

export async function gameDayWeatherStories(): Promise<Story[]> {
  if (weatherCache?.expires && weatherCache.expires > Date.now()) return weatherCache.stories;
  const response = await fetch("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard");
  if (!response.ok) return [];
  const events = (await response.json() as { events?: EspnEvent[] }).events ?? [];
  const now = Date.now();
  const eligible = events.filter((event) => { const kickoff = Date.parse(event.date ?? ""); return Number.isFinite(kickoff) && kickoff >= now - 60 * 60_000 && kickoff <= now + 30 * 60 * 60_000; });
  const stories = (await Promise.all(eligible.map(async (event): Promise<Story | null> => {
    const competition = event.competitions?.[0];
    const venue = competition?.venue ?? {};
    if (!event.id || !event.date || venue.indoor) return null;
    const forecast = await forecastFor(event.date, venue);
    if (!forecast) return null;
    const windy = (forecast.windMph ?? 0) >= 18 || (forecast.windGustMph ?? 0) >= 30;
    const wet = (forecast.precipitationProbability ?? 0) >= 60 && (forecast.precipitationInches ?? 0) >= .03;
    const extremeTemperature = (forecast.temperatureF ?? 60) <= 25 || (forecast.temperatureF ?? 60) >= 95;
    if (!windy && !wet && !extremeTemperature) return null;
    const competitors = competition?.competitors ?? [];
    const teamCodes = competitors.map((item) => normalizeTeam(item.team?.abbreviation)).filter(Boolean);
    const teamNames = competitors.map((item) => item.team?.displayName).filter(Boolean) as string[];
    const matchup = teamNames.length === 2 ? `${teamNames[0]}–${teamNames[1]}` : teamCodes.join("–");
    const conditions = `${Math.round(forecast.temperatureF ?? 0)}°F, ${Math.round(forecast.windMph ?? 0)} mph wind (${Math.round(forecast.windGustMph ?? 0)} mph gusts), ${Math.round(forecast.precipitationProbability ?? 0)}% precipitation`;
    const severity = `${windy ? "w" : ""}${wet ? "p" : ""}${extremeTemperature ? "t" : ""}`;
    return { id: `weather:${event.id}:${severity}:${Math.round((forecast.windMph ?? 0) / 5)}:${Math.round((forecast.precipitationProbability ?? 0) / 20)}`, title: `Inclement weather is forecast for ${matchup}: ${conditions}.`, summary: `Outdoor conditions at ${venue.fullName ?? "the stadium"} could affect fantasy scoring.`, url: "https://fantasyhubapp.com", source: "weather", publishedAt: new Date().toISOString(), category: "weather", fantasyImpact: weatherImpact(teamCodes.join(" and "), forecast), sourceContext: teamCodes };
  }))).filter((story): story is Story => Boolean(story));
  weatherCache = { expires: now + 15 * 60_000, stories };
  return stories;
}
