import test from 'node:test';
import assert from 'node:assert/strict';
import {sundaySwingsFromGroups} from '../app/sunday-swings.mjs';
const event={dedupeKey:'player:score:20',description:'Player: 7.4 fantasy points',delta:7.4,at:'2026-09-13T18:00:00Z'};
test('generic scoring updates qualify without a play-by-play description',()=>{
  const [swing]=sundaySwingsFromGroups([[event]]);
  assert.equal(swing.text,'Scoring update · Player: 7.4 fantasy points');
  assert.equal(swing.delta,7.4);
});
test('confirmed detail is preferred when available',()=>{
  assert.equal(sundaySwingsFromGroups([[{...event,confirmedPlay:'Player: touchdown reception'}]])[0].text,'Player: touchdown reception');
});
test('threshold stays strictly greater than six and rejects invalid or negative deltas',()=>{
  for(const delta of [6,1,0,-7,NaN,Infinity])assert.deepEqual(sundaySwingsFromGroups([[{...event,delta}]]),[]);
});
test('one entry covers all impacted leagues including opponent players',()=>{
  const result=sundaySwingsFromGroups([[{...event,impact:'helps'},{...event,impact:'hurts',delta:8.4}]]);
  assert.equal(result.length,1);
  assert.equal(result[0].delta,8.4);
});
