export type SnapProfile = {
  season: number;
  games: number;
  latestWeek: number;
  latestPct: number | null;
  averagePct: number | null;
  offensePct: number | null;
  defensePct: number | null;
  specialTeamsPct: number | null;
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

function percentage(value?: string) {
  if (!value) return null;
  const parsed = Number(value.replace("%", ""));
  if (!Number.isFinite(parsed)) return null;
  return parsed <= 1 ? parsed * 100 : parsed;
}

async function fetchSnapProfiles(season: number) {
  try {
    const response = await fetch(
      `https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_${season}.csv`,
      { next: { revalidate: 21600 } },
    );
    if (!response.ok) return new Map<string, SnapProfile>();
    const lines = (await response.text()).trim().split(/\r?\n/);
    const headers = csvRow(lines.shift() ?? "");
    const column = (name: string) => headers.indexOf(name);
    const grouped = new Map<
      string,
      { week: number; offense: number | null; defense: number | null; special: number | null; offenseSnaps: number; defenseSnaps: number; specialSnaps: number }[]
    >();
    lines.forEach((line) => {
      const cells = csvRow(line);
      const name = cells[column("player")];
      if (!name) return;
      const record = {
        week: Number(cells[column("week")]) || 0,
        offense: percentage(cells[column("offense_pct")]),
        defense: percentage(cells[column("defense_pct")]),
        special: percentage(cells[column("st_pct")]),
        offenseSnaps: Number(cells[column("offense_snaps")]) || 0,
        defenseSnaps: Number(cells[column("defense_snaps")]) || 0,
        specialSnaps: Number(cells[column("st_snaps")]) || 0,
      };
      const key = normalizeName(name);
      grouped.set(key, [...(grouped.get(key) ?? []), record]);
    });
    const profiles = new Map<string, SnapProfile>();
    grouped.forEach((games, key) => {
      const ordered = games.sort((a, b) => a.week - b.week);
      const latest = ordered[ordered.length - 1];
      const average = (field: "offense" | "defense" | "special") => {
        const values = ordered.flatMap((game) =>
          typeof game[field] === "number" ? [game[field]] : [],
        );
        return values.length
          ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1))
          : null;
      };
      const offensePct = average("offense");
      const defensePct = average("defense");
      const specialTeamsPct = average("special");
      const weightedPercentage = (
        pctField: "offense" | "defense" | "special",
        snapField: "offenseSnaps" | "defenseSnaps" | "specialSnaps",
      ) => {
        const usable = ordered.filter(
          (game) =>
            typeof game[pctField] === "number" &&
            game[pctField]! > 0 &&
            game[snapField] > 0,
        );
        const playerSnaps = usable.reduce((sum, game) => sum + game[snapField], 0);
        const unitSnaps = usable.reduce(
          (sum, game) => sum + game[snapField] / (game[pctField]! / 100),
          0,
        );
        return unitSnaps > 0 ? Number(((playerSnaps / unitSnaps) * 100).toFixed(1)) : null;
      };
      const seasonPct =
        weightedPercentage("offense", "offenseSnaps") ??
        weightedPercentage("defense", "defenseSnaps") ??
        weightedPercentage("special", "specialSnaps");
      profiles.set(key, {
        season,
        games: ordered.length,
        latestWeek: latest.week,
        latestPct: latest.offense ?? latest.defense ?? latest.special,
        averagePct: seasonPct ?? offensePct ?? defensePct ?? specialTeamsPct,
        offensePct,
        defensePct,
        specialTeamsPct,
      });
    });
    return profiles;
  } catch {
    return new Map<string, SnapProfile>();
  }
}

const snapProfileCache = new Map<
  number,
  { expiresAt: number; request: Promise<Map<string, SnapProfile>> }
>();

export function loadSnapProfiles(season: number) {
  const cached = snapProfileCache.get(season);
  if (cached && cached.expiresAt > Date.now()) return cached.request;
  const request = fetchSnapProfiles(season);
  snapProfileCache.set(season, { expiresAt: Date.now() + 24 * 60 * 60 * 1000, request });
  return request;
}

export async function loadCurrentSnapProfiles(currentSeason: number, currentWeek: number) {
  if (currentWeek >= 2) {
    const current = await loadSnapProfiles(currentSeason);
    if (current.size) return current;
  }
  return loadSnapProfiles(currentSeason - 1);
}

export const snapProfileFor = (profiles: Map<string, SnapProfile>, name: string) =>
  profiles.get(normalizeName(name)) ?? null;
