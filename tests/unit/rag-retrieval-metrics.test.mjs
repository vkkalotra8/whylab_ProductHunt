import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateSingleRetrieval,
  evaluateRetrievalMetrics,
} from '../../src/core/diagnostics/llm/retrieval-metrics.ts';

test('retrieval-metrics: computes perfect MRR and Recall@1 when top result is relevant', () => {
  const query = {
    caseId: 'q1',
    retrievedDocIds: ['doc_10', 'doc_20', 'doc_30'],
    relevantDocIds: ['doc_10'],
  };

  const res = evaluateSingleRetrieval(query, [1, 3, 5]);
  assert.equal(res.status, 'computed');
  assert.equal(res.firstRelevantRank, 1);
  assert.equal(res.reciprocalRank, 1.0);
  assert.equal(res.recallAtK?.[1], 1.0);
  assert.equal(res.recallAtK?.[3], 1.0);
  assert.equal(res.precisionAtK?.[1], 1.0);
  assert.equal(res.hitAtK?.[1], true);
});

test('retrieval-metrics: computes exact reciprocal rank and Recall@k progression', () => {
  // Relevant docs: doc_B, doc_D. Retrieved: [doc_A, doc_B, doc_C, doc_D]
  // First relevant at rank 2 -> RR = 1/2 = 0.5
  // Top 1: 0/2 -> Recall@1 = 0
  // Top 2: 1/2 -> Recall@2 = 0.5
  // Top 3: 1/2 -> Recall@3 = 0.5
  // Top 4: 2/2 -> Recall@4 = 1.0
  const query = {
    caseId: 'q2',
    retrievedDocIds: ['doc_A', 'doc_B', 'doc_C', 'doc_D'],
    relevantDocIds: ['doc_B', 'doc_D'],
  };

  const res = evaluateSingleRetrieval(query, [1, 2, 3, 4]);
  assert.equal(res.status, 'computed');
  assert.equal(res.firstRelevantRank, 2);
  assert.equal(res.reciprocalRank, 0.5);
  assert.equal(res.recallAtK?.[1], 0.0);
  assert.equal(res.recallAtK?.[2], 0.5);
  assert.equal(res.recallAtK?.[3], 0.5);
  assert.equal(res.recallAtK?.[4], 1.0);
  assert.equal(res.hitAtK?.[1], false);
  assert.equal(res.hitAtK?.[2], true);
});

test('retrieval-metrics: zero recall and MRR when no relevant docs found', () => {
  const query = {
    caseId: 'q3',
    retrievedDocIds: ['doc_1', 'doc_2'],
    relevantDocIds: ['doc_99'],
  };

  const res = evaluateSingleRetrieval(query, [1, 2]);
  assert.equal(res.status, 'computed');
  assert.equal(res.firstRelevantRank, null);
  assert.equal(res.reciprocalRank, 0.0);
  assert.equal(res.recallAtK?.[1], 0.0);
  assert.equal(res.recallAtK?.[2], 0.0);
  assert.equal(res.hitAtK?.[2], false);
});

test('retrieval-metrics: safely marks queries without relevance labels as UNAVAILABLE', () => {
  const query = {
    caseId: 'q4',
    retrievedDocIds: ['doc_1', 'doc_2'],
    relevantDocIds: null, // missing labels
  };

  const res = evaluateSingleRetrieval(query);
  assert.equal(res.status, 'unavailable');
  assert.equal(res.hasRelevanceGroundTruth, false);
  assert.match(res.reason ?? '', /No ground-truth relevant document IDs provided/);
});

test('retrieval-metrics: aggregates MRR and Recall@k across multiple queries', () => {
  const queries = [
    // q1: first relevant at rank 1 -> RR = 1.0, Recall@3 = 1.0
    { caseId: 'q1', retrievedDocIds: ['d1', 'd2', 'd3'], relevantDocIds: ['d1'] },
    // q2: first relevant at rank 2 -> RR = 0.5, Recall@3 = 1.0
    { caseId: 'q2', retrievedDocIds: ['d4', 'd5', 'd6'], relevantDocIds: ['d5'] },
    // q3: no relevant docs -> RR = 0.0, Recall@3 = 0.0
    { caseId: 'q3', retrievedDocIds: ['d7', 'd8', 'd9'], relevantDocIds: ['d99'] },
  ];

  // MRR = (1.0 + 0.5 + 0.0) / 3 = 1.5 / 3 = 0.50
  // Recall@1 = (1.0 + 0.0 + 0.0) / 3 = 0.3333
  // Recall@3 = (1.0 + 1.0 + 0.0) / 3 = 0.6667
  const summary = evaluateRetrievalMetrics(queries, [1, 3]);
  assert.equal(summary.status, 'computed');
  assert.equal(summary.evaluatedQueryCount, 3);
  assert.equal(summary.queriesWithGroundTruthCount, 3);
  assert.equal(summary.meanReciprocalRank, 0.5);
  assert.equal(summary.recallAtK[1], 0.3333);
  assert.equal(summary.recallAtK[3], 0.6667);
  assert.equal(summary.hitRateAtK[1], 0.3333);
  assert.equal(summary.hitRateAtK[3], 0.6667);
});
