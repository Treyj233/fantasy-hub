import { getChatGPTUser } from "../../chatgpt-auth";

type EspnTeam = { id?: string; abbreviation?: string };
type EspnEvent = { id?: string; status?: { type?: { state?: string } }; competitions?: { competitors?: { team?: EspnTeam }[] }[] };
type EspnPlay = {
  id?: string;
  text?: string;
  wallclock?: string;
  modified?: string;
  scoringPlay?: boolean;
  isTurnover?: boolean;
  statYardage?: number;
  type?: { text?: string };
  period?: { number?: number };
  clock?: { displayValue?: string };
  teamParticipants?: { id?: string; type?: string }[];
};
type EspnSummary = { drives?: { current?: { plays?: EspnPlay[] }; previous?: { plays?: EspnPlay[] }[] } };

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const url = new URL(request.url);
  const season = Number(url.searchParams.get("season")) || new Date().getUTCFullYear();
  const week = Math.max(1, Math.min(18, Number(url.searchParams.get("week")) || 1));
  const scoreboardResponse = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}&seasontype=2&week=${week}`, { cache: "no-store" }).catch(() => null);
  if (!scoreboardResponse?.ok) return Response.json({ plays: [], available: false });
  const scoreboard = await scoreboardResponse.json() as { events?: EspnEvent[] };
  const liveEvents = (scoreboard.events ?? []).filter((event) => event.id && event.status?.type?.state === "in");
  const summaries = await Promise.all(liveEvents.map(async (event) => {
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${event.id}`, { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return [];
    const payload = await response.json() as EspnSummary;
    const teams = new Map((event.competitions?.[0]?.competitors ?? []).flatMap((competitor) => competitor.team?.id ? [[competitor.team.id, competitor.team.abbreviation ?? ""]] : []));
    const plays = [...(payload.drives?.previous ?? []).flatMap((drive) => drive.plays ?? []), ...(payload.drives?.current?.plays ?? [])];
    return plays.flatMap((play) => {
      if (!play.id || !play.text) return [];
      const offenseId = play.teamParticipants?.find((participant) => participant.type === "offense")?.id;
      const defenseId = play.teamParticipants?.find((participant) => participant.type === "defense")?.id;
      return [{ id: play.id, gameId: event.id!, text: play.text, type: play.type?.text ?? "Play", yardage: play.statYardage ?? 0, scoringPlay: Boolean(play.scoringPlay), isTurnover: Boolean(play.isTurnover), period: play.period?.number ?? 0, clock: play.clock?.displayValue ?? "", at: play.modified ?? play.wallclock ?? "", offenseTeam: offenseId ? teams.get(offenseId) ?? "" : "", defenseTeam: defenseId ? teams.get(defenseId) ?? "" : "" }];
    });
  }));
  const plays = summaries.flat().sort((a, b) => b.at.localeCompare(a.at)).slice(0, 180);
  return Response.json({ plays, available: true, updatedAt: new Date().toISOString() });
}
