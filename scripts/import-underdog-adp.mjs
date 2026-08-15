import { readFile, writeFile } from "node:fs/promises";

const [halfPprPath, fullPprPath, superflexPath, outputPath] = process.argv.slice(2);
if (!halfPprPath || !fullPprPath || !superflexPath || !outputPath) {
  throw new Error("Usage: node scripts/import-underdog-adp.mjs <half-ppr.csv> <full-ppr.csv> <superflex.csv> <output.json>");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const playerKey = (name, position) =>
  `${name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b/g, "").replace(/[^a-z0-9]/g, "")}|${position.toUpperCase()}`;

async function loadFormat(path) {
  const [headers, ...rows] = parseCsv(await readFile(path, "utf8"));
  const column = Object.fromEntries(headers.map((header, index) => [header, index]));
  const entries = rows.flatMap((row) => {
    const firstName = row[column.firstName]?.trim();
    const lastName = row[column.lastName]?.trim();
    const position = row[column.slotName]?.trim().toUpperCase();
    const adp = Number(row[column.adp]);
    if (!firstName || !lastName || !["QB", "RB", "WR", "TE"].includes(position) || !Number.isFinite(adp) || adp <= 0 || adp >= 999) return [];
    return [[playerKey(`${firstName} ${lastName}`, position), adp]];
  });
  return Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b)));
}

const snapshot = {
  source: "Underdog Sports official rankings CSV exports",
  season: 2026,
  updatedAt: new Date().toISOString(),
  formats: {
    "Single-QB Half PPR": await loadFormat(halfPprPath),
    "Single-QB Full PPR": await loadFormat(fullPprPath),
    "Superflex Half PPR": await loadFormat(superflexPath),
  },
};

await writeFile(outputPath, `${JSON.stringify(snapshot)}\n`);
