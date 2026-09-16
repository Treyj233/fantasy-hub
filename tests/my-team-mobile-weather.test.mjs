import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import postcss from 'postcss';

test('mobile My Team matchup uses the full row and wraps complete weather', () => {
  const css = postcss.parse(readFileSync('app/readability.css', 'utf8'));
  const styles = selector => {
    const result = {};
    css.walkRules(selector, rule => {
      if (rule.parent.type !== 'atrule' || rule.parent.params !== '(max-width: 700px)') return;
      rule.walkDecls(decl => { result[decl.prop] = decl.value; });
    });
    return result;
  };
  const matchup = styles('.roster-section .roster-matchup-details');
  assert.equal(matchup.width, '100%');
  assert.equal(matchup['min-width'], '0');
  const badge = styles('.roster-section .roster-matchup-details > .matchup-team');
  assert.equal(badge.width, 'calc(100% - 99px)');
  assert.equal(badge['justify-self'], 'start');
  const weather = styles('.roster-section .roster-matchup-details > .roster-weather');
  assert.equal(weather['white-space'], 'normal');
  assert.equal(weather['text-overflow'], 'clip');
  assert.equal(weather.overflow, 'visible');
  assert.equal(weather['overflow-wrap'], 'anywhere');
});
