export type MatchupStrength = {
  team: string;
  position: string;
  rank: number;
  pointsAllowed: number;
  games: number;
  score: number;
  label: "Great" | "Favorable" | "Neutral" | "Tough" | "Avoid";
};

export type MatchupStrengthData = {
  sourceSeason: number;
  updatedAt: string;
  positions: Record<string, Record<string, MatchupStrength>>;
};

const csvRow = (line: string) => {
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
};

const fantasyPosition = (position: string) =>
  position === "FB" ? "RB" : ["QB", "RB", "WR", "TE", "K"].includes(position) ? position : null;

const normalizeTeam = (team: string) =>
  ({ JAC: "JAX", WSH: "WAS", LA: "LAR" })[team] ?? team;

async function calculateSeason(season: number) {
  const totals = new Map<string, { points: number; weeks: Set<number> }>();
  const addTotal = (position: string, team: string, week: number, points: number) => {
    const key = `${position}:${team}`;
    const current = totals.get(key) ?? { points: 0, weeks: new Set<number>() };
    current.points += points;
    current.weeks.add(week);
    totals.set(key, current);
  };
  const [playerResponse, teamResponse] = await Promise.all([
    fetch(
      `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv`,
      { next: { revalidate: 21600 } },
    ).catch(() => null),
    fetch(
      `https://github.com/nflverse/nflverse-data/releases/download/stats_team/stats_team_week_${season}.csv`,
      { next: { revalidate: 21600 } },
    ).catch(() => null),
  ]);

  if (playerResponse?.ok) {
    const lines = (await playerResponse.text()).trim().split(/\r?\n/);
    const headers = csvRow(lines.shift() ?? "");
    const column = (name: string) => headers.indexOf(name);
    const value = (cells: string[], name: string) => Number(cells[column(name)]) || 0;
    for (const line of lines) {
      const cells = csvRow(line);
      if (Number(cells[column("season")]) !== season || cells[column("season_type")] !== "REG") continue;
      const team = normalizeTeam(cells[column("opponent_team")]);
      const listedPosition = cells[column("position")];
      const position = fantasyPosition(listedPosition === "K" ? listedPosition : cells[column("position_group")] || listedPosition);
      const week = Number(cells[column("week")]);
      if (!team || !position || !Number.isFinite(week)) continue;
      const points = position === "K"
        ? (value(cells, "fg_made_0_19") + value(cells, "fg_made_20_29") + value(cells, "fg_made_30_39")) * 3
          + value(cells, "fg_made_40_49") * 4
          + (value(cells, "fg_made_50_59") + value(cells, "fg_made_60_")) * 5
          + value(cells, "pat_made")
        : value(cells, "fantasy_points_ppr");
      addTotal(position, team, week, points);
    }
  }

  if (teamResponse?.ok) {
    const lines = (await teamResponse.text()).trim().split(/\r?\n/);
    const headers = csvRow(lines.shift() ?? "");
    const column = (name: string) => headers.indexOf(name);
    const value = (cells: string[], name: string) => Number(cells[column(name)]) || 0;
    const rows = lines.map(csvRow).filter((cells) =>
      Number(cells[column("season")]) === season && cells[column("season_type")] === "REG",
    );
    const rowByGameAndTeam = new Map(rows.map((cells) => [
      `${cells[column("game_id")]}:${normalizeTeam(cells[column("team")])}`,
      cells,
    ]));
    const pointsAllowedScore = (points: number) =>
      points === 0 ? 10 : points <= 6 ? 7 : points <= 13 ? 4 : points <= 20 ? 1 : points <= 27 ? 0 : points <= 34 ? -1 : -4;

    for (const cells of rows) {
      const offense = normalizeTeam(cells[column("team")]);
      const defense = normalizeTeam(cells[column("opponent_team")]);
      const week = Number(cells[column("week")]);
      if (!offense || !defense || !Number.isFinite(week)) continue;
      const defenseRow = rowByGameAndTeam.get(`${cells[column("game_id")]}:${defense}`);
      const offensePoints =
        (value(cells, "passing_tds") + value(cells, "rushing_tds") + value(cells, "special_teams_tds")) * 6
        + value(cells, "fg_made") * 3
        + value(cells, "pat_made")
        + (value(cells, "passing_2pt_conversions") + value(cells, "rushing_2pt_conversions")) * 2;
      const defensePoints =
        value(cells, "sacks_suffered")
        + (value(cells, "passing_interceptions") + value(cells, "fumbles_lost_total")) * 2
        + pointsAllowedScore(offensePoints)
        + (defenseRow ? (value(defenseRow, "def_tds") + value(defenseRow, "special_teams_tds")) * 6 : 0)
        + (defenseRow ? value(defenseRow, "def_safeties") * 2 : 0)
        + (defenseRow ? (value(defenseRow, "def_punt_blocks") + value(defenseRow, "def_fg_blocks")) * 2 : 0);
      addTotal("DEF", offense, week, defensePoints);
    }
  }
  if (!totals.size) return null;
  const positions: MatchupStrengthData["positions"] = {};
  for (const position of ["QB", "RB", "WR", "TE", "K", "DEF"]) {
    const teams = [...totals.entries()]
      .filter(([key]) => key.startsWith(`${position}:`))
      .map(([key, total]) => ({
        team: key.split(":")[1],
        pointsAllowed: total.points / Math.max(1, total.weeks.size),
        games: total.weeks.size,
      }))
      .sort((a, b) => b.pointsAllowed - a.pointsAllowed);
    positions[position] = Object.fromEntries(
      teams.map((team, index) => {
        const score = teams.length > 1 ? Math.round(100 - (index / (teams.length - 1)) * 100) : 50;
        const label = score >= 80 ? "Great" : score >= 62 ? "Favorable" : score >= 39 ? "Neutral" : score >= 20 ? "Tough" : "Avoid";
        return [team.team, { ...team, position, rank: index + 1, score, label }];
      }),
    );
  }
  return { sourceSeason: season, updatedAt: new Date().toISOString(), positions };
}

const cache = new Map<number, { expiresAt: number; request: Promise<MatchupStrengthData | null> }>();
const seasonData = (season: number) => {
  const existing = cache.get(season);
  if (existing && existing.expiresAt > Date.now()) return existing.request;
  const request = calculateSeason(season);
  cache.set(season, { expiresAt: Date.now() + 24 * 60 * 60 * 1000, request });
  return request;
};

export async function loadMatchupStrengths(requestedSeason: number, currentWeek = 1) {
  // Week 1 intentionally uses the completed prior season as its baseline. Once
  // the league advances to Week 2, opponent grades are exclusively current-year.
  if (requestedSeason > 2025 && currentWeek >= 2) {
    const current = await seasonData(requestedSeason);
    if (current) return current;
  }
  const priorSeason = Math.max(2024, requestedSeason - 1);
  return (await seasonData(priorSeason)) ?? (await seasonData(priorSeason - 1)) ?? {
    sourceSeason: priorSeason - 1,
    updatedAt: new Date().toISOString(),
    positions: {},
  };
}
