import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { sleeperConnections } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";

type MatchupRow = { roster_id?: number; matchup_id?: number | null; points?: number; custom_points?: number | null; starters?: string[]; players?: string[]; players_points?: Record<string, number> };
type Roster = { roster_id?: number; owner_id?: string };
type Manager = { user_id?: string; display_name?: string; metadata?: { team_name?: string } };
type Transaction = { transaction_id?: string; type?: string; status?: string; roster_ids?: number[]; adds?: Record<string, number>; drops?: Record<string, number>; created?: number };
type Player = { full_name?: string; first_name?: string; last_name?: string; position?: string };

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const leagueId = new URL(request.url).searchParams.get("leagueId")?.trim();
  if (!leagueId || !/^\d{6,24}$/.test(leagueId)) return Response.json({ error: "Select a league first" }, { status: 400 });
  const db = await getDb();
  const [connection] = await db.select().from(sleeperConnections).where(eq(sleeperConnections.userId, user.userId)).limit(1);
  if (!connection) return Response.json({ error: "Connect a Sleeper account first" }, { status: 409 });
  const [leagueResponse, rostersResponse, managersResponse, playersResponse] = await Promise.all([
    fetch(`https://api.sleeper.app/v1/league/${leagueId}`, { next: { revalidate: 60 } }),
    fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`, { next: { revalidate: 300 } }),
    fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`, { next: { revalidate: 300 } }),
    fetch("https://api.sleeper.app/v1/players/nfl", { next: { revalidate: 86400 } }),
  ]);
  if (!leagueResponse.ok || !rostersResponse.ok || !managersResponse.ok) return Response.json({ error: "League story data is unavailable" }, { status: 502 });
  const league = await leagueResponse.json() as { name?: string; season?: string; leg?: number; settings?: { playoff_teams?: number; playoff_week_start?: number } };
  const rosters = await rostersResponse.json() as Roster[];
  const managers = await managersResponse.json() as Manager[];
  const players = playersResponse.ok ? await playersResponse.json() as Record<string, Player> : {};
  const currentWeek = Math.min(18, Math.max(1, league.leg ?? 1));
  const completedWeek = Math.max(0, currentWeek - 1);
  const weeksToLoad = Array.from({ length: currentWeek }, (_, index) => index + 1);
  const [weekPayloads, transactionPayloads] = await Promise.all([
    Promise.all(weeksToLoad.map(async (week) => {
      const response = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/matchups/${week}`, { next: { revalidate: week < currentWeek ? 3600 : 30 } }).catch(() => null);
      return { week, rows: response?.ok ? await response.json().catch(() => []) as MatchupRow[] : [] };
    })),
    Promise.all([completedWeek, currentWeek].filter((week, index, values) => week >= 1 && values.indexOf(week) === index).map(async (week) => {
      const response = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/transactions/${week}`, { next: { revalidate: week < currentWeek ? 3600 : 60 } }).catch(() => null);
      return { week, rows: response?.ok ? await response.json().catch(() => []) as Transaction[] : [] };
    })),
  ]);
  const managerById = new Map(managers.flatMap((manager) => manager.user_id ? [[manager.user_id, manager]] : []));
  const teamByRoster = new Map(rosters.flatMap((roster) => {
    if (!roster.roster_id) return [];
    const manager = roster.owner_id ? managerById.get(roster.owner_id) : undefined;
    return [[roster.roster_id, { rosterId: roster.roster_id, ownerId: roster.owner_id ?? "", managerName: manager?.display_name ?? `Manager ${roster.roster_id}`, teamName: manager?.metadata?.team_name ?? `${manager?.display_name ?? `Manager ${roster.roster_id}`}'s Team`, isMine: roster.owner_id === connection.sleeperUserId }]];
  }));
  const playerName = (id: string) => players[id]?.full_name ?? (`${players[id]?.first_name ?? ""} ${players[id]?.last_name ?? ""}`.trim() || `Player ${id}`);
  const allGames = weekPayloads.flatMap(({ week, rows }) => {
    const groups = new Map<number, MatchupRow[]>();
    rows.forEach((row, index) => { const key = row.matchup_id ?? 1000 + index; groups.set(key, [...(groups.get(key) ?? []), row]); });
    return [...groups.entries()].flatMap(([matchupId, paired]) => paired.length < 2 ? [] : [{ week, matchupId, teams: paired.slice(0, 2).map((row) => ({ ...teamByRoster.get(row.roster_id ?? -1), rosterId: row.roster_id ?? -1, points: Number((row.custom_points ?? row.points ?? 0).toFixed(2)), starters: row.starters ?? [], players: row.players ?? [], playerPoints: row.players_points ?? {} })) }]);
  });
  const standingsFor = (throughWeek: number) => {
    const records = new Map([...teamByRoster.values()].map((team) => [team.rosterId, { ...team, wins: 0, losses: 0, ties: 0, points: 0 }]));
    allGames.filter((game) => game.week <= throughWeek).forEach((game) => {
      const [a, b] = game.teams; const ar = records.get(a.rosterId); const br = records.get(b.rosterId); if (!ar || !br) return;
      ar.points += a.points; br.points += b.points;
      if (a.points === b.points) { ar.ties++; br.ties++; } else if (a.points > b.points) { ar.wins++; br.losses++; } else { br.wins++; ar.losses++; }
    });
    return [...records.values()].sort((a, b) => b.wins - a.wins || b.points - a.points).map((team, index) => ({ ...team, rank: index + 1, points: Number(team.points.toFixed(2)) }));
  };
  const standings = standingsFor(completedWeek);
  const priorStandings = standingsFor(Math.max(0, completedWeek - 1));
  const priorRank = new Map(priorStandings.map((team) => [team.rosterId, team.rank]));
  const powerRankings = standings.map((team) => ({ ...team, movement: (priorRank.get(team.rosterId) ?? team.rank) - team.rank }));
  const recapGames = allGames.filter((game) => game.week === completedWeek && game.teams.some((team) => team.points > 0));
  const sortedScores = recapGames.flatMap((game) => game.teams).sort((a, b) => b.points - a.points);
  const closest = [...recapGames].sort((a, b) => Math.abs(a.teams[0].points - a.teams[1].points) - Math.abs(b.teams[0].points - b.teams[1].points))[0];
  const widest = [...recapGames].sort((a, b) => Math.abs(b.teams[0].points - b.teams[1].points) - Math.abs(a.teams[0].points - a.teams[1].points))[0];
  const preWeekRank = new Map(standingsFor(Math.max(0, completedWeek - 1)).map((team) => [team.rosterId, team.rank]));
  const biggestUpset = recapGames.map((game) => {
    const winner = [...game.teams].sort((a, b) => b.points - a.points)[0];
    const loser = game.teams.find((team) => team.rosterId !== winner.rosterId)!;
    return { winner, loser, seedGap: (preWeekRank.get(winner.rosterId) ?? 0) - (preWeekRank.get(loser.rosterId) ?? 0) };
  }).filter((game) => game.seedGap > 0).sort((a, b) => b.seedGap - a.seedGap)[0] ?? null;
  const lineupOutcomes = recapGames.flatMap((game) => game.teams.map((team) => {
    const bench = team.players.filter((id) => !team.starters.includes(id));
    const benchPoints = bench.reduce((sum, id) => sum + (team.playerPoints[id] ?? 0), 0);
    const topBenchId = bench.sort((a, b) => (team.playerPoints[b] ?? 0) - (team.playerPoints[a] ?? 0))[0];
    return { teamName: team.teamName, benchPoints: Number(benchPoints.toFixed(1)), topBenchPlayer: topBenchId ? playerName(topBenchId) : null, topBenchPoints: topBenchId ? Number((team.playerPoints[topBenchId] ?? 0).toFixed(1)) : 0 };
  })).sort((a, b) => b.benchPoints - a.benchPoints);
  const myTeam = [...teamByRoster.values()].find((team) => team.isMine);
  const myGames = allGames.filter((game) => game.teams.some((team) => team.rosterId === myTeam?.rosterId));
  const currentMyGame = myGames.find((game) => game.week === currentWeek);
  const currentOpponent = currentMyGame?.teams.find((team) => team.rosterId !== myTeam?.rosterId);
  const rivalryGames = currentOpponent ? myGames.filter((game) => game.teams.some((team) => team.rosterId === currentOpponent.rosterId) && game.week <= completedWeek) : [];
  const rivalry = currentOpponent && myTeam ? { opponentName: currentOpponent.teamName, meetings: rivalryGames.length, wins: rivalryGames.filter((game) => (game.teams.find((team) => team.rosterId === myTeam.rosterId)?.points ?? 0) > (game.teams.find((team) => team.rosterId === currentOpponent.rosterId)?.points ?? 0)).length, losses: rivalryGames.filter((game) => (game.teams.find((team) => team.rosterId === myTeam.rosterId)?.points ?? 0) < (game.teams.find((team) => team.rosterId === currentOpponent.rosterId)?.points ?? 0)).length } : null;
  const trades = transactionPayloads.flatMap(({ week, rows }) => rows.filter((row) => row.type === "trade" && row.status === "complete").map((row) => ({ id: row.transaction_id ?? `${week}-${row.created}`, week, timestamp: row.created ?? null, teams: (row.roster_ids ?? []).map((id) => teamByRoster.get(id)?.teamName ?? `Team ${id}`), adds: Object.entries(row.adds ?? {}).map(([id, rosterId]) => ({ player: playerName(id), team: teamByRoster.get(rosterId)?.teamName ?? `Team ${rosterId}` })), drops: Object.entries(row.drops ?? {}).map(([id, rosterId]) => ({ player: playerName(id), team: teamByRoster.get(rosterId)?.teamName ?? `Team ${rosterId}` })) })));
  const playoffTeams = league.settings?.playoff_teams ?? Math.max(4, Math.floor(rosters.length / 2));
  const playoffWeek = league.settings?.playoff_week_start ?? 15;
  const playoffLine = standings[playoffTeams - 1];
  const mineStanding = standings.find((team) => team.isMine);
  return Response.json({
    league: { name: league.name ?? "League", season: league.season ?? "", currentWeek, completedWeek, provider: "Sleeper" },
    updatedAt: new Date().toISOString(),
    recap: { available: recapGames.length > 0, week: completedWeek || currentWeek, highScore: sortedScores[0] ?? null, closestGame: closest ?? null, biggestWin: widest ?? null, biggestUpset, lineupOutcomes: lineupOutcomes.slice(0, 3) },
    preview: { week: currentWeek, games: allGames.filter((game) => game.week === currentWeek).map((game) => ({ matchupId: game.matchupId, teams: game.teams.map((team) => ({ rosterId: team.rosterId, teamName: team.teamName, managerName: team.managerName, points: team.points, isMine: team.isMine })) })) },
    powerRankings,
    rivalry,
    trades,
    playoff: { teams: playoffTeams, startsWeek: playoffWeek, weeksRemaining: Math.max(0, playoffWeek - currentWeek), yourRank: completedWeek ? mineStanding?.rank ?? null : null, yourWins: completedWeek ? mineStanding?.wins ?? null : null, lineWins: completedWeek ? playoffLine?.wins ?? null : null, summary: !completedWeek ? "The playoff race begins after Week 1 results are recorded." : mineStanding && playoffLine ? mineStanding.rank <= playoffTeams ? `Currently inside the ${playoffTeams}-team playoff field, ${mineStanding.wins - playoffLine.wins} wins relative to the current cutoff.` : `Currently ${mineStanding.wins === playoffLine.wins ? "tied in wins with" : `${playoffLine.wins - mineStanding.wins} wins behind`} the playoff cutoff.` : "Playoff context is unavailable until standings are posted." },
    methodology: "Stories use observed Sleeper matchup scores, rosters and completed transactions. Power movement is standings-based; lineup notes describe outcomes, not decision quality."
  });
}
