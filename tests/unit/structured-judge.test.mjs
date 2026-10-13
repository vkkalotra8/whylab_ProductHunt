import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateWithRubric,
  applyHumanReview,
  summarizeJudgeResults,
  EPISTEMIC_DISCLAIMER,
} from '../../src/core/diagnostics/llm/structured-judge.ts';

test('structured-judge: produces structured output with mandatory epistemic disclaimer', () => {
  const result = evaluateWithRubric('c1', 'prompt', 'response', 'factual_correctness', {
    simulatedScore: 5,
    simulatedConfidence: 0.95,
  });

  assert.equal(result.caseId, 'c1');
  assert.equal(result.score, 5);
  assert.equal(result.confidence, 0.95);
  assert.equal(result.epistemicStatus, 'simulated_model_judgment');
  assert.equal(result.disclaimer, EPISTEMIC_DISCLAIMER);
  assert.equal(result.status, 'CONFIRMED');
});

test('structured-judge: routes low confidence evaluations to human review queue', () => {
  const result = evaluateWithRubric('c2', 'prompt', 'uncertain response', 'factual_correctness', {
    simulatedScore: 4,
    simulatedConfidence: 0.62, // below 0.70 threshold
  });

  assert.equal(result.status, 'NEEDS_HUMAN_REVIEW');
  assert.match(result.humanReviewReason ?? '', /below acceptable autonomous threshold/);
});

test('structured-judge: routes borderline scores (2 and 3) to human review queue', () => {
  const result = evaluateWithRubric('c3', 'prompt', 'partial response', 'factual_correctness', {
    simulatedScore: 3,
    simulatedConfidence: 0.85,
  });

  assert.equal(result.status, 'NEEDS_HUMAN_REVIEW');
  assert.match(result.humanReviewReason ?? '', /Borderline evaluation score \(3\/5\)/);
});

test('structured-judge: human operator approval signs off case with audit trail', () => {
  const initial = evaluateWithRubric('c4', 'prompt', 'response', 'factual_correctness', {
    simulatedScore: 3,
    simulatedConfidence: 0.65,
  });
  assert.equal(initial.status, 'NEEDS_HUMAN_REVIEW');

  const reviewed = applyHumanReview(initial, 'Alice (Lead MLE)', 'approved');
  assert.equal(reviewed.status, 'CONFIRMED');
  assert.equal(reviewed.humanReviewReason, undefined);
  assert.ok(reviewed.operatorReview);
  assert.equal(reviewed.operatorReview.reviewedBy, 'Alice (Lead MLE)');
  assert.equal(reviewed.operatorReview.action, 'approved');
  assert.equal(reviewed.operatorReview.finalScore, 3);
});

test('structured-judge: human operator override updates final score and notes', () => {
  const initial = evaluateWithRubric('c5', 'prompt', 'response', 'factual_correctness', {
    simulatedScore: 2,
    simulatedConfidence: 0.60,
  });

  const overridden = applyHumanReview(
    initial,
    'Bob (Clinician)',
    'overridden',
    4,
    'Medical terminology was clinically valid upon second review.'
  );

  assert.equal(overridden.status, 'CONFIRMED');
  assert.equal(overridden.score, 4);
  assert.equal(overridden.operatorReview?.action, 'overridden');
  assert.equal(overridden.operatorReview?.finalScore, 4);
  assert.match(overridden.operatorReview?.notes ?? '', /clinically valid/);
});

test('structured-judge: summarizes distribution and confirmation rates', () => {
  const r1 = evaluateWithRubric('c1', 'p', 'r', 'factual_correctness', { simulatedScore: 5, simulatedConfidence: 0.9 });
  const r2 = evaluateWithRubric('c2', 'p', 'r', 'factual_correctness', { simulatedScore: 2, simulatedConfidence: 0.8 });
  const r3 = evaluateWithRubric('c3', 'p', 'r', 'factual_correctness', { simulatedScore: 1, simulatedConfidence: 0.95 });

  const summary = summarizeJudgeResults([r1, r2, r3]);
  assert.equal(summary.totalEvaluated, 3);
  assert.equal(summary.confirmedCount, 2); // 5 and 1 are confirmed
  assert.equal(summary.needsReviewCount, 1); // 2 is borderline
  assert.equal(summary.scoreDistribution[5], 1);
  assert.equal(summary.scoreDistribution[2], 1);
  assert.equal(summary.scoreDistribution[1], 1);
  assert.ok(summary.averageScore > 0);
});
