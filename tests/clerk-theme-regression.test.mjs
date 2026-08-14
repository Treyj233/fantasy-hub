import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Clerk entry pages use a readable Chargers theme", async () => {
  const [theme, styles] = await Promise.all([
    readFile(new URL("../app/entry-theme.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(theme, /colorPrimary: "#0080c6"/);
  assert.match(theme, /backgroundColor: "#ffffff"/);
  assert.match(theme, /formFieldLabel: \{ color: "#001f47"/);
  assert.match(theme, /formFieldInput: \{ minHeight: "48px"/);
  assert.match(theme, /background: "linear-gradient\(135deg, #ffc20e, #ffd85a\)"/);
  assert.match(styles, /\.clerk-auth-shell\.chargers-entry-shell,\.chargers-entry-shell/);
  assert.match(styles, /linear-gradient\(145deg,#001f47 0,#004f91 48%,#0080c6 100%\)/);
});
