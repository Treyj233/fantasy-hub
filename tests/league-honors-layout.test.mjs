import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import postcss from 'postcss';

test('efficiency and ladder use themed cards with separate mobile score positions', () => {
  const css = postcss.parse(readFileSync('app/league-weekly-report.css', 'utf8'));
  const rules = new Map();
  css.walkRules(rule => {
    const values = rules.get(rule.selector) || {};
    rule.walkDecls(d => { values[d.prop] = d.value; });
    rules.set(rule.selector, values);
  });
  const cards = rules.get('.lw-report .lw-analysis :is(.lw-efficiencies,.lw-standings)>article');
  assert.equal(cards['border-radius'], '12px');
  assert.equal(cards.background, 'var(--chalk)');
  assert.equal(cards.border, '1px solid var(--line)');
  assert.equal(rules.get('.lw-report .lw-analysis .lw-standing-points:nth-child(4)')['grid-column'], '2/4');
  assert.equal(rules.get('.lw-report .lw-analysis .lw-standing-points:nth-child(5)')['grid-column'], '4');
});

test('honors cards stretch to equal row heights without truncating details', () => {
  const css = postcss.parse(readFileSync('app/league-weekly-report.css', 'utf8'));
  const declarations = selector => {
    const values = {};
    css.walkRules(selector, rule => rule.walkDecls(d => { values[d.prop] = d.value; }));
    return values;
  };
  const grid = declarations('.lw-report .lw-honors');
  assert.equal(grid['grid-auto-rows'], '1fr');
  assert.equal(grid['align-items'], 'stretch');
  const card = declarations('.lw-report .lw-honors article');
  assert.equal(card['align-content'], 'start');
  assert.equal(card['min-width'], '0');
  assert.equal(declarations('.lw-report .lw-honors :is(header span,h4,p)')['overflow-wrap'], 'anywhere');
});
