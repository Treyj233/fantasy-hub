import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { sleeperConnections } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";

type MatchupRow = {
  roster_id?: number;
  matchup_id?: number | null;
  points?: number;
  players?: string[];
  starters?: string[];
  players_points?: Record<string, number>;
};
type SourcePlayer = {
  full_name?: string;
  first_name?: string;
  last_name?: string;
  position?: string;
  team?: string;
};
type EspnCompetitor = {
  homeAway?: string;
  score?: string;
  winner?: boolean;
  team?: {
    abbreviation?: string;
    displayName?: string;
    shortDisplayName?: string;
    color?: string;
    logo?: string;
  };
  records?: { name?: string; summary?: string }[];
};
type EspnEvent = {
  id?: string;
  date?: string;
  name?: string;
  season?: { year?: number; type?: number };
  week?: { number?: number };
  status?: {
    displayClock?: string;
    period?: number;
    type?: {
      state?: string;
      completed?: boolean;
      description?: string;
      shortDetail?: string;
    };
  };
  competitions?: {
    competitors?: EspnCompetitor[];
    venue?: { fullName?: string };
    broadcasts?: { names?: string[] }[];
  }[];
};

const normalizeTeam = (team?: string) =>
  ({ JAC: "JAX", WSH: "WAS" })[team ?? ""] ?? team ?? "";

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json({ error: "Sign in required" }, { status: 401 });
  const url = new URL(request.url);
  const leagueId = url.searchParams.get("leagueId")?.trim();
  const requestedWeek = Number(url.searchParams.get("week"));
  if (!leagueId || !/^\d{6,24}$/.test(leagueId))
    return Response.json({ error: "Select a league first" }, { status: 400 });
  const db = await getDb();
  const [connection] = await db
    .select()
    .from(sleeperConnections)
    .where(eq(sleeperConnections.userId, user.userId))
    .limit(1);
  if (!connection)
    return Response.json(
      { error: "Connect a Sleeper account first" },
      { status: 409 },
    );
  const leagueResponse = await fetch(
    `https://api.sleeper.app/v1/league/${leagueId}`,
    { next: { revalidate: 30 } },
  );
  if (!leagueResponse.ok)
    return Response.json({ error: "League unavailable" }, { status: 404 });
  const league = (await leagueResponse.json()) as {
    name?: string;
    season?: string;
    leg?: number;
  };
  const week =
    Number.isInteger(requestedWeek) && requestedWeek >= 1 && requestedWeek <= 18
      ? requestedWeek
      : Math.max(1, league.leg ?? 1);
  const season = league.season ?? String(new Date().getUTCFullYear());
  const seasonNumber = Number(season);
  const [
    gamesResponse,
    matchupsResponse,
    rostersResponse,
    usersResponse,
    playersResponse,
  ] = await Promise.all([
    fetch(
      `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}&seasontype=2&week=${week}`,
      { next: { revalidate: 20 } },
    ),
    fetch(`https://api.sleeper.app/v1/league/${leagueId}/matchups/${week}`, {
      next: { revalidate: 15 },
    }),
    fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`, {
      next: { revalidate: 300 },
    }),
    fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`, {
      next: { revalidate: 300 },
    }),
    fetch("https://api.sleeper.app/v1/players/nfl?active=true", {
      next: { revalidate: 86400 },
    }),
  ]);
  if (!gamesResponse.ok)
    return Response.json(
      { error: "NFL schedule unavailable" },
      { status: 502 },
    );
  const gamesPayload = (await gamesResponse.json()) as { events?: EspnEvent[] };
  const matchupRows = matchupsResponse.ok
    ? ((await matchupsResponse.json()) as MatchupRow[])
    : [];
  const rosters = rostersResponse.ok
    ? ((await rostersResponse.json()) as {
        roster_id?: number;
        owner_id?: string;
      }[])
    : [];
  const managers = usersResponse.ok
    ? ((await usersResponse.json()) as {
        user_id?: string;
        display_name?: string;
        metadata?: { team_name?: string };
      }[])
    : [];
  const players = playersResponse.ok
    ? ((await playersResponse.json()) as Record<string, SourcePlayer>)
    : {};
  const myRoster = rosters.find(
    (roster) => roster.owner_id === connection.sleeperUserId,
  );
  const myRow = matchupRows.find(
    (row) => row.roster_id === myRoster?.roster_id,
  );
  const opponentRow = matchupRows.find(
    (row) =>
      row.matchup_id === myRow?.matchup_id &&
      row.roster_id !== myRow?.roster_id,
  );
  const rosterById = new Map(
    rosters.flatMap((roster) =>
      roster.roster_id ? [[roster.roster_id, roster]] : [],
    ),
  );
  const managerById = new Map(
    managers.flatMap((manager) =>
      manager.user_id ? [[manager.user_id, manager]] : [],
    ),
  );
  const opponentRoster = opponentRow?.roster_id
    ? rosterById.get(opponentRow.roster_id)
    : undefined;
  const opponentManager = opponentRoster?.owner_id
    ? managerById.get(opponentRoster.owner_id)
    : undefined;
  const matchupPlayers = [
    { row: myRow, side: "You" as const },
    { row: opponentRow, side: "Opponent" as const },
  ].flatMap(({ row, side }) =>
    (row?.players ?? []).flatMap((playerId) => {
      const player = players[playerId];
      if (!player?.team) return [];
      return [
        {
          id: playerId,
          name:
            player.full_name ??
            `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim(),
          position: player.position ?? "FLEX",
          nflTeam: normalizeTeam(player.team),
          side,
          starter: (row?.starters ?? []).includes(playerId),
          fantasyPoints: Number(
            (row?.players_points?.[playerId] ?? 0).toFixed(2),
          ),
        },
      ];
    }),
  );
  const games = (gamesPayload.events ?? [])
    .filter(
      (event) =>
        event.competitions?.[0]?.competitors?.length === 2 &&
        (event.week?.number == null || event.week.number === week) &&
        (event.season?.year == null || event.season.year === seasonNumber),
    )
    .map((event) => {
      const competition = event.competitions?.[0];
      const teams = (competition?.competitors ?? [])
        .map((competitor) => ({
          abbreviation: normalizeTeam(competitor.team?.abbreviation),
          name:
            competitor.team?.shortDisplayName ??
            competitor.team?.displayName ??
            "Team",
          displayName: competitor.team?.displayName ?? "Team",
          homeAway: competitor.homeAway ?? "away",
          score: Number(competitor.score ?? 0),
          winner: Boolean(competitor.winner),
          color: competitor.team?.color ?? "173f2a",
          logo: competitor.team?.logo ?? null,
          record:
            competitor.records?.find((record) => record.name === "overall")
              ?.summary ?? "",
        }))
        .sort((a, b) =>
          a.homeAway === "away" ? -1 : b.homeAway === "away" ? 1 : 0,
        );
      const teamCodes = new Set(teams.map((team) => team.abbreviation));
      const impactPlayers = matchupPlayers
        .filter((player) => teamCodes.has(player.nflTeam))
        .sort(
          (a, b) =>
            Number(b.starter) - Number(a.starter) ||
            b.fantasyPoints - a.fantasyPoints,
        );
      const state = event.status?.type?.state ?? "pre";
      return {
        id: event.id ?? event.name ?? String(event.date),
        date: event.date ?? "",
        name: event.name ?? "NFL Game",
        status:
          event.status?.type?.shortDetail ??
          event.status?.type?.description ??
          "Scheduled",
        state,
        clock:
          state === "in"
            ? `${event.status?.period ? `Q${event.status.period} · ` : ""}${event.status?.displayClock ?? ""}`
            : "",
        venue: competition?.venue?.fullName ?? "",
        broadcast:
          competition?.broadcasts
            ?.flatMap((broadcast) => broadcast.names ?? [])
            .join(" · ") ?? "",
        teams,
        impactPlayers,
      };
    })
    .sort(
      (a, b) =>
        Number(b.impactPlayers.length > 0) -
          Number(a.impactPlayers.length > 0) ||
        new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
  return Response.json({
    league: { id: leagueId, name: league.name ?? "League", season },
    week,
    updatedAt: new Date().toISOString(),
    fantasyMatchup: {
      available: Boolean(myRow && opponentRow),
      yourPoints: Number((myRow?.points ?? 0).toFixed(2)),
      opponentPoints: Number((opponentRow?.points ?? 0).toFixed(2)),
      opponentName:
        opponentManager?.metadata?.team_name ??
        opponentManager?.display_name ??
        "Opponent",
      playerCount: matchupPlayers.length,
    },
    games,
  });
}
