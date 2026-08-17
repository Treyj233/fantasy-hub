import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packs = ["stadium", "broadcast", "playbook", "varsity", "championship", "gridiron", "neon-sunday", "retro", "glass", "carbon", "helmet", "trading-cards"];

test("all premium navigation packs are selectable, persisted, and styled", async () => {
  const [hub, styles, preferences] = await Promise.all([
    readFile(new URL("../app/FantasyHub.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/api/account/preferences/route.ts", import.meta.url), "utf8"),
  ]);
  for (const pack of packs) {
    assert.match(hub, new RegExp(`id: "${pack}"`));
    assert.match(styles, new RegExp(`data-badge-theme="${pack}"`));
    assert.match(preferences, new RegExp(`"${pack}"`));
  }
  assert.match(hub, /<details className="badge-theme-picker">/);
  assert.match(hub, /16 Pro looks/);
  assert.match(styles, /badge-theme-picker \.[^}]*badge-theme-grid|badge-theme-picker \.badge-theme-grid/);
});
