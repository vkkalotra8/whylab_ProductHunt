import test from 'node:test';
import assert from 'node:assert/strict';
import { ingestLlmEvaluation, deriveLlmCapabilities } from '../../src/core/diagnostics/llm/llm-ingestion.ts';
import { computeSha256Hex } from '../../src/core/diagnostics/llm/hash.ts';

test('llm-hash: computes correct SHA-256 for standard test vectors', () => {
  // Empty string
  assert.equal(computeSha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  // "hello world"
  assert.equal(
    computeSha256Hex('hello world'),
    'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'
  );
});

test('llm-ingestion: ingests valid JSONL evaluation dataset', () => {
  const jsonl = [
    JSON.stringify({
      case_id: 'case_001',
      prompt: 'What is the capital of France?',
      response: 'The capital of France is Paris.',
      reference_answer: 'Paris',
      model_version: 'gpt-4o-mini',
      latency_ms: 245.5,
      token_usage: { prompt_tokens: 15, completion_tokens: 8, total_tokens: 23 },
    }),
    JSON.stringify({
      case_id: 'case_002',
      prompt: 'What is 2 + 2?',
      response: '4',
      reference_answer: '4',
      model_version: 'gpt-4o-mini',
      latency_ms: 110.2,
      token_usage: { prompt_tokens: 8, completion_tokens: 2, total_tokens: 10 },
    }),
  ].join('\n');

  const result = ingestLlmEvaluation(jsonl, { filename: 'test-qa.jsonl' });
  assert.equal(result.success, true);
  assert.ok(result.dataset);
  assert.equal(result.dataset.recordCount, 2);
  assert.equal(result.dataset.format, 'jsonl');
  assert.equal(result.dataset.records[0].caseId, 'case_001');
  assert.equal(result.dataset.records[0].response, 'The capital of France is Paris.');
  assert.equal(result.dataset.records[0].referenceAnswer, 'Paris');
  assert.equal(result.dataset.records[0].latencyMs, 245.5);
  assert.equal(result.dataset.records[0].tokenUsage?.totalTokens, 23);
  assert.ok(result.dataset.contentDigest.startsWith('sha256:'));
  assert.equal(result.dataset.capabilities.hasReferenceAnswers, true);
  assert.equal(result.dataset.capabilities.referenceAnswerCoverageRatio, 1.0);
  assert.equal(result.dataset.capabilities.hasLatency, true);
  assert.equal(result.dataset.capabilities.hasTokenUsage, true);
  assert.deepEqual(result.dataset.capabilities.modelVersions, ['gpt-4o-mini']);
});

test('llm-ingestion: ingests valid CSV evaluation dataset', () => {
  const csv = [
    'case_id,prompt,response,reference_answer,model_version,latency_ms,prompt_tokens,completion_tokens',
    'c1,"Translate hello","Bonjour","Bonjour","claude-3-5-sonnet",340,12,3',
    'c2,"Translate goodbye","Au revoir","Au revoir","claude-3-5-sonnet",290,14,4',
  ].join('\n');

  const result = ingestLlmEvaluation(csv, { filename: 'translations.csv' });
  assert.equal(result.success, true);
  assert.ok(result.dataset);
  assert.equal(result.dataset.recordCount, 2);
  assert.equal(result.dataset.format, 'csv');
  assert.equal(result.dataset.records[0].caseId, 'c1');
  assert.equal(result.dataset.records[0].response, 'Bonjour');
  assert.equal(result.dataset.records[0].referenceAnswer, 'Bonjour');
  assert.equal(result.dataset.records[0].tokenUsage?.promptTokens, 12);
  assert.equal(result.dataset.records[0].tokenUsage?.totalTokens, 15);
});

test('llm-ingestion: strips UTF-8 BOM cleanly', () => {
  const jsonlWithBom =
    '\uFEFF' +
    JSON.stringify({
      case_id: 'c1',
      prompt: 'ping',
      response: 'pong',
    });

  const result = ingestLlmEvaluation(jsonlWithBom);
  assert.equal(result.success, true);
  assert.equal(result.dataset?.records.length, 1);
  assert.equal(result.dataset?.records[0].caseId, 'c1');
});

test('llm-ingestion: rejects empty content', () => {
  const result = ingestLlmEvaluation('   ');
  assert.equal(result.success, false);
  assert.ok(result.errors.length > 0);
  assert.match(result.errors[0].message, /empty/i);
});

test('llm-ingestion: rejects null bytes', () => {
  const result = ingestLlmEvaluation('case_id,prompt\0,response');
  assert.equal(result.success, false);
  assert.match(result.errors[0].message, /null bytes/i);
});

test('llm-ingestion: reports line-level error on malformed JSONL line', () => {
  const malformed = [
    JSON.stringify({ case_id: 'c1', prompt: 'hi', response: 'hello' }),
    '{"case_id": "c2", prompt: unquoted_val}',
    JSON.stringify({ case_id: 'c3', prompt: 'bye', response: 'goodbye' }),
  ].join('\n');

  const result = ingestLlmEvaluation(malformed);
  assert.equal(result.success, false);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].line, 2);
  assert.match(result.errors[0].message, /Invalid JSON on line 2/);
  // Valid records parsed anyway
  assert.equal(result.dataset?.recordCount, 2);
});

test('llm-ingestion: rejects CSV missing required columns', () => {
  const invalidCsv = 'sample_id,unrelated_col1,unrelated_col2\n1,foo,bar';
  const result = ingestLlmEvaluation(invalidCsv);
  assert.equal(result.success, false);
  assert.match(result.errors[0].message, /missing required columns/i);
});

test('llm-ingestion: handles optional reference answers gracefully (unsupervised / production outputs)', () => {
  const jsonl = [
    JSON.stringify({ case_id: 'c1', prompt: 'Tell me a joke', response: 'Why did the chicken cross the road?' }),
    JSON.stringify({ case_id: 'c2', prompt: 'Write a poem', response: 'Roses are red...' }),
  ].join('\n');

  const result = ingestLlmEvaluation(jsonl);
  assert.equal(result.success, true);
  assert.equal(result.dataset?.capabilities.hasReferenceAnswers, false);
  assert.equal(result.dataset?.capabilities.referenceAnswerCoverageRatio, 0);
  assert.equal(result.dataset?.records[0].referenceAnswer, null);
});
