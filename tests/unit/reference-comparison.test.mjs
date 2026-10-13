import test from 'node:test';
import assert from 'node:assert/strict';
import { runDriftTests } from '../../src/core/diagnostics/drift-tests.ts';
import { evaluateClassification } from '../../src/core/diagnostics/classification-metrics.ts';
import { checkCalibration } from '../../src/core/diagnostics/calibration.ts';
import { createId } from '../../src/core/domain/primitives.ts';

const TOLERANCE = 1e-5;

function assertClose(actual, expected, message = '') {
  const diff = Math.abs(actual - expected);
  assert.ok(
    diff <= TOLERANCE,
    `${message} Expected ${expected} +/- ${TOLERANCE}, but got ${actual} (diff: ${diff.toExponential(3)})`
  );
}

function createEvalDataset(rows, columns = ['y_true', 'y_pred', 'y_probability']) {
  const dsId = createId('dataset');
  const srcId = createId('source');
  return {
    schemaVersion: 1,
    metadata: {
      id: dsId,
      sourceId: srcId,
      name: 'reference_benchmark.csv',
      rowCount: rows.length,
      columns,
      role: 'evaluation',
      task: 'binary_classification',
      targetColumn: 'y_true',
      predictionColumn: 'y_pred',
      probabilityColumn: 'y_probability',
      positiveLabel: '1',
    },
    source: {
      id: srcId,
      kind: 'uploaded_file',
      name: 'reference_benchmark.csv',
      capturedAt: '2026-10-10T12:00:00.000Z',
      contentDigest: null,
    },
    labels: { positive: '1', negative: '0' },
    rows: rows.map((r, i) => ({
      sourceRow: i + 1,
      actual: r.actual,
      predicted: r.predicted ?? (r.positiveProbability >= 0.5 ? '1' : '0'),
      positiveProbability: r.positiveProbability,
      attributes: r.attributes ?? {},
    })),
    warnings: [],
  };
}

// 1. ROC-AUC Reference Comparison
test('reference benchmark: ROC-AUC matches exact Wilcoxon rank sum reference value within 1e-5', () => {
  // Positives: 0.9, 0.7, 0.6, 0.2
  // Negatives: 0.8, 0.4, 0.3, 0.1
  // Exact Mann-Whitney AUC = 11 / 16 = 0.68750
  const rows = [
    { actual: '1', positiveProbability: 0.9 },
    { actual: '0', positiveProbability: 0.8 },
    { actual: '1', positiveProbability: 0.7 },
    { actual: '1', positiveProbability: 0.6 },
    { actual: '0', positiveProbability: 0.4 },
    { actual: '0', positiveProbability: 0.3 },
    { actual: '1', positiveProbability: 0.2 },
    { actual: '0', positiveProbability: 0.1 },
  ];

  const dataset = createEvalDataset(rows);
  const result = evaluateClassification(dataset, {
    datasetId: dataset.metadata.id,
    positiveLabel: '1',
  });

  const rocAuc = result.output.metrics.find((m) => m.name === 'roc_auc')?.value;
  assert.ok(typeof rocAuc === 'number');
  assertClose(rocAuc, 0.6875, 'ROC-AUC calculation');

  // Balanced Accuracy:
  // Threshold 0.5:
  // Positives >= 0.5: 0.9, 0.7, 0.6 -> TP = 3, FN = 1 -> Recall = 3/4 = 0.75
  // Negatives < 0.5: 0.4, 0.3, 0.1 -> TN = 3, FP = 1 (0.8) -> Specificity = 3/4 = 0.75
  // Balanced Accuracy = (0.75 + 0.75) / 2 = 0.75000
  const ba = result.output.metrics.find((m) => m.name === 'balanced_accuracy')?.value;
  assert.ok(typeof ba === 'number');
  assertClose(ba, 0.75, 'Balanced accuracy');
});

test('reference benchmark: ROC-AUC = 1.00000 on perfectly separable distribution', () => {
  const rows = [
    { actual: '1', positiveProbability: 0.99 },
    { actual: '1', positiveProbability: 0.85 },
    { actual: '0', positiveProbability: 0.2 },
    { actual: '0', positiveProbability: 0.05 },
  ];

  const dataset = createEvalDataset(rows);
  const result = evaluateClassification(dataset, {
    datasetId: dataset.metadata.id,
    positiveLabel: '1',
  });

  const rocAuc = result.output.metrics.find((m) => m.name === 'roc_auc')?.value;
  assertClose(rocAuc, 1.0, 'Perfect separation ROC-AUC');
});

