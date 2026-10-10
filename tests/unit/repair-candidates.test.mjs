import test from 'node:test';
import assert from 'node:assert/strict';
import { generateRepairCandidate } from '../../src/core/diagnostics/repair-candidates.ts';
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

test('generateRepairCandidate: satisfies target recall constraint while maximizing precision', () => {
  // 10 positives, 90 negatives
  const rows = [];
  for (let i = 0; i < 86; i++) rows.push({ actual: '0', predicted: '0', positiveProbability: 0.1 });
  for (let i = 0; i < 4; i++) rows.push({ actual: '0', predicted: '0', positiveProbability: 0.35 });
  for (let i = 0; i < 7; i++) rows.push({ actual: '1', predicted: '0', positiveProbability: 0.4 });
  rows.push({ actual: '1', predicted: '0', positiveProbability: 0.2 });
  for (let i = 0; i < 2; i++) rows.push({ actual: '1', predicted: '1', positiveProbability: 0.8 });

  const dataset = createMockDataset(rows);
  const hypId = createId('hypothesis');

  // Request target recall >= 0.8 (80%)
  const report = generateRepairCandidate(dataset, {
    datasetId: dataset.metadata.id,
    hypothesisId: hypId,
    positiveLabel: '1',
    targetMetric: 'recall',
    targetValue: 0.8,
    costs: null,
    criterion: {
      metric: 'recall',
      operator: 'at_least',
      value: 0.8,
      unit: 'ratio',
    },
  });

  const projectedRecall = report.output.projectedMetrics.find((m) => m.name === 'recall')?.value;
  assert.ok(projectedRecall !== undefined);
  assert.ok(projectedRecall >= 0.8, `Projected recall ${projectedRecall} must be >= 0.8`);
  // Threshold should be <= 0.40 (to capture the 7 positives at 0.40 and 2 at 0.80 = 9/10 = 90% recall)
  assert.ok(report.output.selectedThreshold <= 0.40);
});

test('generateRepairCandidate: optimizes operating threshold under cost matrix', () => {
  const rows = [];
  for (let i = 0; i < 86; i++) rows.push({ actual: '0', predicted: '0', positiveProbability: 0.1 });
  for (let i = 0; i < 4; i++) rows.push({ actual: '0', predicted: '0', positiveProbability: 0.35 });
  for (let i = 0; i < 7; i++) rows.push({ actual: '1', predicted: '0', positiveProbability: 0.4 });
  rows.push({ actual: '1', predicted: '0', positiveProbability: 0.2 });
  for (let i = 0; i < 2; i++) rows.push({ actual: '1', predicted: '1', positiveProbability: 0.8 });

  const dataset = createMockDataset(rows);
  const hypId = createId('hypothesis');
  const assumpId = createId('evidence');
  const assumption = {
    id: assumpId,
    kind: 'assumption',
    description: 'Clinical FN cost 20x higher than FP cost',
    measurements: [],
    provenance: {
      kind: 'source',
      sourceId: dataset.source.id,
      datasetId: dataset.metadata.id,
      rows: null,
      columns: [],
    },
  };

  const report = generateRepairCandidate(
    dataset,
    {
      datasetId: dataset.metadata.id,
      hypothesisId: hypId,
      positiveLabel: '1',
      targetMetric: 'cost',
      targetValue: null,
      costs: {
        falseNegativeCost: 20,
        falsePositiveCost: 1,
        assumptionEvidenceId: assumpId,
      },
      criterion: {
        metric: 'recall',
        operator: 'at_least',
        value: 0.8,
        unit: 'ratio',
      },
    },
    [assumption]
  );

  // Under FN cost 20 and FP cost 1, missing a cancer is penalised heavily (20) vs false alarm (1).
  // At threshold ~0.19, all 10 cancers are captured (or 9 cancers), reducing FN to 0 or 1.
  assert.ok(report.output.selectedThreshold < 0.35, 'Threshold should shift low to avoid high FN costs');
  assert.ok(report.output.rationale.includes('minimizes total expected misclassification cost'));
});
