import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {remainingPlayerProjection, whatDoINeed} from "../app/game-day-model.mjs";

test("finished underperformers have no remaining production or win-path target",()=>{
  const finished={id:"done",position:"WR",points:4,projection:25,gameProgress:1};
  const active={id:"active",position:"RB",points:12,projection:20,gameProgress:.5};
  assert.equal(remainingPlayerProjection(finished),0);
  const path=whatDoINeed({yourPoints:16,opponentPoints:30,players:[finished,active]});
  assert.deepEqual(path.targets.map(p=>p.id),["active"]);
  assert.equal(path.targets[0].pointsNeeded,path.teamNeed);
  assert.equal(whatDoINeed({yourPoints:4,opponentPoints:30,players:[finished]}).targets.length,0);
});

test("live players retain opportunity after beating their original forecast",()=>{
  const player={id:"live",points:26,projection:20,gameProgress:.75};
  assert.equal(remainingPlayerProjection(player),5);
  assert.equal(whatDoINeed({yourPoints:26,opponentPoints:35,players:[player]}).targets.length,1);
  assert.equal(remainingPlayerProjection({...player,gameProgress:1}),0);
});

test("desktop live win paths show up to ten players while mobile remains compact", async () => {
  const [component, styles] = await Promise.all([
    readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(component, /need\.targets\.slice\(0, 10\)/);
  assert.match(styles, /\.need-expanded-content>article:nth-of-type\(n\+7\)\{display:none\}/);
});
