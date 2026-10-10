import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeClassificationMetrics,
  metricsFromConfusion,
} from '../../src/core/diagnostics/classification-metrics.ts';

test('metricsFromConfusion: perfect classification', () => {
  const metrics = metricsFromConfusion({
    truePositive: 50,
    falsePositive: 0,
    trueNegative: 50,
    falseNegative: 0,
  });

  const get = (name) => metrics.find((m) => m.name === name);

  assert.equal(get('accuracy').value, 1.0);
  assert.equal(get('precision').value, 1.0);
  assert.equal(get('recall').value, 1.0);
  assert.equal(get('specificity').value, 1.0);
  assert.equal(get('f1').value, 1.0);
  assert.equal(get('balanced_accuracy').value, 1.0);
  assert.equal(get('positive_prevalence').value, 0.5);
});

test('metricsFromConfusion: zero positive predictions (all predicted negative)', () => {
  const metrics = metricsFromConfusion({
    truePositive: 0,
    falsePositive: 0,
    trueNegative: 90,
    falseNegative: 10,
  });

  const get = (name) => metrics.find((m) => m.name === name);

  assert.equal(get('accuracy').value, 0.90);
  assert.equal(get('recall').value, 0.0);
  assert.equal(get('specificity').value, 1.0);
  assert.equal(get('balanced_accuracy').value, 0.50);
  // Precision has 0 predicted positives -> undefined with reason
  assert.equal(get('precision').status, 'undefined');
  assert.ok(get('precision').reason.includes('No predicted positive examples'));
  // F1 has 0 TP but 10 FN -> 2*0 / (2*0 + 0 + 10) = 0.0
  assert.equal(get('f1').status, 'measured');
  assert.equal(get('f1').value, 0.0);
});

test('computeClassificationMetrics: evaluates dataset with probability scores and AUCs', () => {
  const data = {
    labels: { positive: '1', negative: '0' },
    rows: [
      { actual: '1', predicted: '1', positiveProbability: 0.9 },
      { actual: '1', predicted: '1', positiveProbability: 0.8 },
      { actual: '1', predicted: '0', positiveProbability: 0.4 },
      { actual: '0', predicted: '0', positiveProbability: 0.2 },
      { actual: '0', predicted: '0', positiveProbability: 0.1 },
    ],
  };

  const report = computeClassificationMetrics(data);
  const get = (name) => report.output.metrics.find((m) => m.name === name);

  assert.equal(report.output.confusion.truePositive, 2);
  assert.equal(report.output.confusion.falseNegative, 1);
  assert.equal(report.output.confusion.trueNegative, 2);
  assert.equal(report.output.confusion.falsePositive, 0);

  assert.equal(get('accuracy').value, 4 / 5);
  assert.equal(get('recall').value, 2 / 3);
  assert.equal(get('specificity').value, 1.0);
  assert.ok(get('roc_auc').value > 0.9);
  assert.ok(get('pr_auc_average_precision').value > 0.8);
});

test('computeClassificationMetrics: single-class evaluation yields undefined AUC without crashing', () => {
  const data = {
    labels: { positive: '1', negative: '0' },
    rows: [
      { actual: '0', predicted: '0', positiveProbability: 0.2 },
      { actual: '0', predicted: '0', positiveProbability: 0.1 },
    ],
  };

  const report = computeClassificationMetrics(data);
  const get = (name) => report.output.metrics.find((m) => m.name === name);

  assert.equal(get('roc_auc').status, 'undefined');
  assert.ok(get('roc_auc').reason.includes('Both true classes must be present'));
  assert.equal(get('pr_auc_average_precision').status, 'undefined');
});

test('computeClassificationMetrics: probability tie handling is permutation independent', () => {
  // Two datasets with identical rows in different permutation order of tied probabilities
  const rowsA = [
    { actual: '1', predicted: '1', positiveProbability: 0.5 },
    { actual: '0', predicted: '0', positiveProbability: 0.5 },
    { actual: '1', predicted: '1', positiveProbability: 0.9 },
    { actual: '0', predicted: '0', positiveProbability: 0.1 },
  ];
  const rowsB = [
    { actual: '0', predicted: '0', positiveProbability: 0.5 },
    { actual: '1', predicted: '1', positiveProbability: 0.5 },
    { actual: '1', predicted: '1', positiveProbability: 0.9 },
    { actual: '0', predicted: '0', positiveProbability: 0.1 },
  ];

  const reportA = computeClassificationMetrics({ labels: { positive: '1', negative: '0' }, rows: rowsA });
  const reportB = computeClassificationMetrics({ labels: { positive: '1', negative: '0' }, rows: rowsB });

  const rocA = reportA.output.metrics.find((m) => m.name === 'roc_auc').value;
  const rocB = reportB.output.metrics.find((m) => m.name === 'roc_auc').value;
  assert.equal(rocA, rocB, 'ROC-AUC must be invariant to permutations of tied probability scores');

  const prA = reportA.output.metrics.find((m) => m.name === 'pr_auc_average_precision').value;
  const prB = reportB.output.metrics.find((m) => m.name === 'pr_auc_average_precision').value;
  assert.equal(prA, prB, 'PR-AUC must be invariant to permutations of tied probability scores');
});
