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

  // Milestone M3: Single-cohort safeguard disclaimer
  assert.equal(report.validationMode, 'single_cohort_optimization');
  assert.equal(report.isHoldoutValidated, false);
  assert.ok(report.disclaimer.includes('Optimization Cohort Only'));
  assert.ok(report.limitations.some((l) => l.includes('[SAFEGUARD DISCLAIMER]')));
});

test('reEvaluateRepair: evaluates separate independent holdout dataset without contamination', () => {
  // Optimization dataset
  const optRows = [
    { actual: '0', predicted: '0', positiveProbability: 0.1 },
    { actual: '1', predicted: '0', positiveProbability: 0.4 },
  ];
  const optDataset = createMockDataset(optRows);

  // Independent Holdout dataset (distinct rows)
  const holdoutRows = [
    { actual: '0', predicted: '0', positiveProbability: 0.05 },
    { actual: '0', predicted: '0', positiveProbability: 0.15 },
    { actual: '1', predicted: '1', positiveProbability: 0.85 },
    { actual: '1', predicted: '0', positiveProbability: 0.35 },
  ];
  const holdoutDataset = createMockDataset(holdoutRows);

  const repairId = createId('repair');
  const evId = createId('evidence');

  const report = reEvaluateRepair(
    optDataset,
    {
      datasetId: optDataset.metadata.id,
      repairId,
      positiveLabel: '1',
      baselineThreshold: 0.5,
      repairedThreshold: 0.25,
      criterion: { metric: 'recall', operator: 'at_least', value: 0.5, unit: 'ratio' },
      baselineEvidenceIds: [evId],
    },
    holdoutDataset
  );

  assert.equal(report.validationMode, 'independent_holdout_validated');
  assert.equal(report.isHoldoutValidated, true);
  assert.equal(report.leakageWarning, undefined);
  assert.ok(report.holdoutResults);
  assert.equal(report.holdoutResults.sampleSize, 4);

  // On holdout:
  // Baseline (0.50): pos at 0.85 (TP=1), pos at 0.35 (FN=1) -> Recall = 50%
  // Repaired (0.25): pos at 0.85 (TP=1), pos at 0.35 (TP=1) -> Recall = 100%
  const hBaseRec = report.holdoutResults.baselineMetrics.find((m) => m.name === 'recall')?.value;
  const hRepRec = report.holdoutResults.repairedMetrics.find((m) => m.name === 'recall')?.value;
  assert.equal(hBaseRec, 0.5);
  assert.equal(hRepRec, 1.0);
});

test('reEvaluateRepair: detects holdout data contamination and emits leakage warning', () => {
  const rows = [
    { actual: '0', predicted: '0', positiveProbability: 0.1 },
    { actual: '1', predicted: '0', positiveProbability: 0.4 },
  ];
  const optDataset = createMockDataset(rows);
  // Re-using identical dataset as holdout
  const contaminatedHoldout = { ...optDataset };

  const repairId = createId('repair');
  const evId = createId('evidence');

  const report = reEvaluateRepair(
    optDataset,
    {
      datasetId: optDataset.metadata.id,
      repairId,
      positiveLabel: '1',
      baselineThreshold: 0.5,
      repairedThreshold: 0.2,
      criterion: { metric: 'recall', operator: 'at_least', value: 0.5, unit: 'ratio' },
      baselineEvidenceIds: [evId],
    },
    contaminatedHoldout
  );

  assert.ok(report.leakageWarning);
  assert.ok(report.leakageWarning.includes('Contamination Warning'));
  assert.equal(report.isHoldoutValidated, false);
});
