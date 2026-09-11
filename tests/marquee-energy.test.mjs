import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
test('league names no longer mount animation observers or duplicate copies', () => {
  const source = readFileSync(new URL('../app/ScrollingLeagueName.tsx', import.meta.url), 'utf8');
  assert.match(source, /data-overflow-label/);
  assert.doesNotMatch(source, /animate|useEffect|ResizeObserver|aria-hidden/);
});
