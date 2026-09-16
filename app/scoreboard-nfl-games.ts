import { loadNflSeasonSchedule } from './nfl-schedule-data';
import { fetchCachedUpstream } from './api/upstream-cache';
import { kickoffState } from './kickoff-status.mjs';
import type { NflDataGame } from './highlightly-nfl';

type Competitor = { homeAway?: string; team?: { abbreviation?: string }; score?: string; winner?: boolean };
type Event = { date?: string; season?: { year?: number; type?: number }; week?: { number?: number }; competitions?: { competitors?: Competitor[] }[];
  status?: { period?: number; displayClock?: string; type?: { completed?: boolean; state?: string; description?: string } } };

// Independent of Highlightly. ESPN supplies clocks/finals; the schedule triggers kickoff.
export async function getScoreboardNflGames({ season, week }: { season: number; week: number; cacheSeconds?: number }): Promise<NflDataGame[]> {
  const [schedule, events] = await Promise.all([
    loadNflSeasonSchedule(season),
    fetchCachedUpstream(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}&seasontype=2&week=${week}`, 15,
      { signal: AbortSignal.timeout(3000) }).then(async response => response.ok ? ((await response.json()) as { events?: Event[] }).events ?? [] : []).catch(() => [] as Event[]),
  ]);
  const normalize = (team: string) => ({ JAC: 'JAX', WSH: 'WAS', LA: 'LAR' }[team] ?? team);
  const games = schedule.filter(game => game.week === week).map(game => {
    const event = events.find(item => item.season?.year === season && item.season?.type === 2 && item.week?.number === week &&
      item.competitions?.[0]?.competitors?.some(team => team.homeAway === 'home' && normalize(team.team?.abbreviation ?? '') === game.home.abbreviation) &&
      item.competitions?.[0]?.competitors?.some(team => team.homeAway === 'away' && normalize(team.team?.abbreviation ?? '') === game.away.abbreviation));
    const status = event?.status;
    const date = event?.date ?? game.date;
    const state = kickoffState({ date, state: game.status === 'Final' || status?.type?.completed ? 'post' : status?.type?.state, status: status?.type?.description ?? game.status });
    const team = (side: 'away' | 'home') => {
      const competitor = event?.competitions?.[0]?.competitors?.find(item => item.homeAway === side);
      return { ...game[side], id: game[side].abbreviation, displayName: game[side].name, score: Number(competitor?.score ?? game[`${side}Score`] ?? 0), winner: competitor?.winner === true };
    };
    return { id: game.id, date, round: String(week), season, state, status: state === 'post' ? 'Final' : state === 'in' && status?.type?.state !== 'in' ? 'Live' : status?.type?.description ?? game.status,
      period: Number(status?.period ?? 0), clock: status?.displayClock ?? '', away: team('away'), home: team('home'), venue: null, forecast: null };
  });
  return games;
}
