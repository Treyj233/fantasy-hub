import { fetchCachedUpstream } from './api/upstream-cache';
import { getSleeperWeeklyStats, getSleeperWeeklyProjections } from './api/sleeper-shared-data';
import { sleeperFantasyPoints } from './sleeper-live-scoring.mjs';
import { postgameValueAdjustment } from './postgame-value.mjs';

const key = (name: string, position: string) => `${name.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/(jr|sr|iii|ii|iv)$/, '')}:${position}`;
const teamKey = (team: string) => ({ JAC: 'JAX', WSH: 'WAS', LA: 'LAR' }[team] ?? team);
type RankedPlayer = { id: string; name: string; position: string; team?: string; status: string; postgameAdjustment?: number; postgameWeek?: number; seasonMarketRank?: number | null; adpBySite?: Record<string, number | null>; gamesPlayed2025?: number | null };
type LeaguePayload = { league: { season?: string; currentWeek?: number }; rankings: RankedPlayer[]; teams: { roster: RankedPlayer[] }[] };

export async function applyPostgameRankings<T extends LeaguePayload>(payload: T): Promise<T> {
  const season = Number(payload.league.season);
  const week = Math.max(1, Math.min(18, payload.league.currentWeek ?? 1));
  if (!Number.isFinite(season)) return payload;
  try {
    const [directoryResponse, gamesResponse, stats, projections] = await Promise.all([
      fetchCachedUpstream('https://api.sleeper.app/v1/players/nfl', 300),
      fetchCachedUpstream(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}&seasontype=2&week=${week}`, 120),
      getSleeperWeeklyStats(String(season), week).catch(() => null),
      getSleeperWeeklyProjections(String(season), week).catch(() => null),
    ]);
    if (!directoryResponse.ok) return payload;
    const directory = await directoryResponse.json() as Record<string, { full_name?: string; first_name?: string; last_name?: string; position?: string; team?: string; injury_status?: string | null }>;
    const games = gamesResponse.ok ? await gamesResponse.json() as { events?: { season?: { year?: number; type?: number }; week?: { number?: number }; status?: { type?: { completed?: boolean } }; competitions?: { competitors?: { team?: { abbreviation?: string } }[] }[] }[] } : null;
    const finalTeams = new Set<string>();
    for (const game of games?.events ?? []) {
      if (game.season?.year !== season || game.season?.type !== 2 || game.week?.number !== week || !game.status?.type?.completed) continue;
      for (const competitor of game.competitions?.[0]?.competitors ?? []) {
        if (competitor.team?.abbreviation) finalTeams.add(teamKey(competitor.team.abbreviation));
      }
    }
    const byName = new Map<string, string[]>();
    // A short, shared upstream-cached window supplies evidence, not a week-number multiplier.
    const priorWeeks = await Promise.all(Array.from({ length: Math.min(3, week - 1) }, (_, index) => week - Math.min(3, week - 1) + index).map(async priorWeek => {
      try {
        const [actual, projected, response] = await Promise.all([
          getSleeperWeeklyStats(String(season), priorWeek),
          getSleeperWeeklyProjections(String(season), priorWeek),
          fetchCachedUpstream(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}&seasontype=2&week=${priorWeek}`, 300),
        ]);
        if (!response.ok) return null;
        const previousGames = await response.json() as NonNullable<typeof games>;
        const teams = new Set<string>();
        for (const game of previousGames.events ?? []) {
          if (game.season?.year !== season || game.season?.type !== 2 || game.week?.number !== priorWeek || !game.status?.type?.completed) continue;
          for (const competitor of game.competitions?.[0]?.competitors ?? []) if (competitor.team?.abbreviation) teams.add(teamKey(competitor.team.abbreviation));
        }
        return { actual, projected, teams };
      } catch { return null; }
    }));
    for (const [id, player] of Object.entries(directory)) {
      const name = player.full_name ?? `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim();
      const nameKey = key(name, player.position ?? '');
      byName.set(nameKey, [...(byName.get(nameKey) ?? []), id]);
    }
    const enrich = <P extends RankedPlayer>(player: P): P => {
      const matches = byName.get(key(player.name, player.position)) ?? [];
      const sourceId = directory[player.id] ? player.id : matches.length === 1 ? matches[0] : null;
      if (!sourceId) return player;
      const source = directory[sourceId];
      const actual = stats?.value.get(sourceId);
      const projected = projections?.value.get(sourceId);
      // Standardized PPR compares performance consistently; league-specific ranking remains the baseline.
      const scoring = { rec: 1, pass_yd: .04, pass_td: 4, pass_int: -2, rush_yd: .1, rush_td: 6, rec_yd: .1, rec_td: 6, fum_lost: -2 };
      const adjustment = actual && projected ? postgameValueAdjustment(
        sleeperFantasyPoints(actual, scoring), sleeperFantasyPoints(projected, scoring),
        finalTeams.has(teamKey(source.team ?? player.team ?? '')),
        {
          marketRank: player.seasonMarketRank ?? player.adpBySite?.Sleeper ?? player.adpBySite?.ESPN ?? null,
          historicalGames: player.gamesPlayed2025 ?? 0,
          priorGames: priorWeeks.flatMap(previous => {
            const a = previous?.actual.value.get(sourceId);
            const p = previous?.projected.value.get(sourceId);
            return a && p && previous?.teams.has(teamKey(source.team ?? player.team ?? ''))
              ? [{ actual: sleeperFantasyPoints(a, scoring), projected: sleeperFantasyPoints(p, scoring), completed: true }] : [];
          }),
        },
      ) : 0;
      return { ...player, status: source.injury_status || player.status, postgameAdjustment: adjustment, postgameWeek: week };
    };
    return { ...payload, rankings: payload.rankings.map(enrich), teams: payload.teams.map(team => ({ ...team, roster: team.roster.map(enrich) })) };
  } catch {
    return payload;
  }
}
