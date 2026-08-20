import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("News & Notes removes team hashtag markers from displayed copy", async () => {
  const source = await readFile(new URL("../app/NewsAndNotes.tsx", import.meta.url), "utf8");
  assert.match(source, /const teamHashtag =/);
  assert.match(source, /Chiefs\|Colts\|Commanders/);
  assert.match(source, /cleanTeamHashtags\(item\.headline\)/);
  assert.match(source, /cleanTeamHashtags\(step\)/);
  assert.match(source, /IMPACTED PLAYERS/);
  assert.match(source, /onOpenPlayer\?\.\(player\)/);
  assert.match(source, /sourceCount/);
  assert.match(source, /filteredItems\.slice\(0, visibleCount\)/);
  assert.match(source, /setVisibleCount\(\(count\) => count \+ 10\)/);
  assert.match(source, /Show 10 older updates/);
  assert.doesNotMatch(source, /ResizeObserver|is-scrollable|news-feed-pane-height/);
  assert.match(source, /\["news", "Fantasy Pulse"\]/);
  assert.match(source, /\["performance", "Game highlights"\]/);
});

test("news feed uses one page scroll instead of a nested scroll pane", async () => {
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(styles, /\.news-feed\{display:grid;grid-auto-rows:max-content;align-content:start/);
  assert.match(styles, /\.news-feed-card\{[^}]*align-self:start;width:100%/);
  assert.match(styles, /\.news-load-more\{/);
  assert.doesNotMatch(styles, /\.news-feed\.is-scrollable|news-feed-pane-height/);
});
