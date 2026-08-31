export type PlayerSeasonProfile = {
  games: number;
  fantasyPoints: number;
  receptions: number;
  targets: number;
  receivingYards: number;
  receivingTouchdowns: number;
  rushingAttempts: number;
  rushingYards: number;
  rushingTouchdowns: number;
  passingAttempts: number;
  passingYards: number;
  passingTouchdowns: number;
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
        targets: 0,
        receivingYards: 0,
        receivingTouchdowns: 0,
        rushingAttempts: 0,
        rushingYards: 0,
        rushingTouchdowns: 0,
        passingAttempts: 0,
        passingYards: 0,
        passingTouchdowns: 0,
        team: null,
      };
      profiles.set(key, {
        games: existing.games + 1,
        fantasyPoints:
          existing.fantasyPoints +
          (Number(cells[column("fantasy_points")]) || 0),
        receptions:
          existing.receptions + (Number(cells[column("receptions")]) || 0),
        targets: existing.targets + (Number(cells[column("targets")]) || 0),
        receivingYards: existing.receivingYards + (Number(cells[column("receiving_yards")]) || 0),
        receivingTouchdowns: existing.receivingTouchdowns + (Number(cells[column("receiving_tds")]) || 0),
        rushingAttempts: existing.rushingAttempts + (Number(cells[column("carries")]) || 0),
        rushingYards: existing.rushingYards + (Number(cells[column("rushing_yards")]) || 0),
        rushingTouchdowns: existing.rushingTouchdowns + (Number(cells[column("rushing_tds")]) || 0),
        passingAttempts: existing.passingAttempts + (Number(cells[column("attempts")]) || 0),
        passingYards: existing.passingYards + (Number(cells[column("passing_yards")]) || 0),
        passingTouchdowns: existing.passingTouchdowns + (Number(cells[column("passing_tds")]) || 0),
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

const playerCache = new Map<number, { expiresAt: number; request: Promise<Map<string, PlayerSeasonProfile>> }>();
const offenseCache = new Map<number, { expiresAt: number; request: Promise<Map<string, TeamOffenseProfile>> }>();

export function loadPlayerSeasonProfiles(season: number) {
  const cached = playerCache.get(season);
  if (cached && cached.expiresAt > Date.now()) return cached.request;
  const request = fetchPlayerSeason(season);
  playerCache.set(season, { expiresAt: Date.now() + 24 * 60 * 60 * 1000, request });
  return request;
}

export function loadTeamOffenseProfiles(season: number) {
  const cached = offenseCache.get(season);
  if (cached && cached.expiresAt > Date.now()) return cached.request;
  const request = fetchTeamOffense(season);
  offenseCache.set(season, { expiresAt: Date.now() + 24 * 60 * 60 * 1000, request });
  return request;
}

export async function loadBlendedPlayerSeasonProfiles(currentSeason: number, currentWeek: number) {
  const previousSeason = currentSeason - 1;
  const [current, previous] = await Promise.all([
    loadPlayerSeasonProfiles(currentSeason),
    loadPlayerSeasonProfiles(previousSeason),
  ]);
  if (!current.size) return { profiles: previous, currentProfiles: current, sourceSeason: previousSeason, blended: false };
  const weight = Math.min(1, Math.max(.25, (currentWeek - 1) / 4));
  if (weight >= 1) return { profiles: current, currentProfiles: current, sourceSeason: currentSeason, blended: false };
  const profiles = new Map(previous);
  current.forEach((latest, key) => {
    const prior = previous.get(key);
    if (!prior) return void profiles.set(key, latest);
    const latestPpg = latest.games ? latest.fantasyPoints / latest.games : 0;
    const priorPpg = prior.games ? prior.fantasyPoints / prior.games : latestPpg;
    const latestReceptions = latest.games ? latest.receptions / latest.games : 0;
    const priorReceptions = prior.games ? prior.receptions / prior.games : latestReceptions;
    const blendTotal = (latestValue: number, priorValue: number) =>
      ((latest.games ? latestValue / latest.games : 0) * weight + (prior.games ? priorValue / prior.games : latest.games ? latestValue / latest.games : 0) * (1 - weight)) * latest.games;
    profiles.set(key, {
      games: latest.games,
      fantasyPoints: (latestPpg * weight + priorPpg * (1 - weight)) * latest.games,
      receptions: (latestReceptions * weight + priorReceptions * (1 - weight)) * latest.games,
      targets: blendTotal(latest.targets, prior.targets),
      receivingYards: blendTotal(latest.receivingYards, prior.receivingYards),
      receivingTouchdowns: blendTotal(latest.receivingTouchdowns, prior.receivingTouchdowns),
      rushingAttempts: blendTotal(latest.rushingAttempts, prior.rushingAttempts),
      rushingYards: blendTotal(latest.rushingYards, prior.rushingYards),
      rushingTouchdowns: blendTotal(latest.rushingTouchdowns, prior.rushingTouchdowns),
      passingAttempts: blendTotal(latest.passingAttempts, prior.passingAttempts),
      passingYards: blendTotal(latest.passingYards, prior.passingYards),
      passingTouchdowns: blendTotal(latest.passingTouchdowns, prior.passingTouchdowns),
      team: latest.team ?? prior.team,
    });
  });
  return { profiles, currentProfiles: current, sourceSeason: currentSeason, blended: true };
}

export async function loadBlendedTeamOffenseProfiles(currentSeason: number, currentWeek: number) {
  const previousSeason = currentSeason - 1;
  const [current, previous] = await Promise.all([
    loadTeamOffenseProfiles(currentSeason),
    loadTeamOffenseProfiles(previousSeason),
  ]);
  if (!current.size) return { profiles: previous, sourceSeason: previousSeason, blended: false };
  const weight = Math.min(1, Math.max(.25, (currentWeek - 1) / 4));
  const values = new Map<string, TeamOffenseProfile>();
  new Set([...previous.keys(), ...current.keys()]).forEach((team) => {
    const latest = current.get(team);
    const prior = previous.get(team);
    if (!latest && prior) return void values.set(team, prior);
    if (!latest) return;
    values.set(team, {
      rank: 0,
      games: latest.games,
      pointsPerGame: Number((latest.pointsPerGame * weight + (prior?.pointsPerGame ?? latest.pointsPerGame) * (1 - weight)).toFixed(1)),
    });
  });
  [...values.entries()].sort((a, b) => b[1].pointsPerGame - a[1].pointsPerGame).forEach(([team, profile], index) => values.set(team, { ...profile, rank: index + 1 }));
  return { profiles: values, sourceSeason: currentSeason, blended: weight < 1 };
}

export const playerSeasonProfileFor = (
  profiles: Map<string, PlayerSeasonProfile>,
  name: string,
) => profiles.get(normalizeName(name)) ?? null;
