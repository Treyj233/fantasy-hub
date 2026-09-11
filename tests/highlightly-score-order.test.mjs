import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

const source = readFileSync(new URL("../app/highlightly-nfl.ts", import.meta.url), "utf8");
const functions = source.slice(source.indexOf("const normalizeTeam ="), source.indexOf("export async function getNflGames"));
const normalize = new Function(`${stripTypeScriptTypes(functions)}; return normalizeMatch;`)();
const fixture = (score, status = "Final") => ({
  id: 1, homeTeam: { id: 2, abbreviation: "SEA", name: "Seahawks" },
  awayTeam: { id: 3, abbreviation: "NE", name: "Patriots" },
  state: { description: status, score: { current: score } },
});

test("home–away score order preserves Seattle 13, New England 10", () => {
  const game = normalize(fixture("13 - 10"));
  assert.equal(game.home.score, 13);
  assert.equal(game.away.score, 10);
  assert.equal(game.home.winner, true);
  assert.equal(game.away.winner, false);
});
test("away wins, ties and live games retain correct winner flags", () => {
  assert.equal(normalize(fixture("10 - 17")).away.winner, true);
  for (const game of [normalize(fixture("10 - 10")), normalize(fixture("13 - 10", "In progress"))]) {
    assert.equal(game.home.winner, false);
    assert.equal(game.away.winner, false);
  }
});
