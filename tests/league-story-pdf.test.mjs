import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("League Stories share actions generate themed PDF files", async () => {
  const ui = await readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8");
  const generator = await readFile(new URL("../app/league-story-pdf.ts", import.meta.url), "utf8");
  assert.match(ui, /await import\("\.\/league-story-pdf"\)/);
  assert.match(ui, /navigator\.canShare\(\{ files: \[file\] \}\)/);
  assert.match(ui, /download = report\.fileName/);
  assert.match(generator, /getComputedStyle\(document\.documentElement\)/);
  assert.match(generator, /new jsPDF\(\{ orientation: "portrait", unit: "pt", format: "letter"/);
  assert.match(generator, /kind: LeagueStoryReportKind/);
  assert.match(generator, /"rivalry" \| "recap" \| "trade" \| "wrapped"/);
  assert.match(generator, /Generated \$\{new Date\(\)\.toLocaleDateString\(\)\} from observed/);
});
