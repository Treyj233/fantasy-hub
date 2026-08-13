import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { sleeperConnections } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";
import { loadNflSeasonSchedule } from "../../nfl-schedule-data";

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
type SourceProjection = { player_id?: string; stats?: Record<string, number> };
type EspnCompetitor = { homeAway?: string; score?: string; winner?: boolean; team?: { abbreviation?: string; displayName?: string; shortDisplayName?: string; color?: string; logo?: string }; records?: { name?: string; summary?: string }[] };
type EspnEvent = { id?: string; date?: string; name?: string; status?: { displayClock?: string; period?: number; type?: { state?: string; description?: string; shortDetail?: string } }; competitions?: { competitors?: EspnCompetitor[]; venue?: { fullName?: string }; broadcasts?: { names?: string[] }[] }[] };
const normalizeTeam = (team?: string) =>
  ({ JAC: "JAX", WSH: "WAS", LA: "LAR" })[team ?? ""] ?? team ?? "";

const teamColors: Record<string, string> = {
  ARI: "97233F", ATL: "A71930", BAL: "241773", BUF: "00338D",
  CAR: "0085CA", CHI: "0B162A", CIN: "FB4F14", CLE: "311D00",
  DAL: "003594", DEN: "FB4F14", DET: "0076B6", GB: "203731",
  HOU: "03202F", IND: "002C5F", JAX: "006778", KC: "E31837",
  LAC: "0080C6", LAR: "003594", LV: "000000", MIA: "008E97",
  MIN: "4F2683", NE: "002244", NO: "D3BC8D", NYG: "0B2265",
  NYJ: "125740", PHI: "004C54", PIT: "FFB612", SEA: "002244",
  SF: "AA0000", TB: "D50A0A", TEN: "0C2340", WAS: "5A1414",
};

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
    scoring_settings?: Record<string, number>;
  };
  const week =
    Number.isInteger(requestedWeek) && requestedWeek >= 1 && requestedWeek <= 18
      ? requestedWeek
      : Math.max(1, league.leg ?? 1);
  const season = league.season ?? String(new Date().getUTCFullYear());
  const seasonNumber = Number(season);
  const [
    espnGamesResponse,
    scheduleGames,
    matchupsResponse,
    rostersResponse,
    usersResponse,
    playersResponse,
    projectionsResponse,
  ] = await Promise.all([
    fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}&seasontype=2&week=${week}`, { next: { revalidate: 20 } }).catch(() => null),
    loadNflSeasonSchedule(seasonNumber),
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
    fetch(`https://api.sleeper.com/projections/nfl/${season}/${week}?season_type=regular`, { next: { revalidate: 900 } }).catch(() => null),
  ]);
  if (!scheduleGames.length)
    return Response.json({ error: "NFL schedule unavailable" }, { status: 502 });
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
  const projectionPayload: unknown = projectionsResponse?.ok ? await projectionsResponse.json().catch(() => []) : [];
  const projectionRows: SourceProjection[] = Array.isArray(projectionPayload) ? projectionPayload : [];
  const receptionValue = league.scoring_settings?.rec ?? 1;
  const projectionKey = receptionValue >= .75 ? "pts_ppr" : receptionValue >= .25 ? "pts_half_ppr" : "pts_std";
  const projectionByPlayer = new Map(projectionRows.flatMap((row) => {
    const value = row.stats?.[projectionKey];
    return row.player_id && typeof value === "number" ? [[row.player_id, Number(value.toFixed(2))]] : [];
  }));
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
          projection: projectionByPlayer.get(playerId) ?? null,
          remainingProjection: Math.max(0, Number(((projectionByPlayer.get(playerId) ?? 0) - (row?.players_points?.[playerId] ?? 0)).toFixed(2))),
        },
      ];
    }),
  );
  const attachImpactPlayers = (teams: { abbreviation: string }[]) => {
    const teamCodes = new Set(teams.map((team) => team.abbreviation));
    return matchupPlayers
      .filter((player) => teamCodes.has(player.nflTeam))
      .sort((a, b) => Number(b.starter) - Number(a.starter) || b.fantasyPoints - a.fantasyPoints);
  };
  const espnPayload = espnGamesResponse?.ok
    ? await espnGamesResponse.json().catch(() => null) as { events?: EspnEvent[] } | null
    : null;
  const espnGames = (espnPayload?.events ?? []).flatMap((event) => {
    const competition = event.competitions?.[0];
    const competitors = competition?.competitors ?? [];
    if (competitors.length !== 2) return [];
    const teams = competitors.map((competitor) => {
      const abbreviation = normalizeTeam(competitor.team?.abbreviation);
      return { abbreviation, name: competitor.team?.shortDisplayName ?? competitor.team?.displayName ?? abbreviation, displayName: competitor.team?.displayName ?? competitor.team?.shortDisplayName ?? abbreviation, homeAway: competitor.homeAway ?? "away", score: Number(competitor.score ?? 0), winner: Boolean(competitor.winner), color: competitor.team?.color ?? teamColors[abbreviation] ?? "173f2a", logo: competitor.team?.logo ?? null, record: competitor.records?.find((record) => record.name === "overall")?.summary ?? "" };
    }).sort((a, b) => a.homeAway === "away" ? -1 : b.homeAway === "away" ? 1 : 0);
    const state = event.status?.type?.state ?? "pre";
    return [{ id: event.id ?? event.name ?? event.date ?? "nfl-game", date: event.date ?? "", name: event.name ?? `${teams[0].name} at ${teams[1].name}`, status: event.status?.type?.shortDetail ?? event.status?.type?.description ?? "Scheduled", state, clock: state === "in" ? `${event.status?.period ? `Q${event.status.period} · ` : ""}${event.status?.displayClock ?? ""}` : "", venue: competition?.venue?.fullName ?? "", broadcast: competition?.broadcasts?.flatMap((broadcast) => broadcast.names ?? []).join(" · ") ?? "", teams, impactPlayers: attachImpactPlayers(teams) }];
  });
  const fallbackGames = scheduleGames
    .filter((game) => game.week === week)
    .map((game) => {
      const teams = [
        { ...game.away, displayName: game.away.name, homeAway: "away", score: 0, winner: false, color: teamColors[game.away.abbreviation] ?? "173f2a", logo: null, record: "" },
        { ...game.home, displayName: game.home.name, homeAway: "home", score: 0, winner: false, color: teamColors[game.home.abbreviation] ?? "173f2a", logo: null, record: "" },
      ];
      return {
        id: game.id,
        date: game.date,
        name: `${game.away.name} at ${game.home.name}`,
        status: game.status,
        state: "pre",
        clock: "",
        venue: game.venue,
        broadcast: game.broadcast,
        teams,
        impactPlayers: attachImpactPlayers(teams),
      };
    });
  const fallbackSchedule = espnGames.length === 0;
  const games = (fallbackSchedule ? fallbackGames : espnGames)
    .sort(
      (a, b) =>
        Number(b.impactPlayers.length > 0) -
          Number(a.impactPlayers.length > 0) ||
        new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
  return Response.json({
    league: { id: leagueId, name: league.name ?? "League", season, provider: "Sleeper", projectionSource: "Sleeper Projections" },
    week,
    updatedAt: new Date().toISOString(),
    scoresAvailable: !fallbackSchedule,
    fallbackSchedule,
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
