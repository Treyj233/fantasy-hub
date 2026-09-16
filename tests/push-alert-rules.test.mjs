import test from 'node:test';
import assert from 'node:assert/strict';
import { notificationGameState, matchupFinished, dangerousFantasyWeather, unavailableStarter } from '../app/push-alert-rules.mjs';

const now = Date.parse('2026-09-13T17:01:00Z');
test('scheduled kickoff is live without play-by-play', () => {
  assert.equal(notificationGameState({ date: '2026-09-13T17:00:00Z', state: 'pre' }, now), 'in');
  assert.equal(notificationGameState({ date: '2026-09-13T20:00:00Z', state: 'pre' }, now), 'pre');
  assert.equal(notificationGameState({ date: '2026-09-13T17:00:00Z', status: 'Postponed' }, now), 'pre');
});
test('Thursday final cannot finish a matchup with Sunday games remaining', () => {
  assert.equal(matchupFinished([{ status: 'Final' }, { date: '2026-09-13T20:00:00Z' }], now), false);
  assert.equal(matchupFinished([{ status: 'Final' }, { state: 'post' }], now), true);
  assert.equal(matchupFinished([], now), false);
});
test('availability alerts require actionable unavailability', () => {
  for (const status of ['Out', 'IR', 'SUS', 'DNR', 'Doubtful']) assert.equal(unavailableStarter(status), true);
  for (const status of ['Healthy', 'Active', 'Questionable', '']) assert.equal(unavailableStarter(status), false);
});
test('weather alerts distinguish adverse conditions from routine forecasts', () => {
  assert.equal(dangerousFantasyWeather({ windMph: 22 }), true);
  assert.equal(dangerousFantasyWeather({ windGustMph: 35 }), true);
  assert.equal(dangerousFantasyWeather({ condition: 'Heavy snow' }), true);
  assert.equal(dangerousFantasyWeather({ condition: 'Sunny', windMph: 5 }), false);
  assert.equal(dangerousFantasyWeather({ indoor: true, windMph: 30 }), false);
  assert.equal(dangerousFantasyWeather(null), false);
});
