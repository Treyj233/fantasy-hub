export type SeasonScheduleGame = {
  id: string;
  week: number;
  date: string;
  status: string;
  broadcast: string;
  venue: string;
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
    const requestInit = { next: { revalidate: 21600 } } as RequestInit & { next: { revalidate: number } };
    const response = await fetch(
      "https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv",
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
      return [{
        id: cells[column("game_id")] || `${season}-${cells[column("week")]}-${awayCode}-${homeCode}`,
        week: Number(cells[column("week")]),
        date,
        status: "Scheduled",
        broadcast: "",
        venue: cells[column("stadium")] || "",
        away: { abbreviation: awayCode, name: teamNames[awayCode] ?? awayCode },
        home: { abbreviation: homeCode, name: teamNames[homeCode] ?? homeCode },
      }];
    }).sort((a, b) => a.week - b.week || a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

const scheduleCache = new Map<number, Promise<SeasonScheduleGame[]>>();

export function loadNflSeasonSchedule(season: number) {
  const cached = scheduleCache.get(season);
  if (cached) return cached;
  const request = fetchSeasonSchedule(season);
  scheduleCache.set(season, request);
  return request;
}
