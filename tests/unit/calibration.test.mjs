import test from 'node:test';
import assert from 'node:assert/strict';
import { checkCalibration } from '../../src/core/diagnostics/calibration.ts';
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

test('checkCalibration: calculates Brier score and calibration bins correctly', () => {
  const dataset = createMockDataset([
    { actual: '1', predicted: '1', positiveProbability: 0.9 },
    { actual: '1', predicted: '1', positiveProbability: 0.8 },
    { actual: '0', predicted: '0', positiveProbability: 0.1 },
    { actual: '0', predicted: '0', positiveProbability: 0.2 },
  ]);

  const report = checkCalibration(dataset, {
    datasetId: dataset.metadata.id,
    positiveLabel: '1',
    bins: 5,
    strategy: 'equal_width',
  });

  assert.equal(report.status, 'completed');
  assert.ok(report.output !== null);

  const brier = report.output.metrics.find((m) => m.name === 'brier_score');
  assert.equal(brier.status, 'measured');

  // Manual Brier score:
  // (0.9 - 1)^2 = 0.01
  // (0.8 - 1)^2 = 0.04
  // (0.1 - 0)^2 = 0.01
  // (0.2 - 0)^2 = 0.04
  // Mean = (0.01 + 0.04 + 0.01 + 0.04) / 4 = 0.10 / 4 = 0.025
  assert.ok(Math.abs(brier.value - 0.025) < 1e-6);

  const ece = report.output.metrics.find((m) => m.name === 'expected_calibration_error');
  assert.equal(ece.status, 'measured');
  assert.ok(ece.value >= 0 && ece.value <= 1);
});

test('checkCalibration: handles equal_frequency quantile binning', () => {
  const dataset = createMockDataset([
    { actual: '1', predicted: '1', positiveProbability: 0.9 },
    { actual: '1', predicted: '1', positiveProbability: 0.7 },
    { actual: '0', predicted: '0', positiveProbability: 0.3 },
    { actual: '0', predicted: '0', positiveProbability: 0.1 },
  ]);

  const report = checkCalibration(dataset, {
    datasetId: dataset.metadata.id,
    positiveLabel: '1',
    bins: 2,
    strategy: 'equal_frequency',
  });

  assert.equal(report.status, 'completed');
  assert.equal(report.output.bins.length, 2);
  assert.equal(report.output.bins[0].sampleSize, 2);
  assert.equal(report.output.bins[1].sampleSize, 2);
});
