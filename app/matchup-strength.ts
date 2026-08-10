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
  position === "FB" ? "RB" : ["QB", "RB", "WR", "TE"].includes(position) ? position : null;

async function calculateSeason(season: number) {
  const response = await fetch(
    "https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats.csv",
    { next: { revalidate: 21600 } },
  );
  if (!response.ok) return null;
  const lines = (await response.text()).trim().split(/\r?\n/);
  const headers = csvRow(lines.shift() ?? "");
  const column = (name: string) => headers.indexOf(name);
  const totals = new Map<string, { points: number; weeks: Set<number> }>();
  for (const line of lines) {
    const cells = csvRow(line);
    if (Number(cells[column("season")]) !== season || cells[column("season_type")] !== "REG") continue;
    const team = cells[column("opponent_team")];
    const position = fantasyPosition(cells[column("position_group")] || cells[column("position")]);
    const week = Number(cells[column("week")]);
    if (!team || !position || !Number.isFinite(week)) continue;
    const key = `${position}:${team}`;
    const current = totals.get(key) ?? { points: 0, weeks: new Set<number>() };
    current.points += Number(cells[column("fantasy_points_ppr")]) || 0;
    current.weeks.add(week);
    totals.set(key, current);
  }
  if (!totals.size) return null;
  const positions: MatchupStrengthData["positions"] = {};
  for (const position of ["QB", "RB", "WR", "TE"]) {
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

const cache = new Map<number, Promise<MatchupStrengthData | null>>();
const seasonData = (season: number) => {
  const existing = cache.get(season);
  if (existing) return existing;
  const request = calculateSeason(season);
  cache.set(season, request);
  return request;
};

export async function loadMatchupStrengths(requestedSeason: number) {
  if (requestedSeason > 2025) {
    const current = await seasonData(requestedSeason);
    if (current) return current;
  }
  return (await seasonData(2025)) ?? {
    sourceSeason: 2025,
    updatedAt: new Date().toISOString(),
    positions: {},
  };
}
