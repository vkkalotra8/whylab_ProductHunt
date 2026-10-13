import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateVisionRobustness } from '../../src/core/diagnostics/vision/robustness-evaluator.ts';

test('robustness-evaluator: safely marks evaluation as UNAVAILABLE when perturbations are omitted', () => {
  const records = [
    { imageId: '1', yTrue: '1', yPred: '1', metadata: {} },
    { imageId: '2', yTrue: '0', yPred: '0', metadata: {} },
  ];

  const report = evaluateVisionRobustness(records);

  assert.equal(report.status, 'UNAVAILABLE');
  assert.ok(report.unavailabilityNotice?.includes('ROBUSTNESS_EVALUATION_UNAVAILABLE'));
  assert.ok(report.offlineGenerationGuide?.includes('Security Invariant'));
  assert.ok(report.offlineGenerationGuide?.includes('prohibits arbitrary server-side execution'));
});

test('robustness-evaluator: calculates decay curve and flags vulnerability when perturbations exist', () => {
  const records = [
    { imageId: '1', yTrue: '1', yPred: '1', metadata: { pred_noise_1: '1', pred_noise_2: '0', pred_noise_3: '0' } },
    { imageId: '2', yTrue: '1', yPred: '1', metadata: { pred_noise_1: '1', pred_noise_2: '1', pred_noise_3: '0' } },
    { imageId: '3', yTrue: '0', yPred: '0', metadata: { pred_noise_1: '0', pred_noise_2: '0', pred_noise_3: '0' } },
    { imageId: '4', yTrue: '0', yPred: '0', metadata: { pred_noise_1: '0', pred_noise_2: '1', pred_noise_3: '1' } },
  ];

  const report = evaluateVisionRobustness(records, { perturbationPrefix: 'pred_noise_' });

  assert.equal(report.status, 'EVALUATED');
  assert.equal(report.cleanAccuracy, 1.0); // 4/4 clean
  assert.equal(report.decayCurve?.length, 3);

  // Noise 1: 4/4 = 1.0
  assert.equal(report.decayCurve[0].accuracy, 1.0);
  assert.equal(report.decayCurve[0].accuracyDropFromClean, 0.0);

  // Noise 2: 2/4 = 0.5 (drop = 0.5)
  assert.equal(report.decayCurve[1].accuracy, 0.5);
  assert.equal(report.decayCurve[1].accuracyDropFromClean, 0.5);

  // Noise 3: 1/4 = 0.25 (drop = 0.75)
  assert.equal(report.decayCurve[2].accuracy, 0.25);
  assert.equal(report.decayCurve[2].accuracyDropFromClean, 0.75);

  assert.equal(report.isVulnerableToPerturbation, true);
});
