import { scheduleResultStatus } from './schedule-result-status.mjs';

export type GameLines = {
  total: number | null;
  homeFavoredBy: number | null;
  awayMoneyline: number | null;
  homeMoneyline: number | null;
};
export type SeasonScheduleGame = {
  gameLines: GameLines;
  id: string;
  week: number;
  date: string;
  status: string;
  broadcast: string;
  venue: string;
  awayScore: number | null;
  homeScore: number | null;
  away: { abbreviation: string; name: string };
  home: { abbreviation: string; name: string };
};

const teamNames: Record<string, string> = {
  ARI: "Cardinals", ATL: "Falcons", BAL: "Ravens", BUF: "Bills",
  CAR: "Panthers", CHI: "Bears", CIN: "Bengals", CLE: "Browns",
  DAL: "Cowboys", DEN: "Broncos", DET: "Lions", GB: "Packers",
  HOU: "Texans", IND: "Colts", JAX: "Jaguars", KC: "Chiefs",
  LAC: "Chargers", LAR: "Rams", LV: "Raiders", MIA: "Dolphins",
  MIN: "Vikings", NE: "Patriots", NO: "Saints", NYG: "Giants",
  NYJ: "Jets", PHI: "Eagles", PIT: "Steelers", SEA: "Seahawks",
  SF: "49ers", TB: "Buccaneers", TEN: "Titans", WAS: "Commanders",
};

const normalizeTeam = (team: string) =>
  ({ JAC: "JAX", WSH: "WAS", LA: "LAR" })[team] ?? team;

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

async function fetchSeasonSchedule(season: number) {
  try {
    const requestInit = { next: { revalidate: 300 } } as RequestInit & { next: { revalidate: number } };
    const response = await fetch(
      "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv",
      requestInit,
    );
    if (!response.ok) return [];
    const lines = (await response.text()).trim().split(/\r?\n/);
    const headers = csvRow(lines.shift() ?? "");
    const column = (name: string) => headers.indexOf(name);
    return lines.flatMap((line): SeasonScheduleGame[] => {
      const cells = csvRow(line);
      if (
        Number(cells[column("season")]) !== season ||
        cells[column("game_type")] !== "REG"
      ) return [];
      const awayCode = normalizeTeam(cells[column("away_team")]);
      const homeCode = normalizeTeam(cells[column("home_team")]);
      const gameday = cells[column("gameday")];
      const gametime = cells[column("gametime")] || "12:00";
      const date = new Date(`${gameday}T${gametime}:00-04:00`).toISOString();
      const score = (columnName: string) => {
        const raw = cells[column(columnName)];
        const value = Number(raw);
        return raw !== "" && Number.isFinite(value) ? value : null;
      };
      const awayScore = score("away_score");
      const homeScore = score("home_score");
      return [{
        gameLines: { total: score("total_line"), homeFavoredBy: score("spread_line"), awayMoneyline: score("away_moneyline"), homeMoneyline: score("home_moneyline") },
        id: cells[column("game_id")] || `${season}-${cells[column("week")]}-${awayCode}-${homeCode}`,
        week: Number(cells[column("week")]),
        date,
        status: scheduleResultStatus(awayScore, homeScore),
        broadcast: "",
        venue: cells[column("stadium")] || "",
        awayScore,
        homeScore,
        away: { abbreviation: awayCode, name: teamNames[awayCode] ?? awayCode },
        home: { abbreviation: homeCode, name: teamNames[homeCode] ?? homeCode },
      }];
    }).sort((a, b) => a.week - b.week || a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

const scheduleCache = new Map<number, { expiresAt: number; request: Promise<SeasonScheduleGame[]> }>();

export function loadNflSeasonSchedule(season: number) {
  const cached = scheduleCache.get(season);
  if (cached && cached.expiresAt > Date.now()) return cached.request;
  const request = fetchSeasonSchedule(season);
  scheduleCache.set(season, { expiresAt: Date.now() + 300_000, request });
  return request;
}
