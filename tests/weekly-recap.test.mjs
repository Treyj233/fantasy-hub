import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recapResult } from '../app/weekly-recap.mjs';
const board = (a,b,status='Final') => ({ week: 1, matchups: [{ status, teams: [{rosterId:'4',points:a},{rosterId:'8',points:b}] }] });
test('recap uses actual scores and the connected roster, not roster order',()=>{
  assert.equal(recapResult(board(122,100),1,'4').outcome,'W');
  assert.equal(recapResult(board(122,100),1,'8').outcome,'L');
  assert.equal(recapResult(board(100,100),1,'4').outcome,'T');
  assert.equal(recapResult(board(100.004,100),1,'4').outcome,'W');
});
test('missing, wrong-week and unfinished results never become losses or ties',()=>{
  assert.equal(recapResult(board(0,0,'Live'),1,'4').outcome,'Pending');
  assert.equal(recapResult(board(100,NaN),1,'4').outcome,'Pending');
  assert.equal(recapResult(board(100,99),2,'4').outcome,'Unavailable');
  assert.equal(recapResult({week:1,matchups:[]},1,'4').outcome,'No matchup');
  assert.equal(recapResult({week:1,matchups:[{teams:[{rosterId:'4'}]}]},1,'4').outcome,'Bye');
});
