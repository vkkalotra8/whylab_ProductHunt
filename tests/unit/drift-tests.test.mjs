import test from 'node:test';
import assert from 'node:assert/strict';
import { runDriftTests } from '../../src/core/diagnostics/drift-tests.ts';
import { createId } from '../../src/core/domain/primitives.ts';

function createMockDataset(rows, attributes = {}) {
  const dsId = createId('dataset');
  const srcId = createId('source');
  return {
    schemaVersion: 1,
    metadata: {
      id: dsId,
      sourceId: srcId,
      name: 'test.csv',
      rowCount: rows.length,
      columns: ['y_true', 'y_pred', 'y_probability', ...Object.keys(attributes)],
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
      name: 'test.csv',
      capturedAt: '2026-10-07T12:00:00.000Z',
      contentDigest: null,
    },
    labels: { positive: '1', negative: '0' },
    rows: rows.map((r, i) => ({
      sourceRow: i + 1,
      actual: r.actual,
      predicted: r.predicted,
      positiveProbability: r.positiveProbability,
      attributes: Object.fromEntries(
        Object.entries(attributes).map(([k, vals]) => [k, vals[i]])
      ),
    })),
    warnings: [],
  };
}

test('runDriftTests: Kolmogorov-Smirnov distance is 0 on identical distributions', () => {
  const rows = [
    { actual: '1', predicted: '1', positiveProbability: 0.9 },
    { actual: '1', predicted: '1', positiveProbability: 0.7 },
    { actual: '0', predicted: '0', positiveProbability: 0.3 },
    { actual: '0', predicted: '0', positiveProbability: 0.1 },
  ];

  const ref = createMockDataset(rows);
  const comp = createMockDataset(rows);

  const report = runDriftTests(ref, comp, {
    referenceDatasetId: ref.metadata.id,
    comparisonDatasetId: comp.metadata.id,
    columns: ['y_probability'],
    method: 'ks',
    bins: null,
  });

  assert.equal(report.output.comparisons.length, 1);
  const stat = report.output.comparisons[0].statistic;
  assert.equal(stat.status, 'measured');
  assert.equal(stat.value, 0, 'KS statistic between identical distributions must be 0');
});

test('runDriftTests: detects distribution shift via Wasserstein distance', () => {
  // Reference has low probabilities [0.1, 0.2]
  const refRows = [
    { actual: '0', predicted: '0', positiveProbability: 0.1 },
    { actual: '0', predicted: '0', positiveProbability: 0.2 },
  ];
  // Comparison has high probabilities [0.8, 0.9]
  const compRows = [
    { actual: '1', predicted: '1', positiveProbability: 0.8 },
    { actual: '1', predicted: '1', positiveProbability: 0.9 },
  ];

  const ref = createMockDataset(refRows);
  const comp = createMockDataset(compRows);

  const report = runDriftTests(ref, comp, {
    referenceDatasetId: ref.metadata.id,
    comparisonDatasetId: comp.metadata.id,
    columns: ['y_probability'],
    method: 'wasserstein',
    bins: null,
  });

  const stat = report.output.comparisons[0].statistic;
  assert.equal(stat.status, 'measured');
  // Expected Wasserstein distance between [0.1, 0.2] and [0.8, 0.9] is ~0.7
  assert.ok(Math.abs(stat.value - 0.7) < 1e-6);
});

test('runDriftTests: computes PSI with explicit bin count', () => {
  const refRows = [
    { actual: '0', predicted: '0', positiveProbability: 0.1 },
    { actual: '0', predicted: '0', positiveProbability: 0.2 },
    { actual: '1', predicted: '1', positiveProbability: 0.8 },
    { actual: '1', predicted: '1', positiveProbability: 0.9 },
  ];
  const compRows = [
    { actual: '0', predicted: '0', positiveProbability: 0.15 },
    { actual: '0', predicted: '0', positiveProbability: 0.25 },
    { actual: '1', predicted: '1', positiveProbability: 0.75 },
    { actual: '1', predicted: '1', positiveProbability: 0.85 },
  ];

  const ref = createMockDataset(refRows);
  const comp = createMockDataset(compRows);

  const report = runDriftTests(ref, comp, {
    referenceDatasetId: ref.metadata.id,
    comparisonDatasetId: comp.metadata.id,
    columns: ['y_probability'],
    method: 'psi',
    bins: 4,
  });

  const stat = report.output.comparisons[0].statistic;
  assert.equal(stat.status, 'measured');
  assert.ok(stat.value >= 0);
});
