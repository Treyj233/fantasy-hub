import { getChatGPTUser } from "../../chatgpt-auth";
import { getNflGames, getNflMatch } from "../../highlightly-nfl";

type Venue = { name?: string; city?: string; state?: string; indoor?: boolean };
type WeatherApiHour = {
  time_epoch?: number;
  temp_f?: number;
  chance_of_rain?: number;
  precip_in?: number;
  wind_mph?: number;
  gust_mph?: number;
  condition?: { text?: string };
};
type WeatherApiResponse = {
  forecast?: { forecastday?: { hour?: WeatherApiHour[] }[] };
};

const WEATHER_API_URL = "https://api.weatherapi.com/v1/forecast.json";
const WEATHER_SOURCE_URL = "https://www.weatherapi.com/";
const WEATHER_DISCLAIMER = "Weather information is for general informational purposes only. Forecasts may change and should not be used as the sole basis for safety-critical decisions.";
const normalizeTeam = (team?: string) => ({ JAC: "JAX", WSH: "WAS" }[team ?? ""] ?? team ?? "");

async function forecastFor(date: string, venue: Venue) {
  const apiKey = process.env.WEATHERAPI_KEY?.trim();
  if (!apiKey) return null;
  const kickoff = new Date(date);
  const hoursAway = (kickoff.getTime() - Date.now()) / 3600000;
  if (!Number.isFinite(hoursAway) || hoursAway < -24 || hoursAway > 14 * 24) return null;
  const place = [venue.city, venue.state].filter(Boolean).join(", ");
  if (!place) return null;
  const days = Math.max(1, Math.min(14, Math.ceil(Math.max(0, hoursAway) / 24) + 1));
  const params = new URLSearchParams({ key: apiKey, q: place, days: String(days), aqi: "no", alerts: "no" });
  const response = await fetch(`${WEATHER_API_URL}?${params}`, { next: { revalidate: 3600 } });
  if (!response.ok) return null;
  const data = await response.json() as WeatherApiResponse;
  const hours = data.forecast?.forecastday?.flatMap((day) => day.hour ?? []) ?? [];
  const targetEpoch = kickoff.getTime() / 1000;
  const hour = hours.reduce<WeatherApiHour | null>((best, candidate) => {
    if (typeof candidate.time_epoch !== "number") return best;
    if (!best || typeof best.time_epoch !== "number") return candidate;
    return Math.abs(candidate.time_epoch - targetEpoch) < Math.abs(best.time_epoch - targetEpoch) ? candidate : best;
  }, null);
  if (!hour) return null;
  return {
    condition: hour.condition?.text?.trim() || null,
    temperatureF: hour.temp_f ?? null,
    precipitationProbability: hour.chance_of_rain ?? null,
    precipitationInches: hour.precip_in ?? null,
    windMph: hour.wind_mph ?? null,
    windGustMph: hour.gust_mph ?? null,
  };
}

function highlightlyFallback(forecast?: { status?: string; temperature?: string } | null) {
  if (!forecast?.status && !forecast?.temperature) return null;
  const value = Number.parseFloat(forecast.temperature ?? "");
  const temperatureF = Number.isFinite(value)
    ? /°?c/i.test(forecast.temperature ?? "") ? value * 9 / 5 + 32 : value
    : null;
  return {
    condition: forecast.status?.trim() || null,
    temperatureF,
    precipitationProbability: null,
    precipitationInches: null,
    windMph: null,
    windGustMph: null,
  };
}

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const url = new URL(request.url);
  const requestedSeason = Number(url.searchParams.get("season"));
  const requestedWeek = Number(url.searchParams.get("week"));
  const season = Number.isInteger(requestedSeason) && requestedSeason >= 2020 && requestedSeason <= 2035 ? requestedSeason : new Date().getUTCFullYear();
  const week = Number.isInteger(requestedWeek) && requestedWeek >= 1 && requestedWeek <= 18 ? requestedWeek : 1;
  const matches = await getNflGames({ season, week, cacheSeconds: 21600 }).catch(() => []);
  const sourceDetails = { source: "Highlightly + WeatherAPI.com", weatherProvider: "WeatherAPI.com", weatherProviderUrl: WEATHER_SOURCE_URL, weatherDisclaimer: WEATHER_DISCLAIMER };
  if (!matches.length)
    return Response.json(
      { season, week, updatedAt: new Date().toISOString(), games: [], sourceStatus: "forecast_unavailable", ...sourceDetails },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1800" } },
    );
  const indoorVenues = /allegiant|at&t|caesars superdome|ford field|lucas oil|mercedes-benz|nrg stadium|state farm stadium|u\.s\. bank/i;
  const games = await Promise.all(matches.map(async (game) => {
    const detail = await getNflMatch(game.id, 21600).catch(() => null);
    const venue = detail?.venue ?? game.venue ?? {};
    const indoor = indoorVenues.test(venue.name ?? "");
    const weatherApiForecast = !indoor && game.date ? await forecastFor(game.date, venue).catch(() => null) : null;
    const forecast = weatherApiForecast ?? (!indoor ? highlightlyFallback(detail?.forecast ?? game.forecast) : null);
    const weatherSource = weatherApiForecast ? "WeatherAPI.com" : forecast ? "Highlightly" : null;
    const summary = indoor
      ? "Indoor stadium · weather neutral"
      : forecast
        ? `${forecast.condition ? `${forecast.condition} · ` : ""}${forecast.temperatureF != null ? `${Math.round(forecast.temperatureF)}°F · ` : ""}${forecast.windMph != null ? `${Math.round(forecast.windMph)} mph wind · ` : ""}${forecast.precipitationProbability != null ? `${Math.round(forecast.precipitationProbability)}% precip.` : "Forecast available"} · ${weatherSource}`
        : "Forecast available closer to kickoff";
    return { gameId: game.id, date: game.date, venue: venue.name ?? "Venue TBD", indoor, forecastAvailable: Boolean(forecast), weatherSource, summary, teams: [normalizeTeam(game.away.abbreviation), normalizeTeam(game.home.abbreviation)], ...forecast };
  }));
  return Response.json(
    { season, week, updatedAt: new Date().toISOString(), games, ...sourceDetails },
    { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" } },
  );
}
