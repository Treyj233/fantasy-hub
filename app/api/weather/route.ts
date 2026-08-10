import { getChatGPTUser } from "../../chatgpt-auth";

type Venue = { fullName?: string; indoor?: boolean; address?: { city?: string; state?: string; country?: string } };
type Competitor = { team?: { abbreviation?: string } };
type EspnEvent = { id?: string; date?: string; season?: { year?: number; type?: number }; week?: { number?: number }; competitions?: { venue?: Venue; competitors?: Competitor[] }[] };
type HourlyForecast = { time?: string[]; temperature_2m?: number[]; precipitation_probability?: number[]; precipitation?: number[]; wind_speed_10m?: number[]; wind_gusts_10m?: number[] };

const normalizeTeam = (team?: string) => ({ JAC: "JAX", WSH: "WAS" }[team ?? ""] ?? team ?? "");

async function coordinatesFor(venue: Venue) {
  const place = [venue.address?.city, venue.address?.state, venue.address?.country].filter(Boolean).join(", ");
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
  const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}&seasontype=2&week=${week}`, { next: { revalidate: 21600 } });
  if (!response.ok)
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
  const payload = await response.json() as { events?: EspnEvent[] };
  const events = (payload.events ?? []).filter((event) => event.season?.year === season && event.season?.type === 2 && event.week?.number === week);
  const games = await Promise.all(events.map(async (event) => {
    const competition = event.competitions?.[0];
    const venue = competition?.venue ?? {};
    const indoor = Boolean(venue.indoor);
    const forecast = !indoor && event.date ? await forecastFor(event.date, venue) : null;
    const summary = indoor ? "Indoor stadium · weather neutral" : forecast ? `${Math.round(forecast.temperatureF ?? 0)}°F · ${Math.round(forecast.windMph ?? 0)} mph wind · ${Math.round(forecast.precipitationProbability ?? 0)}% precip.` : "Forecast available closer to kickoff";
    return { gameId: event.id ?? "", date: event.date ?? "", venue: venue.fullName ?? "Venue TBD", indoor, forecastAvailable: Boolean(forecast), summary, teams: (competition?.competitors ?? []).map((item) => normalizeTeam(item.team?.abbreviation)).filter(Boolean), ...forecast };
  }));
  return Response.json(
    { season, week, updatedAt: new Date().toISOString(), games },
    {
      headers: {
        "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
      },
    },
  );
}
