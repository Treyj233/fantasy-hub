import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('report keeps minimum iPhone clearances and confines scrolling to its body',()=>{
  const css=readFileSync(new URL('../app/team-review.css',import.meta.url),'utf8');
  assert.match(css,/--report-safe-top:max\(72px,/);
  assert.match(css,/--report-safe-bottom:max\(32px,/);
  assert.match(css,/max-height:calc\(100svh - var\(--report-safe-top\) - var\(--report-safe-bottom\)\)/);
  assert.match(css,/review-report-dialog\[open\]>\.review-report-body\{flex:1 1 auto;min-height:0;overflow-y:auto/);
});
