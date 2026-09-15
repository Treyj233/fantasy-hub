import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const compile=path=>ts.transpile(readFileSync(path,'utf8'),{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022});
const contentUrl=`data:text/javascript;base64,${Buffer.from(compile('social-agent/src/content.ts')).toString('base64')}`;
const {composeFantasyPost,storyLabel}=await import(contentUrl);
test('performance icons distinguish negative, positive and mixed evidence',()=>{
 assert.equal(storyLabel('performance','Player struggled, held to 20 yards.'),'❄️ PERFORMANCE PULSE');
 assert.equal(storyLabel('performance','Player set a career-high in receptions.'),'🔥 PERFORMANCE PULSE');
 assert.equal(storyLabel('performance','Player was held to 20 yards but saw more targets.'),'📊 PERFORMANCE PULSE');
 assert.equal(storyLabel('performance','Player targets 1,300 yards this season.'),'📊 PERFORMANCE PULSE');
 assert.equal(storyLabel('injury','Player struggled.'),'🚨 INJURY PULSE');
});
const intelligence=compile('social-agent/src/intelligence.ts').replace('"./content"',JSON.stringify(contentUrl));
const {validateStoryDraft,extractStoryFacts}=await import(`data:text/javascript;base64,${Buffer.from(intelligence).toString('base64')}`);
const story={id:'1',title:'Michael Wilson practiced in full today.',summary:'Michael Wilson practiced in full today.',category:'news',source:'@AdamSchefter',url:'https://example.com',publishedAt:'2026-09-15T12:00:00Z'};
const context={player:'Michael Wilson',position:'WR',team:'ARI',backups:[],affectedPlayers:[]};
test('natural AI copy is preserved with credit and no forced impact heading',()=>{
 const body='Michael Wilson practiced in full today. His availability is trending in the right direction, but game status is not confirmed.';
 const draft=composeFantasyPost({...story,tweetText:body},context);
 assert.equal(draft,'🏈 FANTASY PULSE\n\n'+body+'\n\nReported by @AdamSchefter');
 assert.ok(draft.length<=280);
 assert.equal(validateStoryDraft(story,context,draft,extractStoryFacts(story,context)).approvedForX,true);
});
test('news-only fallback invents no beneficiary or forced recommendation',()=>{
 const draft=composeFantasyPost(story,context);
 assert.doesNotMatch(draft,/WHY IT MATTERS|FANTASY IMPACT|target share|waiver|backup/i);
 assert.equal(validateStoryDraft(story,context,draft,extractStoryFacts(story,context)).approvedForX,true);
});
test('all categories retain headers and negative performance keeps snow',()=>{
 for (const [category,header] of [['news','🏈 FANTASY PULSE'],['injury','🚨 INJURY PULSE'],['contract','📝 ROSTER MOVE'],['depth-chart','📈 ROLE WATCH'],['weather','🌧️ WEATHER WATCH'],['performance','❄️ PERFORMANCE PULSE']]) {
  const draft=composeFantasyPost({...story,category,title:'Michael Wilson struggled.',summary:'Michael Wilson struggled.',tweetText:'Michael Wilson struggled.'},context);
  assert.ok(draft.startsWith(header+'\n\n'));
  assert.ok(draft.length<=280);
 }
});
test('headers do not bypass vague headline checks',()=>{
 const draft='🏈 FANTASY PULSE\n\nMichael Wilson has a new update.';
 assert.equal(validateStoryDraft(story,context,draft,extractStoryFacts(story,context)).approvedForX,false);
});
test('legacy drafts cannot pass validation and historical review still applies',()=>{
 const legacy='News\n\nWHY IT MATTERS: More targets.';
 assert.equal(validateStoryDraft(story,context,legacy,extractStoryFacts(story,context)).approvedForX,false);
 const historical={...story,sourceContext:['historical-review-required']};
 assert.equal(validateStoryDraft(historical,context,composeFantasyPost(historical,context),extractStoryFacts(historical,context)).approvedForX,false);
});
