import test from 'node:test';
import assert from 'node:assert/strict';
import { reEvaluateRepair } from '../../src/core/diagnostics/repair-reevaluation.ts';
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

test('reEvaluateRepair: compares baseline 0.50 vs repaired 0.19 on identical rows', () => {
  // 100 rows: 90 negatives, 10 positives
  // Positives: 7 at prob 0.40, 1 at 0.20, 2 at 0.80
  // Negatives: 86 at prob 0.10, 4 at 0.35
  const rows = [];
  for (let i = 0; i < 86; i++) rows.push({ actual: '0', predicted: '0', positiveProbability: 0.1 });
  for (let i = 0; i < 4; i++) rows.push({ actual: '0', predicted: '0', positiveProbability: 0.35 });
  for (let i = 0; i < 7; i++) rows.push({ actual: '1', predicted: '0', positiveProbability: 0.4 });
  rows.push({ actual: '1', predicted: '0', positiveProbability: 0.2 });
  for (let i = 0; i < 2; i++) rows.push({ actual: '1', predicted: '1', positiveProbability: 0.8 });

  const dataset = createMockDataset(rows);
  const repairId = createId('repair');
  const evId = createId('evidence');

  const report = reEvaluateRepair(dataset, {
    datasetId: dataset.metadata.id,
    repairId,
    positiveLabel: '1',
    baselineThreshold: 0.5,
    repairedThreshold: 0.19,
    criterion: {
      metric: 'recall',
      operator: 'at_least',
      value: 0.8,
      unit: 'ratio',
    },
    baselineEvidenceIds: [evId],
  });

  assert.equal(report.output.status, 'passed');
  assert.equal(report.output.criterionMet, true);

  // Baseline metrics:
  // TP=2, FN=8 -> Recall = 20%
  const baseRecall = report.output.baselineMetrics.find((m) => m.name === 'recall')?.value;
  assert.equal(baseRecall, 0.2);

  // Repaired metrics (at threshold 0.19):
  // All 10 positives have prob >= 0.19 -> TP=10, FN=0 -> Recall = 100%
  const repRecall = report.output.repairedMetrics.find((m) => m.name === 'recall')?.value;
  assert.equal(repRecall, 1.0);

  // Confusion deltas:
  // TP: +8 (from 2 to 10)
  // FN: -8 (from 8 to 0)
  // FP: +4 (the 4 negatives at 0.35 become positive)
  // TN: -4 (from 90 to 86)
  assert.equal(report.output.confusionDelta.truePositive, 8);
  assert.equal(report.output.confusionDelta.falseNegative, -8);
  assert.equal(report.output.confusionDelta.falsePositive, 4);
  assert.equal(report.output.confusionDelta.trueNegative, -4);
});
