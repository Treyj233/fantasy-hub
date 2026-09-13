import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../social-agent/src/editorial-context.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { findReportingContext, editorialContext } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
test('context search includes a questionable teammate but excludes stale, unrelated and media-dependent reports', () => {
  const context = { player: 'Depth Receiver', affectedPlayers: ['Malik Nabers'], backups: [], availabilityContext: ['Malik Nabers: Questionable'] };
  const base = { id: 'injury', source: '@Reporter', publishedAt: new Date().toISOString(), title: 'Malik Nabers questionable', summary: 'Malik Nabers questionable', url: 'https://x.com/report/1' };
  const reports = [base, { ...base, id: 'duplicate' }, { ...base, id: 'old', url: 'old', publishedAt: new Date(Date.now() - 80 * 3600000).toISOString() }, { ...base, id: 'other', url: 'other', title: 'Other Player', summary: 'Other Player' }, { ...base, id: 'video', url: 'video', sourceContext: ['media-ai-review'] }];
  assert.equal(findReportingContext({ id: 'signing' }, context, reports).length, 1);
  const evidence = editorialContext(context);
  assert.match(evidence, /preliminary availability signal, not confirmation/);
  assert.match(evidence, /Malik Nabers: Questionable/);
  assert.match(evidence, /No corroborating report supplied/);
});
test('missing context never implies a player is healthy', () => {
  assert.match(editorialContext(null), /do not assume healthy or injured/);
});
