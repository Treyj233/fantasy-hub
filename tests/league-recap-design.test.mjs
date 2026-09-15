import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { jsPDF } from 'jspdf';
import { drawLeagueRecap, recapAwardCards } from '../app/league-recap-design.mjs';

const labels=['HARD-LUCK LOSS','JUST ENOUGH','SHOOTOUT','WEEKLY MVP','BENCH FIREPOWER','BIGGEST BOUNCE-BACK','GIANT SLAYER','HEARTBREAKER','WRONG WEEK, WRONG OPPONENT','PERFECT LINEUP','WAIVER WIRE HERO','TEAM EFFORT','ONE-PLAYER ARMY','STREAK BREAKER','BACK IN BUSINESS','PHOTO-FINISH REGULAR','CONSISTENCY KING','UNLUCKY SCHEDULE'];
test('recap uses the exact current iPhone launch logo, not the legacy green logo',()=>{
  assert.deepEqual(readFileSync('public/fh-blue-app-mark.png'),readFileSync('ios/App/App/Assets.xcassets/LaunchMark.imageset/fh-blue-app-mark.png'));
  const source=readFileSync('app/league-story-pdf.ts','utf8');
  assert.match(source,/fetch\("\/fh-blue-app-mark.png"\)/);
  assert.ok(!source.includes('fantasy-hub-logo-cropped.png'));
  const renderer=readFileSync('app/league-recap-design.mjs','utf8');
  assert.match(renderer,/saveGraphicsState\(\);\s*pdf\.roundedRect\(M,22,42,42,9,9,null\);\s*pdf\.clip\(\);pdf\.discardPath\(\);\s*pdf\.addImage\(logo,"PNG",M,22,42,42\);\s*pdf\.restoreGraphicsState\(\)/);
});
const fixture={league:{name:'Sunday Syndicate',season:'2026'},recap:{week:4,highScore:{teamName:'Revenge Tour',points:154.8},closestGame:{teams:[{teamName:'Fourth & Forever',points:118.24},{teamName:'Sunday Scaries',points:117.86}]},biggestWin:{teams:[{teamName:'Revenge Tour',points:154.8},{teamName:'The Underdogs',points:96.1}]},superlatives:labels.map((label,i)=>({id:String(i),label,recipient:i%3===0?'Fourth & Forever':i%3===1?'Revenge Tour':'Sunday Scaries',detail:i%3===0?'118.2 points | Highest-scoring loss':i%3===1?'Ended a 4-game winning streak':'Outscored 9 of 11 other teams and still lost'}))}};
test('every award is exported with automatic page breaks and safe text bounds',()=>{
  const pdf=new jsPDF({unit:'pt',format:'letter'});
  const original=pdf.text.bind(pdf);
  pdf.text=(text,x,y,...rest)=>{assert.ok(y>=0&&y<=773,`text outside safe area: ${y}`);return original(text,x,y,...rest);};
  const result=drawLeagueRecap(pdf,fixture,{primary:[75,22,76],accent:[255,120,90],deep:[28,8,32],logo:new Uint8Array(readFileSync('public/fh-blue-app-mark.png'))});
  assert.equal(result.awardCount,20);
  assert.ok(result.pageCount>=3);
  const data=pdf.output();
  for(const label of labels) assert.ok(data.includes(label),label);
  if(process.env.RENDER_RECAP){mkdirSync('tmp/pdfs',{recursive:true});writeFileSync('tmp/pdfs/recap-preview.pdf',Buffer.from(pdf.output('arraybuffer')));}
});
test('export passes the active theme and retains larger body text',()=>{
  assert.match(readFileSync('app/league-story-pdf.ts','utf8'),/drawLeagueRecap\(pdf, story, \{ primary, accent, deep, logo \}\)/);
  const pdf=new jsPDF({unit:'pt',format:'letter'});
  const colors=[];const fill=pdf.setFillColor.bind(pdf);
  pdf.setFillColor=(...args)=>{colors.push(args);return fill(...args);};
  drawLeagueRecap(pdf,fixture,{primary:[75,22,76],accent:[255,120,90],deep:[28,8,32]});
  assert.ok(colors.some(c=>c.join(',')==='75,22,76'));
  assert.ok(colors.some(c=>c.join(',')==='28,8,32'));
  assert.match(pdf.output(),/18 Tf/);
  assert.match(pdf.output(),/12 Tf/);
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
