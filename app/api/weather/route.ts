import { getChatGPTUser } from "../../chatgpt-auth";
import { getNflGames, getNflMatch } from "../../highlightly-nfl";

type Venue = { name?: string; city?: string; state?: string; indoor?: boolean };
type HourlyForecast = { time?: string[]; temperature_2m?: number[]; precipitation_probability?: number[]; precipitation?: number[]; wind_speed_10m?: number[]; wind_gusts_10m?: number[] };

const normalizeTeam = (team?: string) => ({ JAC: "JAX", WSH: "WAS" }[team ?? ""] ?? team ?? "");

async function coordinatesFor(venue: Venue) {
  const place = [venue.city, venue.state, "US"].filter(Boolean).join(", ");
  if (!place) return null;
  const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=en&format=json`, { next: { revalidate: 2592000 } });
  if (!response.ok) return null;
  const data = await response.json() as { results?: { latitude?: number; longitude?: number }[] };
  const result = data.results?.[0];
  return typeof result?.latitude === "number" && typeof result.longitude === "number" ? result : null;
}

async function forecastFor(date: string, venue: Venue) {
  const kickoff = new Date(date);
  const hoursAway = (kickoff.getTime() - Date.now()) / 3600000;
  if (!Number.isFinite(hoursAway) || hoursAway < -24 || hoursAway > 16 * 24) return null;
  const coordinates = await coordinatesFor(venue);
  if (!coordinates) return null;
  const day = date.slice(0, 10);
  const params = new URLSearchParams({
    latitude: String(coordinates.latitude), longitude: String(coordinates.longitude),
    hourly: "temperature_2m,precipitation_probability,precipitation,wind_speed_10m,wind_gusts_10m",
    temperature_unit: "fahrenheit", wind_speed_unit: "mph", timezone: "UTC", start_date: day, end_date: day,
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { next: { revalidate: 3600 } });
  if (!response.ok) return null;
  const data = await response.json() as { hourly?: HourlyForecast };
  const times = data.hourly?.time ?? [];
  const index = times.reduce((best, value, candidate) => Math.abs(new Date(`${value}Z`).getTime() - kickoff.getTime()) < Math.abs(new Date(`${times[best]}Z`).getTime() - kickoff.getTime()) ? candidate : best, 0);
  if (!times[index]) return null;
  return {
    temperatureF: data.hourly?.temperature_2m?.[index] ?? null,
    precipitationProbability: data.hourly?.precipitation_probability?.[index] ?? null,
    precipitationInches: data.hourly?.precipitation?.[index] != null ? Number((data.hourly.precipitation[index] / 25.4).toFixed(2)) : null,
    windMph: data.hourly?.wind_speed_10m?.[index] ?? null,
    windGustMph: data.hourly?.wind_gusts_10m?.[index] ?? null,
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
  if (!matches.length)
    return Response.json(
      {
        season,
        week,
        updatedAt: new Date().toISOString(),
        games: [],
        sourceStatus: "forecast_unavailable",
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1800",
        },
      },
    );
  const indoorVenues = /allegiant|at&t|caesars superdome|ford field|lucas oil|mercedes-benz|nrg stadium|state farm stadium|u\.s\. bank/i;
  const games = await Promise.all(matches.map(async (game) => {
    const detail = await getNflMatch(game.id, 21600).catch(() => null);
    const venue = detail?.venue ?? game.venue ?? {};
    const indoor = indoorVenues.test(venue.name ?? "");
    const forecast = !indoor && game.date ? await forecastFor(game.date, venue) : null;
    const summary = indoor ? "Indoor stadium · weather neutral" : forecast ? `${Math.round(forecast.temperatureF ?? 0)}°F · ${Math.round(forecast.windMph ?? 0)} mph wind · ${Math.round(forecast.precipitationProbability ?? 0)}% precip.` : "Forecast available closer to kickoff";
    return { gameId: game.id, date: game.date, venue: venue.name ?? "Venue TBD", indoor, forecastAvailable: Boolean(forecast), summary, teams: [normalizeTeam(game.away.abbreviation), normalizeTeam(game.home.abbreviation)], ...forecast };
  }));
  return Response.json(
    { season, week, updatedAt: new Date().toISOString(), games, source: "Highlightly + Open-Meteo" },
    {
      headers: {
        "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
      },
    },
  );
}
