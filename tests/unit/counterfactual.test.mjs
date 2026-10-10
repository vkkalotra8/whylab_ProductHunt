import test from 'node:test';
import assert from 'node:assert/strict';
import { runCounterfactualTest } from '../../src/core/diagnostics/counterfactual.ts';
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

test('runCounterfactualTest: accurately detects and supports accuracy paradox hypothesis', () => {
  // Imbalanced dataset: 90 negatives, 10 positives
  // Model predicts negative almost always:
  // - 90/90 negatives correct
  // - 2/10 positives correct (8 false negatives)
  // Raw accuracy = 92/100 = 92%
  // Minority recall = 2/10 = 20%
  // Balanced accuracy = (1.0 + 0.2) / 2 = 60%
  // Accuracy - Balanced Accuracy = 92 - 60 = 32 pp
  // Accuracy - Minority Recall = 92 - 20 = 72 pp
  // Gap = min(32, 72) = 32 pp
  const rows = [];
  for (let i = 0; i < 90; i++) {
    rows.push({ actual: '0', predicted: '0', positiveProbability: 0.1 });
  }
  for (let i = 0; i < 8; i++) {
    rows.push({ actual: '1', predicted: '0', positiveProbability: 0.4 });
  }
  for (let i = 0; i < 2; i++) {
    rows.push({ actual: '1', predicted: '1', positiveProbability: 0.8 });
  }

  const dataset = createMockDataset(rows);
  const hypId = createId('hypothesis');
  const expId = createId('experiment');
  const evId = createId('evidence');
  const callId = createId('call');

  const result = runCounterfactualTest(
    dataset,
    {
      datasetId: dataset.metadata.id,
      positiveLabel: '1',
      hypothesisId: hypId,
      method: 'accuracy_paradox',
      seed: 42,
      criterion: {
        metric: 'accuracy_paradox_gap',
        operator: 'at_least',
        value: 10,
        unit: 'percentage_points',
      },
    },
    { experimentId: expId, evidenceId: evId, callId }
  );

  assert.equal(result.output.outcome, 'supports');

  const gap = result.output.comparison.find((m) => m.name === 'accuracy_paradox_gap');
  assert.equal(gap.status, 'measured');
  assert.ok(Math.abs(gap.value - 32.0) < 1e-6);

  const balancedAcc = result.output.baseline.find((m) => m.name === 'balanced_accuracy');
  assert.equal(balancedAcc.status, 'measured');
  assert.equal(balancedAcc.value, 0.60);
});

test('runCounterfactualTest: rejects hypothesis when dataset has no paradox gap', () => {
  // Imbalanced dataset (3 negatives, 1 positive) where model performs perfectly on the minority class
  const rows = [
    { actual: '1', predicted: '1', positiveProbability: 0.9 },
    { actual: '0', predicted: '0', positiveProbability: 0.2 },
    { actual: '0', predicted: '0', positiveProbability: 0.1 },
    { actual: '0', predicted: '0', positiveProbability: 0.15 },
  ];

  const dataset = createMockDataset(rows);
  const hypId = createId('hypothesis');
  const expId = createId('experiment');
  const evId = createId('evidence');
  const callId = createId('call');

  const result = runCounterfactualTest(
    dataset,
    {
      datasetId: dataset.metadata.id,
      positiveLabel: '1',
      hypothesisId: hypId,
      method: 'accuracy_paradox',
      seed: 42,
      criterion: {
        metric: 'accuracy_paradox_gap',
        operator: 'at_least',
        value: 10,
        unit: 'percentage_points',
      },
    },
    { experimentId: expId, evidenceId: evId, callId }
  );

  // Raw accuracy = 100%, Balanced accuracy = 100%, Minority recall = 100%
  // Gap = 0 pp < 10 pp criterion -> rejects!
  assert.equal(result.output.outcome, 'rejects');
});

test('runCounterfactualTest: yields inconclusive when class sizes are identical (no unique minority class)', () => {
  const rows = [
    { actual: '1', predicted: '1', positiveProbability: 0.9 },
    { actual: '0', predicted: '0', positiveProbability: 0.1 },
  ];

  const dataset = createMockDataset(rows);
  const hypId = createId('hypothesis');
  const expId = createId('experiment');
  const evId = createId('evidence');
  const callId = createId('call');

  const result = runCounterfactualTest(
    dataset,
    {
      datasetId: dataset.metadata.id,
      positiveLabel: '1',
      hypothesisId: hypId,
      method: 'accuracy_paradox',
      seed: 42,
      criterion: {
        metric: 'accuracy_paradox_gap',
        operator: 'at_least',
        value: 10,
        unit: 'percentage_points',
      },
    },
    { experimentId: expId, evidenceId: evId, callId }
  );

  assert.equal(result.output.outcome, 'inconclusive');
});
