import type { Story } from "./content";
import { getNflGames, getNflMatch } from "../../app/highlightly-nfl";

type Venue = { name?: string; city?: string; state?: string; indoor?: boolean };
type HourlyForecast = { time?: string[]; temperature_2m?: number[]; precipitation_probability?: number[]; precipitation?: number[]; wind_speed_10m?: number[]; wind_gusts_10m?: number[] };

const coordinateCache = new Map<string, { latitude: number; longitude: number }>();
let weatherCache: { expires: number; stories: Story[] } | null = null;

const normalizeTeam = (team?: string) => ({ JAC: "JAX", WSH: "WAS" }[team ?? ""] ?? team ?? "");

async function coordinatesFor(venue: Venue) {
  const place = [venue.city, venue.state, "US"].filter(Boolean).join(", ");
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
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const tomorrow = new Date(now + 24 * 60 * 60_000).toISOString().slice(0, 10);
  const games = (await Promise.all([getNflGames({ date: today, cacheSeconds: 60 }), getNflGames({ date: tomorrow, cacheSeconds: 60 })]).catch(() => [])).flat();
  const eligible = games.filter((game) => { const kickoff = Date.parse(game.date); return Number.isFinite(kickoff) && kickoff >= now - 60 * 60_000 && kickoff <= now + 30 * 60 * 60_000; });
  const indoorVenues = /allegiant|at&t|caesars superdome|ford field|lucas oil|mercedes-benz|nrg stadium|state farm stadium|u\.s\. bank/i;
  const stories = (await Promise.all(eligible.map(async (game): Promise<Story | null> => {
    const detail = await getNflMatch(game.id, 900).catch(() => null);
    const venue = detail?.venue ?? game.venue ?? {};
    if (indoorVenues.test(venue.name ?? "")) return null;
    const forecast = await forecastFor(game.date, venue);
    if (!forecast) return null;
    const windy = (forecast.windMph ?? 0) >= 18 || (forecast.windGustMph ?? 0) >= 30;
    const wet = (forecast.precipitationProbability ?? 0) >= 60 && (forecast.precipitationInches ?? 0) >= .03;
    const extremeTemperature = (forecast.temperatureF ?? 60) <= 25 || (forecast.temperatureF ?? 60) >= 95;
    if (!windy && !wet && !extremeTemperature) return null;
    const teamCodes = [normalizeTeam(game.away.abbreviation), normalizeTeam(game.home.abbreviation)];
    const teamNames = [game.away.displayName, game.home.displayName];
    const matchup = teamNames.length === 2 ? `${teamNames[0]}–${teamNames[1]}` : teamCodes.join("–");
    const conditions = `${Math.round(forecast.temperatureF ?? 0)}°F, ${Math.round(forecast.windMph ?? 0)} mph wind (${Math.round(forecast.windGustMph ?? 0)} mph gusts), ${Math.round(forecast.precipitationProbability ?? 0)}% precipitation`;
    const severity = `${windy ? "w" : ""}${wet ? "p" : ""}${extremeTemperature ? "t" : ""}`;
    return { id: `weather:${game.id}:${severity}:${Math.round((forecast.windMph ?? 0) / 5)}:${Math.round((forecast.precipitationProbability ?? 0) / 20)}`, title: `Inclement weather is forecast for ${matchup}: ${conditions}.`, summary: `Outdoor conditions at ${venue.name ?? "the stadium"} could affect fantasy scoring.`, url: "https://fantasyhubapp.com", source: "weather", publishedAt: new Date().toISOString(), category: "weather", fantasyImpact: weatherImpact(teamCodes.join(" and "), forecast), sourceContext: teamCodes };
  }))).filter((story): story is Story => Boolean(story));
  weatherCache = { expires: now + 15 * 60_000, stories };
  return stories;
}
