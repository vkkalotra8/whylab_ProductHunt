import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ingestEvaluationCsv } from '../../src/core/diagnostics/evaluation-ingestion.ts';
import { dispatchDiagnosticTool } from '../../src/server/orchestrator/dispatcher.ts';
import { createId } from '../../src/core/domain/primitives.ts';

const melanomaCsv = readFileSync(
  join(process.cwd(), 'public', 'fixtures', 'melanoma-synthetic.csv'),
  'utf8'
);

const dataset = ingestEvaluationCsv(melanomaCsv, 'melanoma-synthetic.csv', {
  datasetId: createId('dataset'),
  sourceId: createId('source'),
  labels: { positive: '1', negative: '0' },
});

const invId = createId('investigation');

test('dispatcher: profile_dataset executes cleanly and returns profile output', async () => {
  const result = await dispatchDiagnosticTool(
    dataset,
    'profile_dataset',
    { datasetId: dataset.metadata.id, targetColumn: 'y_true' },
    { investigationId: invId }
  );

  assert.equal(result.result.status, 'completed');
  assert.equal(result.result.tool, 'profile_dataset');
  if (result.result.status === 'completed') {
    assert.equal(result.result.output.rowCount, dataset.metadata.rowCount);
    assert.ok(result.result.output.columns.length > 0);
  }
});

test('dispatcher: compute_classification_metrics returns metrics and produces Evidence artifact', async () => {
  const result = await dispatchDiagnosticTool(
    dataset,
    'compute_classification_metrics',
    { datasetId: dataset.metadata.id, positiveLabel: '1' },
    { investigationId: invId }
  );

  assert.equal(result.result.status, 'completed');
  assert.equal(result.result.tool, 'compute_classification_metrics');
  assert.ok(result.artifacts?.evidence?.length === 1);
  const ev = result.artifacts.evidence[0];
  assert.equal(ev.kind, 'measurement');
  assert.ok(ev.measurements.length > 0);
});

test('dispatcher: run_counterfactual_test produces VerificationExperiment and Evidence', async () => {
  const hypId = createId('hypothesis');
  const result = await dispatchDiagnosticTool(
    dataset,
    'run_counterfactual_test',
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
    { investigationId: invId, hypothesisId: hypId }
  );

  assert.equal(result.result.status, 'completed');
  assert.ok(result.artifacts?.experiment);
  assert.equal(result.artifacts.experiment.outcome, 'supports');
  assert.ok(result.artifacts?.evidence?.length === 1);
});

test('dispatcher: generate_repair_candidate and re_evaluate_repair produce valid repair & comparison', async () => {
  const hypId = createId('hypothesis');

  // Step 1: Generate repair
  const repairRes = await dispatchDiagnosticTool(
    dataset,
    'generate_repair_candidate',
    {
      datasetId: dataset.metadata.id,
      positiveLabel: '1',
      hypothesisId: hypId,
      targetMetric: 'recall',
      targetValue: 0.8,
      costs: null,
      criterion: {
        metric: 'recall',
        operator: 'at_least',
        value: 0.8,
        unit: 'ratio',
      },
    },
    { investigationId: invId, hypothesisId: hypId }
  );

  assert.equal(repairRes.result.status, 'completed');
  assert.ok(repairRes.artifacts?.repair);
  const repair = repairRes.artifacts.repair;
  assert.equal(repair.kind, 'operating_policy');

  // Step 2: Re-evaluate repair
  const baseEvId = createId('evidence');
  const reevalRes = await dispatchDiagnosticTool(
    dataset,
    're_evaluate_repair',
    {
      datasetId: dataset.metadata.id,
      positiveLabel: '1',
      repairId: repair.id,
      baselineThreshold: 0.5,
      repairedThreshold: repair.policy.threshold,
      criterion: {
        metric: 'recall',
        operator: 'at_least',
        value: 0.8,
        unit: 'ratio',
      },
      baselineEvidenceIds: [baseEvId],
    },
    { investigationId: invId }
  );

  assert.equal(reevalRes.result.status, 'completed');
  assert.ok(reevalRes.artifacts?.comparison);
  assert.equal(reevalRes.artifacts.comparison.status, 'passed');
});

test('dispatcher: safely captures invalid arguments as typed error without throwing', async () => {
  const result = await dispatchDiagnosticTool(
    dataset,
    'compute_classification_metrics',
    // Invalid positive label not matching dataset
    { datasetId: dataset.metadata.id, positiveLabel: 'UNKNOWN_CLASS' },
    { investigationId: invId }
  );

  assert.equal(result.result.status, 'error');
  if (result.result.status === 'error') {
    assert.ok(result.result.error.message.length > 0);
  }
});
