import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runAdversarialReview } from '../../src/core/falsification/adversarial-review.ts';
import { ingestEvaluationCsv } from '../../src/core/diagnostics/evaluation-ingestion.ts';
import { runFlagshipMelanomaInvestigation } from '../../src/core/diagnostics/flagship-melanoma.ts';

const fixturesDir = join(process.cwd(), 'public', 'fixtures');

test('adversarial review: Flagship Melanoma diagnosis is defended against all rival hypotheses', () => {
  const investigation = runFlagshipMelanomaInvestigation();
  const csvContent = readFileSync(join(fixturesDir, 'melanoma-synthetic.csv'), 'utf8');
  const dataset = ingestEvaluationCsv(csvContent, 'melanoma-synthetic.csv', {
    labels: { positive: '1', negative: '0' },
  });

  const audit = runAdversarialReview({ dataset, investigation });

  assert.equal(audit.defenseStatus, 'defended');
  assert.equal(audit.challenges.length, 5);
  assert.ok(audit.defenseScore >= 80);

  // Challenge 1: Covariate Shift -> Refuted (single congruent cohort)
  const shiftCh = audit.challenges.find((c) => c.id === 'challenge_covariate_shift');
  assert.ok(shiftCh !== undefined);
  assert.equal(shiftCh.verdict, 'refuted');

  // Challenge 2: Feature Leakage -> Refuted (no target proxy)
  const leakCh = audit.challenges.find((c) => c.id === 'challenge_feature_leakage');
  assert.ok(leakCh !== undefined);
  assert.equal(leakCh.verdict, 'refuted');

  // Challenge 3: Probability Miscalibration -> Refuted (ECE is well within 10%)
  const calibCh = audit.challenges.find((c) => c.id === 'challenge_calibration_drift');
  assert.ok(calibCh !== undefined);
  assert.equal(calibCh.verdict, 'refuted');

  // Challenge 4: Subgroup Disparity -> Inconclusive (no demographic/site metadata columns)
  const sliceCh = audit.challenges.find((c) => c.id === 'challenge_subgroup_disparity');
  assert.ok(sliceCh !== undefined);
  assert.equal(sliceCh.verdict, 'inconclusive');

  // Challenge 5: Small-Sample Noise -> Refuted (N=100 with tight 95% CI)
  const noiseCh = audit.challenges.find((c) => c.id === 'challenge_overfitting_artifact');
  assert.ok(noiseCh !== undefined);
  assert.equal(noiseCh.verdict, 'refuted');
  assert.equal(noiseCh.sampleSizeFloorProtected, false);

  assert.ok(audit.executiveSummary.includes('successfully defended'));
});

test('adversarial review: overconfident-classifier.csv correctly upholds miscalibration rival', () => {
  const csvContent = readFileSync(join(fixturesDir, 'overconfident-classifier.csv'), 'utf8');
  const dataset = ingestEvaluationCsv(csvContent, 'overconfident-classifier.csv', {
    labels: { positive: '1', negative: '0' },
  });

  const audit = runAdversarialReview({ dataset });

  const calibCh = audit.challenges.find((c) => c.id === 'challenge_calibration_drift');
  assert.ok(calibCh !== undefined);
  assert.equal(calibCh.verdict, 'upheld'); // Miscalibration is upheld!
  assert.ok(calibCh.testStatistic.value !== null && calibCh.testStatistic.value >= 0.15);

  assert.equal(audit.defenseStatus, 'vulnerable');
  assert.ok(audit.upheldCount >= 1);
});

test('adversarial review: site-failure.csv detects compound subgroup disparity with protected sample size', () => {
  const csvContent = readFileSync(join(fixturesDir, 'site-failure.csv'), 'utf8');
  const dataset = ingestEvaluationCsv(csvContent, 'site-failure.csv', {
    labels: { positive: '1', negative: '0' },
  });

  const audit = runAdversarialReview({ dataset, minimumSampleSizeFloor: 30 });

  const sliceCh = audit.challenges.find((c) => c.id === 'challenge_subgroup_disparity');
  assert.ok(sliceCh !== undefined);
  assert.equal(sliceCh.verdict, 'compound_factor');
  assert.ok(sliceCh.testStatistic.value !== null && sliceCh.testStatistic.value >= 20.0);

  // Subgroup disparity is identified as compound factor
  assert.equal(audit.defenseStatus, 'compound_risk');
  assert.ok(audit.compoundCount >= 1);
  assert.ok(audit.multiSiteReport !== null);
  assert.equal(audit.multiSiteReport.floorViolations.length, 1);
});
