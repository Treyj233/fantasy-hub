import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("News & Notes removes team hashtag markers from displayed copy", async () => {
  const source = await readFile(new URL("../app/NewsAndNotes.tsx", import.meta.url), "utf8");
  assert.match(source, /const teamHashtag =/);
  assert.match(source, /Chiefs\|Colts\|Commanders/);
  assert.match(source, /cleanTeamHashtags\(item\.headline\)/);
  assert.match(source, /cleanTeamHashtags\(step\)/);
  assert.match(source, /PLAYERS IN THIS UPDATE/);
  assert.match(source, /onOpenPlayer\?\.\(player\)/);
  assert.match(source, /sourceCount/);
  assert.match(source, /visibleItems\.length > 10/);
  assert.match(source, /ResizeObserver\(sizePane\)/);
  assert.match(source, /\["news", "Fantasy Pulse"\]/);
  assert.match(source, /\["performance", "Game highlights"\]/);
});
