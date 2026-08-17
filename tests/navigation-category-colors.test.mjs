import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("home category badges use the five-color palette over a team-themed panel", async () => {
  const [hub, css] = await Promise.all([
    readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  for (const tone of ["blue", "red", "yellow", "green", "orange"]) {
    assert.match(hub, new RegExp(`category-${tone}`));
    assert.match(css, new RegExp(`nav-badge\\.category-${tone}`));
  }
  assert.match(css, /mobile-category-tray[^}]+var\(--brand-secondary-rgb\)[^}]+var\(--deep\)[^}]+var\(--green\)/);
});
