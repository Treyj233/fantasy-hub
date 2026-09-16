import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import postcss from 'postcss';
const css=postcss.parse(readFileSync('app/experience-polish.css','utf8'));
const declarations=selector=>{
  const result={};
  css.walkRules(selector,r=>r.walkDecls(d=>{result[d.prop]=d.value;}));
  return result;
};
test('desktop league controls use available width without removing leagues',()=>{
  const grid=declarations('.league-switcher .league-pills');
  assert.equal(grid['grid-auto-flow'],'column');
  assert.equal(grid['grid-auto-columns'],'minmax(170px,1fr)');
  assert.equal(grid['grid-template-rows'],'repeat(2,minmax(0,1fr))');
  assert.equal(declarations('.league-switcher .league-pills button')['min-height'],'58px');
});
test('Vegas hero does not inherit the decorative 225px minimum',()=>{
  assert.equal(declarations('.vegas-edge-page .edge-intro.all-leagues-hero')['min-height'],'0');
});
test('dark review text uses a readable foreground instead of the primary background color',()=>{
  let found=false;
  css.walkRules(r=>{if(r.selector.includes('html[data-theme="dark"] .team-review-page :is(.review-heading')) {
    r.walkDecls('color',d=>{found=d.value.includes('--text-accent-safe')&&d.important;});
  }});
  assert.ok(found);
});
test('long rankings defer paint without removing rows from the document',()=>{
  let found=false;
  css.walkRules(r=>{if(r.selector.includes('.ranking-tier-list button.ranking-detail-row')) {
    r.walkDecls('content-visibility',d=>{found=d.value==='auto';});
  }});
  assert.ok(found);
});
test('viewport allows users to zoom',()=>{
  const source=readFileSync('app/layout.tsx','utf8');
  assert.doesNotMatch(source,/userScalable:\s*false|maximumScale:\s*1/);
});
test('Vegas no longer advertises owner-only preview',()=>{
  assert.doesNotMatch(readFileSync('app/VegasEdge.tsx','utf8'),/OWNER PREVIEW/);
});
