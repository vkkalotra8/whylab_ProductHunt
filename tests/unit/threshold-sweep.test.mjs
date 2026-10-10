import test from 'node:test';
import assert from 'node:assert/strict';
import { runThresholdSweep } from '../../src/core/diagnostics/threshold-sweep.ts';
import { createId } from '../../src/core/domain/primitives.ts';

function createMockDataset(rows) {
  const dsId = createId('dataset');
  const srcId = createId('source');
  return {
    schemaVersion: 1,
    metadata: {
      id: dsId,
      sourceId: srcId,
      name: 'test.csv',
      rowCount: rows.length,
      columns: ['y_true', 'y_pred', 'y_probability'],
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
      attributes: {},
    })),
    warnings: [],
  };
}

test('runThresholdSweep: points monotonic behavior across thresholds', () => {
  const dataset = createMockDataset([
    { actual: '1', predicted: '1', positiveProbability: 0.9 },
    { actual: '1', predicted: '0', positiveProbability: 0.4 },
    { actual: '0', predicted: '0', positiveProbability: 0.3 },
    { actual: '0', predicted: '0', positiveProbability: 0.1 },
  ]);

  const thresholds = [0.0, 0.2, 0.35, 0.5, 0.8, 1.0];
  const report = runThresholdSweep(dataset, {
    datasetId: dataset.metadata.id,
    positiveLabel: '1',
    thresholds,
    costs: null,
  });

  assert.equal(report.output.points.length, thresholds.length);

  // As threshold increases, predicted positives (TP + FP) must be monotonically non-increasing
  let prevPositives = Infinity;
  for (const point of report.output.points) {
    const predictedPositives = point.confusion.truePositive + point.confusion.falsePositive;
    assert.ok(
      predictedPositives <= prevPositives,
      `Positives at threshold ${point.threshold} (${predictedPositives}) must be <= previous (${prevPositives})`
    );
    prevPositives = predictedPositives;
  }
});

test('runThresholdSweep: cost minimization selects appropriate operating point', () => {
  const dataset = createMockDataset([
    // Overlapping distribution to test FP vs FN trade-offs:
    // Positive 1: 0.3, Positive 2: 0.8
    // Negative 1: 0.4 (false alarm if threshold < 0.4), Negative 2: 0.1
    { actual: '1', predicted: '0', positiveProbability: 0.3 },
    { actual: '1', predicted: '1', positiveProbability: 0.8 },
    { actual: '0', predicted: '0', positiveProbability: 0.4 },
    { actual: '0', predicted: '0', positiveProbability: 0.1 },
  ]);

  const assumpId = createId('evidence');
  const assumption = {
    id: assumpId,
    kind: 'assumption',
    description: 'Clinical FN cost is 10x higher than FP cost',
    measurements: [],
    provenance: {
      kind: 'source',
      sourceId: dataset.source.id,
      datasetId: dataset.metadata.id,
      rows: null,
      columns: [],
    },
  };

  // High FN cost (10 vs 1): Should pick lower threshold to avoid FN
  const highFnCosts = {
    falseNegativeCost: 10,
    falsePositiveCost: 1,
    assumptionEvidenceId: assumpId,
  };

  const reportHighFn = runThresholdSweep(
    dataset,
    {
      datasetId: dataset.metadata.id,
      positiveLabel: '1',
      thresholds: [0.1, 0.25, 0.5, 0.9],
      costs: highFnCosts,
    },
    [assumption]
  );

  // At threshold 0.25: row with prob 0.3 is predicted positive -> TP=2, FN=0, FP=1, cost = 0*10 + 1*1 = 1.
  // At threshold 0.50: row with prob 0.3 is predicted negative -> TP=1, FN=1, FP=0, cost = 1*10 + 0*1 = 10.
  assert.equal(reportHighFn.output.selectedThreshold, 0.25);

  // High FP cost (1 vs 10): Should pick higher threshold to avoid FP
  const highFpCosts = {
    falseNegativeCost: 1,
    falsePositiveCost: 10,
    assumptionEvidenceId: assumpId,
  };

  const reportHighFp = runThresholdSweep(
    dataset,
    {
      datasetId: dataset.metadata.id,
      positiveLabel: '1',
      thresholds: [0.1, 0.25, 0.5, 0.9],
      costs: highFpCosts,
    },
    [assumption]
  );

  // At threshold 0.50: cost = 1*1 + 0*10 = 1.
  // At threshold 0.25: cost = 0*1 + 1*10 = 10.
  assert.equal(reportHighFp.output.selectedThreshold, 0.5);
});
