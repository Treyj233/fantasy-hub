export type PlayerSeasonProfile = {
  games: number;
  fantasyPoints: number;
  receptions: number;
  team: string | null;
};

export type TeamOffenseProfile = {
  rank: number;
  games: number;
  pointsPerGame: number;
};

const normalizeName = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .replace(/(jr|sr|ii|iii|iv)$/, "");

function csvRow(line: string) {
  const cells: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && line[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) {
      cells.push(value);
      value = "";
    } else value += character;
  }
  cells.push(value);
  return cells;
}

async function fetchPlayerSeason(season: number) {
  try {
    const response = await fetch(
      `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv`,
      { next: { revalidate: 21600 } },
    );
    if (!response.ok) return new Map<string, PlayerSeasonProfile>();
    const lines = (await response.text()).trim().split(/\r?\n/);
    const headers = csvRow(lines.shift() ?? "");
    const column = (name: string) => headers.indexOf(name);
    const profiles = new Map<string, PlayerSeasonProfile>();
    lines.forEach((line) => {
      const cells = csvRow(line);
      if (
        Number(cells[column("season")]) !== season ||
        cells[column("season_type")] !== "REG"
      )
        return;
      const name = cells[column("player_display_name")];
      if (!name) return;
      const key = normalizeName(name);
      const existing = profiles.get(key) ?? {
        games: 0,
        fantasyPoints: 0,
        receptions: 0,
        team: null,
      };
      profiles.set(key, {
        games: existing.games + 1,
        fantasyPoints:
          existing.fantasyPoints +
          (Number(cells[column("fantasy_points")]) || 0),
        receptions:
          existing.receptions + (Number(cells[column("receptions")]) || 0),
        team:
          cells[column("team")] ||
          cells[column("recent_team")] ||
          existing.team,
      });
    });
    return profiles;
  } catch {
    return new Map<string, PlayerSeasonProfile>();
  }
}

async function fetchTeamOffense(season: number) {
  try {
    const response = await fetch(
      "https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv",
      { next: { revalidate: 21600 } },
    );
    if (!response.ok) return new Map<string, TeamOffenseProfile>();
    const lines = (await response.text()).trim().split(/\r?\n/);
    const headers = csvRow(lines.shift() ?? "");
    const column = (name: string) => headers.indexOf(name);
    const totals = new Map<string, { games: number; points: number }>();
    const add = (team: string, score: number) => {
      if (!team || !Number.isFinite(score)) return;
      const current = totals.get(team) ?? { games: 0, points: 0 };
      totals.set(team, { games: current.games + 1, points: current.points + score });
    };
    lines.forEach((line) => {
      const cells = csvRow(line);
      if (
        Number(cells[column("season")]) !== season ||
        cells[column("game_type")] !== "REG"
      )
        return;
      const awayScore = Number(cells[column("away_score")]);
      const homeScore = Number(cells[column("home_score")]);
      if (!Number.isFinite(awayScore) || !Number.isFinite(homeScore)) return;
      add(cells[column("away_team")], awayScore);
      add(cells[column("home_team")], homeScore);
    });
    const ordered = [...totals.entries()]
      .map(([team, total]) => ({
        team,
        ...total,
        pointsPerGame: total.points / total.games,
      }))
      .sort((a, b) => b.pointsPerGame - a.pointsPerGame);
    return new Map(
      ordered.map((team, index) => [
        team.team,
        {
          rank: index + 1,
          games: team.games,
          pointsPerGame: Number(team.pointsPerGame.toFixed(1)),
        },
      ]),
    );
  } catch {
    return new Map<string, TeamOffenseProfile>();
  }
}

const playerCache = new Map<number, Promise<Map<string, PlayerSeasonProfile>>>();
const offenseCache = new Map<number, Promise<Map<string, TeamOffenseProfile>>>();

export function loadPlayerSeasonProfiles(season: number) {
  const cached = playerCache.get(season);
  if (cached) return cached;
  const request = fetchPlayerSeason(season);
  playerCache.set(season, request);
  return request;
}

export function loadTeamOffenseProfiles(season: number) {
  const cached = offenseCache.get(season);
  if (cached) return cached;
  const request = fetchTeamOffense(season);
  offenseCache.set(season, request);
  return request;
}

export const playerSeasonProfileFor = (
  profiles: Map<string, PlayerSeasonProfile>,
  name: string,
) => profiles.get(normalizeName(name)) ?? null;
