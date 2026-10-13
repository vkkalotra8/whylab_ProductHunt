import test from 'node:test';
import assert from 'node:assert/strict';
import {
  comparePromptVersions,
  chiSquare1DfPValue,
} from '../../src/core/diagnostics/llm/prompt-comparison.ts';

test('prompt-comparison: calculates Chi-Square 1-df p-values accurately', () => {
  // Known reference points:
  // chi2 = 0 -> p = 1.0
  // chi2 = 3.841 -> p ≈ 0.05
  // chi2 = 6.635 -> p ≈ 0.01
  assert.equal(chiSquare1DfPValue(0), 1.0);
  assert.ok(Math.abs(chiSquare1DfPValue(3.841) - 0.05) < 0.005);
  assert.ok(Math.abs(chiSquare1DfPValue(6.635) - 0.01) < 0.002);
});

test('prompt-comparison: classifies paired outcomes into wins, regressions, both-pass and both-fail', () => {
  const baseline = [
    // c1: A failed, B will pass -> WIN
    { caseId: 'c1', prompt: 'p1', response: 'Wrong', referenceAnswer: 'Right', latencyMs: 200 },
    // c2: A passed, B will fail -> REGRESSION
    { caseId: 'c2', prompt: 'p2', response: 'Good', referenceAnswer: 'Good', latencyMs: 220 },
    // c3: A passed, B will pass -> BOTH_PASS
    { caseId: 'c3', prompt: 'p3', response: 'Yes', referenceAnswer: 'Yes', latencyMs: 180 },
    // c4: A failed, B will fail -> BOTH_FAIL
    { caseId: 'c4', prompt: 'p4', response: 'Bad1', referenceAnswer: 'Correct', latencyMs: 250 },
  ];

  const candidate = [
    { caseId: 'c1', prompt: 'p1', response: 'Right', referenceAnswer: 'Right', latencyMs: 190 },
    { caseId: 'c2', prompt: 'p2', response: 'Bad', referenceAnswer: 'Good', latencyMs: 210 },
    { caseId: 'c3', prompt: 'p3', response: 'Yes', referenceAnswer: 'Yes', latencyMs: 170 },
    { caseId: 'c4', prompt: 'p4', response: 'Bad2', referenceAnswer: 'Correct', latencyMs: 240 },
  ];

  const comparison = comparePromptVersions(baseline, candidate);

  assert.equal(comparison.pairedCasesCount, 4);
  assert.equal(comparison.candidateWinsCount, 1);
  assert.equal(comparison.candidateRegressionsCount, 1);
  assert.equal(comparison.bothPassCount, 1);
  assert.equal(comparison.bothFailCount, 1);
  assert.deepEqual(comparison.regressedCaseIds, ['c2']);

  // Check specific paired case detail
  const c2Pair = comparison.pairedCases.find((p) => p.caseId === 'c2');
  assert.equal(c2Pair?.outcome, 'CANDIDATE_REGRESSION');
  assert.equal(c2Pair?.baselinePassed, true);
  assert.equal(c2Pair?.candidatePassed, false);
});

test('prompt-comparison: detects significant prompt improvements with McNemar test', () => {
  // Construct 20 cases where Candidate wins 12 times and regresses 0 times
  const baseline = [];
  const candidate = [];

  for (let i = 1; i <= 20; i++) {
    const id = `case_${i}`;
    if (i <= 12) {
      // B wins
      baseline.push({ caseId: id, prompt: 'q', response: 'bad', referenceAnswer: 'good' });
      candidate.push({ caseId: id, prompt: 'q', response: 'good', referenceAnswer: 'good' });
    } else {
      // Both pass
      baseline.push({ caseId: id, prompt: 'q', response: 'good', referenceAnswer: 'good' });
      candidate.push({ caseId: id, prompt: 'q', response: 'good', referenceAnswer: 'good' });
    }
  }

  const res = comparePromptVersions(baseline, candidate);
  assert.equal(res.candidateWinsCount, 12);
  assert.equal(res.candidateRegressionsCount, 0);
  assert.equal(res.regressedCaseIds.length, 0);
  // McNemar: (|12 - 0| - 1)^2 / 12 = 121 / 12 = 10.08 > 3.84
  assert.ok(res.mcnemarStatistic > 9.0);
  assert.ok(res.mcnemarPValue < 0.01);
  assert.equal(res.isStatisticallySignificant, true);
  assert.ok(res.emDelta > 0.5);
});
