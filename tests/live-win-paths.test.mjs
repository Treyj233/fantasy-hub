import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("desktop live win paths show up to ten players while mobile remains compact", async () => {
  const [component, styles] = await Promise.all([
    readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(component, /need\.targets\.slice\(0, 10\)/);
  assert.match(styles, /\.need-expanded-content>article:nth-of-type\(n\+7\)\{display:none\}/);
});
