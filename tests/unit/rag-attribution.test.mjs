import test from 'node:test';
import assert from 'node:assert/strict';
import {
  splitSentences,
  extractCitations,
  checkRecordAttribution,
  evaluateDatasetAttribution,
} from '../../src/core/diagnostics/llm/attribution-checker.ts';

test('rag-attribution: sentence splitter segments text cleanly', () => {
  const text = 'The capital is Paris. It has 2 million residents! Is it old? Yes, very.';
  const sentences = splitSentences(text);
  assert.equal(sentences.length, 4);
  assert.equal(sentences[0], 'The capital is Paris.');
  assert.equal(sentences[1], 'It has 2 million residents!');
});

test('rag-attribution: extracts citation tags correctly', () => {
  const sentence = 'According to the policy [1] and guideline [doc_security], data is encrypted [chunk_99].';
  const citations = extractCitations(sentence);
  assert.deepEqual(citations, ['1', 'doc_security', 'chunk_99']);
});

test('rag-attribution: flags fully attributed claims as ATTRIBUTED', () => {
  const context = ['WhyLab encrypts all patient data at rest using AES-256 managed keys.'];
  const response = 'WhyLab protects patient data by encrypting it at rest with AES-256 keys [1].';

  const res = checkRecordAttribution('c1', response, context);
  assert.equal(res.status, 'computed');
  assert.equal(res.hasRetrievedContext, true);
  assert.equal(res.claims.length, 1);
  assert.equal(res.claims[0].classification, 'ATTRIBUTED');
  assert.ok(res.claims[0].attributionScore >= 0.7);
  assert.equal(res.claims[0].phantomCitations.length, 0); // [1] is valid index
});

test('rag-attribution: detects unsupported claims and flags potential hallucinations', () => {
  const context = ['WhyLab was founded in 2024 to solve ML reliability.'];
  const response = 'WhyLab was founded in 2024. The CEO previously invented quantum gravity computers in Tokyo.';

  const res = checkRecordAttribution('c2', response, context);
  assert.equal(res.status, 'computed');
  assert.equal(res.claims.length, 2);

  // First sentence is supported
  assert.equal(res.claims[0].classification, 'ATTRIBUTED');

  // Second sentence is completely absent from context
  assert.equal(res.claims[1].classification, 'UNSUPPORTED_CLAIM');
  assert.ok(res.claims[1].attributionScore < 0.25);
  assert.equal(res.unsupportedClaimsCount, 1);
});

test('rag-attribution: flags phantom citations when cited document IDs do not exist', () => {
  const context = [
    { id: 'doc_auth', text: 'Multi-factor authentication is required for admins.' },
  ];
  const response = 'Admins must configure multi-factor auth [doc_auth]. Audit retention is 10 years [doc_nonexistent] [99].';

  const res = checkRecordAttribution('c3', response, context);
  assert.equal(res.status, 'computed');
  assert.equal(res.claims.length, 2);

  // Second sentence cites doc_nonexistent and 99 (only 1 chunk exists)
  assert.deepEqual(res.claims[1].phantomCitations, ['doc_nonexistent', '99']);
  assert.equal(res.phantomCitationsCount, 2);
});

test('rag-attribution: dataset evaluation marks records without context as UNAVAILABLE', () => {
  const records = [
    {
      caseId: 'c1',
      response: 'Paris is capital.',
      retrievedContext: ['Paris is the capital of France.'],
    },
    {
      caseId: 'c2',
      response: 'Some claim without context.',
      retrievedContext: null,
    },
  ];

  const summary = evaluateDatasetAttribution(records);
  assert.equal(summary.status, 'computed');
  assert.equal(summary.evaluatedRecordCount, 2);
  assert.equal(summary.recordsWithContextCount, 1);

  const c2Result = summary.perRecordResults.find((r) => r.caseId === 'c2');
  assert.equal(c2Result?.status, 'unavailable');
  assert.match(c2Result?.reason ?? '', /No retrieved context passages provided/);
});
