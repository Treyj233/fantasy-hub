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
      { week: number; offense: number | null; defense: number | null; special: number | null }[]
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
      profiles.set(key, {
        season,
        games: ordered.length,
        latestWeek: latest.week,
        latestPct: latest.offense ?? latest.defense ?? latest.special,
        averagePct: offensePct ?? defensePct ?? specialTeamsPct,
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
  Promise<Map<string, SnapProfile>>
>();

export function loadSnapProfiles(season: number) {
  const cached = snapProfileCache.get(season);
  if (cached) return cached;
  const request = fetchSnapProfiles(season);
  snapProfileCache.set(season, request);
  return request;
}

export const snapProfileFor = (profiles: Map<string, SnapProfile>, name: string) =>
  profiles.get(normalizeName(name)) ?? null;