// 2. Brier Score Reference Comparison
test('reference benchmark: Brier score matches exact Scikit-Learn brier_score_loss within 1e-5', () => {
  // y_true = [1, 1, 0, 0]
  // y_prob = [0.90, 0.80, 0.20, 0.10]
  // MSE = (0.01 + 0.04 + 0.04 + 0.01) / 4 = 0.02500
  const rows = [
    { actual: '1', positiveProbability: 0.9 },
    { actual: '1', positiveProbability: 0.8 },
    { actual: '0', positiveProbability: 0.2 },
    { actual: '0', positiveProbability: 0.1 },
  ];

  const dataset = createEvalDataset(rows);
  const report = checkCalibration(dataset, {
    datasetId: dataset.metadata.id,
    positiveLabel: '1',
    bins: 10,
    strategy: 'equal_width',
  });

  assert.equal(report.status, 'completed');
  const brierScore = report.output?.metrics.find((m) => m.name === 'brier_score')?.value;
  assert.ok(typeof brierScore === 'number');
  assertClose(brierScore, 0.025, 'Brier score calculation');
});

// 3. Kolmogorov-Smirnov (KS-2samp) Reference Comparison
test('reference benchmark: two-sample KS statistic matches exact SciPy ks_2samp within 1e-5', () => {
  // Sample X = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  // Sample Y = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
  // Max eCDF distance D = 0.50000
  const xRows = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => ({
    actual: '0',
    positiveProbability: 0.1,
    attributes: { feature_val: String(v) },
  }));

  const yRows = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((v) => ({
    actual: '0',
    positiveProbability: 0.1,
    attributes: { feature_val: String(v) },
  }));

  const refDs = createEvalDataset(xRows, ['y_true', 'y_pred', 'y_probability', 'feature_val']);
  const compDs = createEvalDataset(yRows, ['y_true', 'y_pred', 'y_probability', 'feature_val']);

  const driftReport = runDriftTests(refDs, compDs, {
    referenceDatasetId: refDs.metadata.id,
    comparisonDatasetId: compDs.metadata.id,
    columns: ['feature_val'],
    method: 'ks',
    bins: null,
  });

  const ksStat = driftReport.output.comparisons[0]?.statistic.value;
  assert.ok(typeof ksStat === 'number');
  assertClose(ksStat, 0.5, 'Two-sample Kolmogorov-Smirnov statistic');
});

test('reference benchmark: KS statistic = 0.00000 on identical distributions', () => {
  const rows = [10, 20, 30, 40, 50].map((v) => ({
    actual: '0',
    positiveProbability: 0.1,
    attributes: { score: String(v) },
  }));

  const ds1 = createEvalDataset(rows, ['y_true', 'y_pred', 'y_probability', 'score']);
  const ds2 = createEvalDataset(rows, ['y_true', 'y_pred', 'y_probability', 'score']);

  const report = runDriftTests(ds1, ds2, {
    referenceDatasetId: ds1.metadata.id,
    comparisonDatasetId: ds2.metadata.id,
    columns: ['score'],
    method: 'ks',
    bins: null,
  });

  const ksStat = report.output.comparisons[0]?.statistic.value;
  assertClose(ksStat, 0.0, 'Identical distribution KS statistic');
});

// 4. Wasserstein Distance Reference Comparison
test('reference benchmark: Wasserstein-1 distance matches exact shift integral within 1e-5', () => {
  // Uniform shift: X = [1, 2, 3, 4], Y = [2, 3, 4, 5]
  // Shift delta is exactly 1.0 unit across the whole distribution -> W1 = 1.00000
  const xRows = [1, 2, 3, 4].map((v) => ({
    actual: '0',
    positiveProbability: 0.1,
    attributes: { measurement: String(v) },
  }));

  const yRows = [2, 3, 4, 5].map((v) => ({
    actual: '0',
    positiveProbability: 0.1,
    attributes: { measurement: String(v) },
  }));

  const ds1 = createEvalDataset(xRows, ['y_true', 'y_pred', 'y_probability', 'measurement']);
  const ds2 = createEvalDataset(yRows, ['y_true', 'y_pred', 'y_probability', 'measurement']);

  const report = runDriftTests(ds1, ds2, {
    referenceDatasetId: ds1.metadata.id,
    comparisonDatasetId: ds2.metadata.id,
    columns: ['measurement'],
    method: 'wasserstein',
    bins: null,
  });

  const w1Stat = report.output.comparisons[0]?.statistic.value;
  assert.ok(typeof w1Stat === 'number');
  assertClose(w1Stat, 1.0, 'Wasserstein-1 distance');
});

// 5. Population Stability Index (PSI) Reference Comparison
test('reference benchmark: PSI = 0.00000 on identical distributions with explicit bins', () => {
  const rows = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((v) => ({
    actual: '0',
    positiveProbability: 0.1,
    attributes: { feature: String(v) },
  }));

  const ds1 = createEvalDataset(rows, ['y_true', 'y_pred', 'y_probability', 'feature']);
  const ds2 = createEvalDataset(rows, ['y_true', 'y_pred', 'y_probability', 'feature']);

  const report = runDriftTests(ds1, ds2, {
    referenceDatasetId: ds1.metadata.id,
    comparisonDatasetId: ds2.metadata.id,
    columns: ['feature'],
    method: 'psi',
    bins: 5,
  });

  const psiStat = report.output.comparisons[0]?.statistic.value;
  assert.ok(typeof psiStat === 'number');
  assertClose(psiStat, 0.0, 'PSI on identical distribution');
});
