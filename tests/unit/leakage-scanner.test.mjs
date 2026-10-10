import test from 'node:test';
import assert from 'node:assert/strict';
import { scanFeatureLeakage } from '../../src/core/diagnostics/leakage-scanner.ts';
import { createId } from '../../src/core/domain/primitives.ts';

function createMockDatasetWithFeatures(rows, featureColumns) {
  const dsId = createId('dataset');
  const srcId = createId('source');
  return {
    schemaVersion: 1,
    metadata: {
      id: dsId,
      sourceId: srcId,
      name: 'test.csv',
      rowCount: rows.length,
      columns: ['y_true', 'y_pred', 'y_probability', ...Object.keys(featureColumns)],
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
        Object.entries(featureColumns).map(([k, vals]) => [k, vals[i]])
      ),
    })),
    warnings: [],
  };
}

test('scanFeatureLeakage: flags perfect correlation proxy target leakage', () => {
  // Feature 'direct_leak' is 100% correlated with y_true
  const rows = [
    { actual: '1', predicted: '1', positiveProbability: 0.9 },
    { actual: '1', predicted: '1', positiveProbability: 0.8 },
    { actual: '0', predicted: '0', positiveProbability: 0.2 },
    { actual: '0', predicted: '0', positiveProbability: 0.1 },
  ];
  const features = {
    direct_leak: ['1', '1', '0', '0'],
    safe_feature: ['22', '35', '40', '19'],
  };

  const dataset = createMockDatasetWithFeatures(rows, features);

  const report = scanFeatureLeakage(dataset, {
    datasetId: dataset.metadata.id,
    targetColumn: 'y_true',
    featureColumns: ['direct_leak', 'safe_feature'],
    predictionTimeColumn: null,
    outcomeTimeColumn: null,
    assumptionEvidenceIds: [],
  });

  const leakObservations = report.output.observations.filter((o) => o.feature === 'direct_leak');
  assert.ok(leakObservations.length > 0, 'Direct leak feature must produce observations');
  assert.ok(leakObservations.some((o) => o.method === 'exact_target_copy'), 'Must flag exact target copy');
  assert.ok(leakObservations.some((o) => o.classification === 'suspicion'), 'Must flag suspicion review');
});

test('scanFeatureLeakage: flags temporal ordering violations', () => {
  const rows = [
    { actual: '1', predicted: '1', positiveProbability: 0.9 },
    { actual: '0', predicted: '0', positiveProbability: 0.1 },
  ];
  // Prediction time is AFTER outcome time -> temporal leak!
  const features = {
    pred_time: ['2026-10-07T14:00:00Z', '2026-10-07T14:00:00Z'],
    outcome_time: ['2026-10-07T10:00:00Z', '2026-10-07T10:00:00Z'],
    age: ['45', '60'],
  };

  const dataset = createMockDatasetWithFeatures(rows, features);

  const report = scanFeatureLeakage(dataset, {
    datasetId: dataset.metadata.id,
    targetColumn: 'y_true',
    featureColumns: ['age'],
    predictionTimeColumn: 'pred_time',
    outcomeTimeColumn: 'outcome_time',
    assumptionEvidenceIds: [],
  });

  const timeObs = report.output.observations.find((o) => o.feature === 'pred_time');
  assert.ok(timeObs !== undefined, 'Prediction time after outcome time must produce an observation');
  assert.ok(
    timeObs.description.includes('place the outcome at or before prediction') ||
      timeObs.method === 'temporal_order'
  );
});
