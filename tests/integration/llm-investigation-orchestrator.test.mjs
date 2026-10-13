import test from 'node:test';
import assert from 'node:assert/strict';
import { runAutonomousLlmInvestigation } from '../../src/server/orchestrator/llm-investigator.ts';
import { ingestLlmEvaluation } from '../../src/core/diagnostics/llm/llm-ingestion.ts';

test('llm-investigator: autonomously completes multi-turn investigation with evidence graph', async () => {
  const jsonl = [
    JSON.stringify({
      case_id: 'c1',
      prompt: 'What are office hours?',
      response: 'Office hours are 9 to 5 [doc_1]. Also we have secret alien bases [doc_fake].',
      reference_answer: 'Office hours are 9 AM to 5 PM Monday through Friday.',
      retrieved_context: [
        { id: 'doc_1', text: 'Office hours are 9 AM to 5 PM Monday through Friday.' },
      ],
      latency_ms: 320,
    }),
    JSON.stringify({
      case_id: 'c2',
      prompt: 'How to reset password?',
      response: 'Contact support hotline at 1-800-FAKE-NUM.',
      reference_answer: 'Go to Settings > Reset Password.',
      retrieved_context: [
        { id: 'doc_2', text: 'Go to Settings > Reset Password to trigger reset email.' },
      ],
      latency_ms: 280,
    }),
  ].join('\n');

  const { dataset } = ingestLlmEvaluation(jsonl, { filename: 'rag-failure.jsonl' });
  assert.ok(dataset);

  const state = await runAutonomousLlmInvestigation(dataset);

  // Check state invariants
  assert.equal(state.status, 'completed');
  assert.ok(state.roundsCompleted >= 3);
  assert.ok(state.toolCalls.length >= 2);
  assert.ok(state.toolResults.length >= 2);

  // Check evidence graph
  assert.ok(state.evidence.length >= 2);
  const baselineEv = state.evidence[0];
  assert.ok(baselineEv.measurements.length > 0);
  assert.equal(baselineEv.provenance.kind, 'tool_result');

  // Check hypothesis formulation
  assert.ok(state.hypotheses.length > 0);
  const hyp = state.hypotheses[0];
  assert.equal(hyp.status, 'supported');
  assert.equal(hyp.confidence.level, 'strong');
  assert.ok(hyp.evidence.length >= 2);

  // Check diagnosis finalization
  assert.ok(state.diagnosis);
  assert.equal(state.diagnosis.primaryHypothesisId, hyp.id);
  assert.ok(state.diagnosis.evidenceIds.length >= 1);
  assert.match(state.diagnosis.summary, /Autonomous investigation diagnosed/);
});

test('llm-investigator: executes prompt comparison when candidate records are supplied', async () => {
  const jsonl = [
    JSON.stringify({
      case_id: 'c1',
      prompt: 'Summarize policy',
      response: 'Unstructured prose instead of JSON.',
      reference_answer: '{"summary": "policy"}',
    }),
  ].join('\n');

  const { dataset } = ingestLlmEvaluation(jsonl);
  assert.ok(dataset);

  const candidateRecords = [
    {
      caseId: 'c1',
      prompt: 'Summarize policy',
      response: '{"summary": "policy"}',
      referenceAnswer: '{"summary": "policy"}',
    },
  ];

  const state = await runAutonomousLlmInvestigation(dataset, {
    candidatePromptRecords: candidateRecords,
  });

  assert.equal(state.status, 'completed');
  const compCall = state.toolCalls.find((c) => c.tool === 'compare_prompt_versions');
  assert.ok(compCall, 'compare_prompt_versions tool must have been called');

  const compResult = state.toolResults.find((r) => r.tool === 'compare_prompt_versions');
  assert.ok(compResult);
  assert.equal(compResult.status, 'completed');
  assert.equal(compResult.output?.candidateWinsCount, 1);
});
