import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { jsPDF } from 'jspdf';
import { drawLeagueRecap, recapAwardCards } from '../app/league-recap-design.mjs';

const labels=['HARD-LUCK LOSS','JUST ENOUGH','SHOOTOUT','WEEKLY MVP','BENCH FIREPOWER','BIGGEST BOUNCE-BACK','GIANT SLAYER','HEARTBREAKER','WRONG WEEK, WRONG OPPONENT','PERFECT LINEUP','WAIVER WIRE HERO','TEAM EFFORT','ONE-PLAYER ARMY','STREAK BREAKER','BACK IN BUSINESS','PHOTO-FINISH REGULAR','CONSISTENCY KING','UNLUCKY SCHEDULE'];
const fixture={league:{name:'Sunday Syndicate',season:'2026'},recap:{week:4,highScore:{teamName:'Revenge Tour',points:154.8},closestGame:{teams:[{teamName:'Fourth & Forever',points:118.24},{teamName:'Sunday Scaries',points:117.86}]},biggestWin:{teams:[{teamName:'Revenge Tour',points:154.8},{teamName:'The Underdogs',points:96.1}]},superlatives:labels.map((label,i)=>({id:String(i),label,recipient:i%3===0?'Fourth & Forever':i%3===1?'Revenge Tour':'Sunday Scaries',detail:i%3===0?'118.2 points | Highest-scoring loss':i%3===1?'Ended a 4-game winning streak':'Outscored 9 of 11 other teams and still lost'}))}};
test('every award is exported with automatic page breaks and safe text bounds',()=>{
  const pdf=new jsPDF({unit:'pt',format:'letter'});
  const original=pdf.text.bind(pdf);
  pdf.text=(text,x,y,...rest)=>{assert.ok(y>=0&&y<=773,`text outside safe area: ${y}`);return original(text,x,y,...rest);};
  const result=drawLeagueRecap(pdf,fixture,{logo:new Uint8Array(readFileSync('public/fantasy-hub-logo-cropped.png')),accent:[255,125,90],primary:[75,22,76]});
  assert.equal(result.awardCount,20);
  assert.ok(result.pageCount>=3);
  const data=pdf.output();
  for(const label of labels) assert.ok(data.includes(label),label);
  if(process.env.RENDER_RECAP){mkdirSync('tmp/pdfs',{recursive:true});writeFileSync('tmp/pdfs/recap-preview.pdf',Buffer.from(pdf.output('arraybuffer')));}
});
test('shared winners and long names flow without truncating award content',()=>{
  const story=structuredClone(fixture);
  story.recap.superlatives=[{id:'shared',label:'TEAM EFFORT',recipient:Array.from({length:20},(_,i)=>`Very Long Fantasy Football Team Name Number ${i}`).join(' · '),detail:'Shared honors across all qualifying managers'}];
  const pdf=new jsPDF({unit:'pt',format:'letter'});
  drawLeagueRecap(pdf,story);
  assert.match(pdf.output(),/Number 19/);
  assert.match(pdf.output(),/CONT./);
  assert.equal(recapAwardCards({}).length,0);
});
