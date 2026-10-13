import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeExactMatch,
  computeNormalizedExactMatch,
  computeTokenF1,
  normalizeText,
  evaluateTextMetrics,
} from '../../src/core/diagnostics/llm/text-metrics.ts';
import {
  checkJsonParseValidity,
  validateAgainstSchema,
  evaluateJsonMetrics,
} from '../../src/core/diagnostics/llm/schema-validator.ts';

test('text-metrics: exact match is strictly case and whitespace sensitive', () => {
  assert.equal(computeExactMatch('Paris', 'Paris'), true);
  assert.equal(computeExactMatch('paris', 'Paris'), false);
  assert.equal(computeExactMatch('Paris ', 'Paris'), true); // trimmed
  assert.equal(computeExactMatch('Paris!', 'Paris'), false);
});

test('text-metrics: normalized exact match ignores punctuation, casing and extra spacing', () => {
  assert.equal(computeNormalizedExactMatch('  Paris!  ', 'paris'), true);
  assert.equal(
    computeNormalizedExactMatch('Hello, World! How are you?', 'hello world how are you'),
    true
  );
  assert.equal(computeNormalizedExactMatch('Answer: 42.', '42'), false);
});

test('text-metrics: token F1 correctly computes unigram precision, recall and harmonic mean', () => {
  // Perfect overlap
  const perf = computeTokenF1('the quick brown fox', 'the quick brown fox');
  assert.equal(perf.precision, 1.0);
  assert.equal(perf.recall, 1.0);
  assert.equal(perf.f1, 1.0);

  // Partial overlap: pred = "the brown fox" (3 tokens), ref = "the quick brown fox jumps" (5 tokens)
  // intersection: "the", "brown", "fox" (3 tokens)
  // precision = 3/3 = 1.0
  // recall = 3/5 = 0.6
  // F1 = 2 * 1.0 * 0.6 / (1.0 + 0.6) = 1.2 / 1.6 = 0.75
  const partial = computeTokenF1('the brown fox', 'the quick brown fox jumps');
  assert.equal(partial.precision, 1.0);
  assert.equal(partial.recall, 0.6);
  assert.equal(partial.f1, 0.75);

  // Both empty edge case -> 1.0
  assert.equal(computeTokenF1('', '').f1, 1.0);
  // One empty edge case -> 0.0
  assert.equal(computeTokenF1('foo', '').f1, 0.0);
  assert.equal(computeTokenF1('', 'bar').f1, 0.0);
});

test('text-metrics: dataset evaluation marks missing reference cases as UNAVAILABLE', () => {
  const records = [
    { caseId: 'c1', response: 'Paris', referenceAnswer: 'Paris' },
    { caseId: 'c2', response: 'Tokyo', referenceAnswer: 'Kyoto' },
    { caseId: 'c3', response: 'Generative answer without ground truth', referenceAnswer: null },
  ];

  const summary = evaluateTextMetrics(records);
  assert.equal(summary.evaluatedRecordCount, 3);
  assert.equal(summary.recordsWithReferenceCount, 2);
  assert.equal(summary.coverageRatio, 0.6667);
  assert.equal(summary.status, 'computed');
  assert.equal(summary.exactMatchCount, 1);
  assert.equal(summary.exactMatchRate, 0.5); // 1 out of 2 evaluated references

  // Check c3 was safely labeled unavailable rather than 0%
  const c3Result = summary.perRecordResults.find((r) => r.caseId === 'c3');
  assert.ok(c3Result);
  assert.equal(c3Result.status, 'unavailable');
  assert.equal(c3Result.hasReference, false);
});

test('text-metrics: completely ungrounded dataset reports honest unavailable status', () => {
  const records = [
    { caseId: 'c1', response: 'output 1', referenceAnswer: null },
    { caseId: 'c2', response: 'output 2', referenceAnswer: undefined },
  ];

  const summary = evaluateTextMetrics(records);
  assert.equal(summary.status, 'unavailable');
  assert.equal(summary.recordsWithReferenceCount, 0);
  assert.match(summary.reason ?? '', /No evaluation cases contain ground-truth/);
});

test('schema-validator: identifies valid JSON, invalid syntax, and markdown fences', () => {
  // Direct JSON
  const valid = checkJsonParseValidity('{"status": "ok", "code": 200}');
  assert.equal(valid.isValid, true);
  assert.equal(valid.wasMarkdownWrapped, false);

  // Markdown fence wrapped
  const fenced = checkJsonParseValidity('```json\n{"status": "ok", "code": 200}\n```');
  assert.equal(fenced.isValid, true);
  assert.equal(fenced.wasMarkdownWrapped, true);
  assert.equal(fenced.extractedFromMarkdown, true);

  // Invalid syntax
  const invalid = checkJsonParseValidity('{status: ok, unquoted}');
  assert.equal(invalid.isValid, false);
  assert.ok(invalid.error);
});

test('schema-validator: validates structural constraints against JSON schema', () => {
  const schema = {
    type: 'object',
    required: ['user_id', 'sentiment', 'confidence'],
    properties: {
      user_id: { type: 'string' },
      sentiment: { type: 'string', enum: ['positive', 'negative', 'neutral'] },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
    },
  };

  // Valid record
  const good = { user_id: 'usr_123', sentiment: 'positive', confidence: 0.95 };
  const goodViolations = validateAgainstSchema(good, schema);
  assert.equal(goodViolations.length, 0);

  // Missing required field
  const missingField = { sentiment: 'positive', confidence: 0.95 };
  const v1 = validateAgainstSchema(missingField, schema);
  assert.equal(v1.length, 1);
  assert.equal(v1[0].rule, 'required');
  assert.match(v1[0].message, /Missing required property "user_id"/);

  // Invalid enum value
  const badEnum = { user_id: 'usr_1', sentiment: 'ecstatic', confidence: 0.95 };
  const v2 = validateAgainstSchema(badEnum, schema);
  assert.equal(v2.length, 1);
  assert.equal(v2[0].rule, 'enum');

  // Value out of range
  const outOfRange = { user_id: 'usr_1', sentiment: 'positive', confidence: 1.5 };
  const v3 = validateAgainstSchema(outOfRange, schema);
  assert.equal(v3.length, 1);
  assert.equal(v3[0].rule, 'maximum');
});

test('schema-validator: dataset evaluation computes parse rate and schema compliance rate', () => {
  const records = [
    { caseId: 'c1', response: '{"name": "Alice", "age": 30}' },
    { caseId: 'c2', response: '{"name": "Bob", "age": "thirty"}' }, // type violation
    { caseId: 'c3', response: 'not a json string' }, // parse failure
  ];

  const schema = {
    type: 'object',
    required: ['name', 'age'],
    properties: {
      name: { type: 'string' },
      age: { type: 'number' },
    },
  };

  const metrics = evaluateJsonMetrics(records, schema);
  assert.equal(metrics.evaluatedRecordCount, 3);
  assert.equal(metrics.validParseCount, 2);
  assert.equal(metrics.jsonParseValidityRate, 0.6667);
  assert.equal(metrics.hasSchemaConfigured, true);
  assert.equal(metrics.compliantCount, 1);
  assert.equal(metrics.jsonSchemaComplianceRate, 0.3333);
  assert.equal(metrics.commonViolations.length, 1);
});
