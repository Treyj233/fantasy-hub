import { getChatGPTUser } from "../../chatgpt-auth";

type EspnCompetitor = { homeAway?: "home" | "away"; team?: { abbreviation?: string; displayName?: string; shortDisplayName?: string } };
type EspnEvent = { id?: string; date?: string; name?: string; season?: { year?: number; type?: number }; week?: { number?: number }; status?: { type?: { state?: string; description?: string; shortDetail?: string } }; competitions?: { competitors?: EspnCompetitor[]; broadcasts?: { names?: string[] }[] }[] };

const normalizeTeam = (team?: string) => ({ JAC: "JAX", WSH: "WAS" }[team ?? ""] ?? team ?? "TBD");

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const requestedSeason = Number(new URL(request.url).searchParams.get("season"));
  const season = Number.isInteger(requestedSeason) && requestedSeason >= 2020 && requestedSeason <= 2035 ? requestedSeason : new Date().getUTCFullYear();
  const responses = await Promise.all(Array.from({ length: 18 }, (_, index) => fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}&seasontype=2&week=${index + 1}`, { next: { revalidate: 21600 } }).catch(() => null)));
  const payloads = await Promise.all(responses.map((response) => response?.ok ? response.json() as Promise<{ events?: EspnEvent[] }> : Promise.resolve({ events: [] as EspnEvent[] })));
  const games = payloads.flatMap((payload) => payload.events ?? []).filter((event) => event.season?.year === season && event.season?.type === 2 && event.week?.number && event.competitions?.[0]?.competitors?.length === 2).map((event) => {
    const competition = event.competitions![0];
    const away = competition.competitors!.find((team) => team.homeAway === "away");
    const home = competition.competitors!.find((team) => team.homeAway === "home");
    return {
      id: event.id ?? `${event.week!.number}-${away?.team?.abbreviation}-${home?.team?.abbreviation}`,
      week: event.week!.number!,
      date: event.date ?? "",
      status: event.status?.type?.shortDetail ?? event.status?.type?.description ?? "Scheduled",
      broadcast: competition.broadcasts?.flatMap((item) => item.names ?? [])[0] ?? "",
      away: { abbreviation: normalizeTeam(away?.team?.abbreviation), name: away?.team?.shortDisplayName ?? away?.team?.displayName ?? "TBD" },
      home: { abbreviation: normalizeTeam(home?.team?.abbreviation), name: home?.team?.shortDisplayName ?? home?.team?.displayName ?? "TBD" },
    };
  }).sort((a, b) => a.week - b.week || a.date.localeCompare(b.date));
  if (!games.length) return Response.json({ error: "NFL schedule unavailable" }, { status: 502 });
  const now = Date.now();
  const currentWeek = games.find((game) => new Date(game.date).getTime() >= now)?.week ?? games.at(-1)?.week ?? 1;
  const weeks = Array.from({ length: 18 }, (_, index) => ({ week: index + 1, games: games.filter((game) => game.week === index + 1) }));
  return Response.json({ season, currentWeek, updatedAt: new Date().toISOString(), weeks });
}
