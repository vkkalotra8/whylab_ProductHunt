import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ingestEvaluationCsv,
  previewEvaluationCsv,
  EvaluationValidationError,
} from '../../src/core/diagnostics/evaluation-ingestion.ts';
import {
  evaluateCapabilities,
  inferColumnMapping,
  inferBinaryLabels,
  detectTaskType,
} from '../../src/core/diagnostics/capability.ts';
import { profileEvaluationDataset } from '../../src/core/diagnostics/dataset-profiler.ts';
import { evaluateClassification } from '../../src/core/diagnostics/classification-metrics.ts';

test('custom dataset: ingests CSV with custom column names (actual, prediction, probability)', () => {
  const csv = [
    'sample_id,actual,prediction,probability,hospital_site',
    'id_1,malignant,malignant,0.92,site_alpha',
    'id_2,benign,benign,0.08,site_alpha',
    'id_3,malignant,benign,0.41,site_beta',
    'id_4,benign,malignant,0.67,site_beta',
  ].join('\n');

  const dataset = ingestEvaluationCsv(csv, 'custom-clinic.csv', {
    columnMapping: {
      targetColumn: 'actual',
      predictionColumn: 'prediction',
      probabilityColumn: 'probability',
      idColumn: 'sample_id',
    },
    labels: { positive: 'malignant', negative: 'benign' },
  });

  assert.equal(dataset.metadata.targetColumn, 'actual');
  assert.equal(dataset.metadata.predictionColumn, 'prediction');
  assert.equal(dataset.metadata.probabilityColumn, 'probability');
  assert.equal(dataset.labels.positive, 'malignant');
  assert.equal(dataset.labels.negative, 'benign');
  assert.equal(dataset.rows.length, 4);
  assert.equal(dataset.rows[0].actual, 'malignant');
  assert.equal(dataset.rows[0].predicted, 'malignant');
  assert.equal(dataset.rows[0].positiveProbability, 0.92);
  assert.equal(dataset.rows[0].attributes.hospital_site, 'site_alpha');

  // Verify profiler runs cleanly on custom column names
  const profile = profileEvaluationDataset(dataset);
  assert.equal(profile.rowCount, 4);
  assert.ok(profile.columns.some((c) => c.name === 'actual' && c.role === 'target'));
  assert.ok(profile.columns.some((c) => c.name === 'prediction' && c.role === 'prediction'));
  assert.ok(profile.columns.some((c) => c.name === 'probability' && c.role === 'probability'));

  // Verify classification metrics calculate cleanly
  const metricsReport = evaluateClassification(dataset, {
    datasetId: dataset.metadata.id,
    positiveLabel: 'malignant',
  });
  assert.ok(metricsReport.output);
  assert.equal(metricsReport.output.sampleSize, 4);
});

test('custom dataset: ingests CSV without probability scores (label-only)', () => {
  const csv = [
    'ground_truth,model_pred,site',
    '1,1,A',
    '1,0,A',
    '0,0,B',
    '0,1,B',
  ].join('\n');

  const dataset = ingestEvaluationCsv(csv, 'labels-only.csv', {
    columnMapping: {
      targetColumn: 'ground_truth',
      predictionColumn: 'model_pred',
      probabilityColumn: null,
    },
  });

  assert.equal(dataset.metadata.probabilityColumn, null);
  assert.equal(dataset.rows[0].positiveProbability, null);
  assert.equal(dataset.rows[1].positiveProbability, null);

  // Discrete metrics succeed
  const metricsReport = evaluateClassification(dataset, {
    datasetId: dataset.metadata.id,
    positiveLabel: '1',
  });
  assert.ok(metricsReport.output);
  assert.equal(metricsReport.output.sampleSize, 4);
  const acc = metricsReport.output.metrics.find((m) => m.name === 'accuracy');
  assert.ok(acc);
  assert.equal(acc.status, 'measured');
  assert.equal(acc.value, 0.5);

  // Probabilistic metrics yield undefined without crashing
  const rocAuc = metricsReport.output.metrics.find((m) => m.name === 'roc_auc');
  assert.ok(rocAuc);
  assert.equal(rocAuc.status, 'undefined');
});

test('custom dataset: previewEvaluationCsv detects schema, mapping heuristics, and capabilities', () => {
  const csv = [
    'case_id,ground_truth,model_output,confidence,region',
    'c_101,1,1,0.85,north',
    'c_102,0,0,0.12,north',
    'c_103,1,0,0.45,south',
    'c_104,0,0,0.05,south',
  ].join('\n');

  const preview = previewEvaluationCsv(csv, 'cases.csv');
  assert.equal(preview.totalRows, 4);
  assert.equal(preview.previewRows.length, 4);
  assert.equal(preview.inferredMapping.targetColumn, 'ground_truth');
  assert.equal(preview.inferredMapping.predictionColumn, 'model_output');
  assert.equal(preview.inferredMapping.probabilityColumn, 'confidence');
  assert.ok(preview.inferredMapping.sliceColumns.includes('region'));

  assert.equal(preview.capabilities.taskType, 'binary_classification');
  assert.equal(preview.capabilities.isSupportedForInvestigation, true);

  const binMetricsCap = preview.capabilities.items.find((i) => i.id === 'binary_metrics');
  assert.equal(binMetricsCap.status, 'available');

  const probCap = preview.capabilities.items.find((i) => i.id === 'probability_metrics');
  assert.equal(probCap.status, 'available');

  const sliceCap = preview.capabilities.items.find((i) => i.id === 'slice_evaluation');
  assert.equal(sliceCap.status, 'available');
});

test('custom dataset: detects unsupported multiclass and regression tasks', () => {
  // Multiclass
  const multiclassCsv = [
    'target,pred',
    'cat,cat',
    'dog,dog',
    'bird,bird',
  ].join('\n');

  const mcPreview = previewEvaluationCsv(multiclassCsv, 'animals.csv');
  assert.equal(mcPreview.capabilities.taskType, 'multiclass_classification');
  assert.equal(mcPreview.capabilities.isSupportedForInvestigation, false);
  assert.ok(mcPreview.capabilities.unsupportedReason.includes('Multiclass classification'));

  // Raw features no predictions
  const rawCsv = [
    'feature_1,feature_2,y_true',
    '1.2,3.4,1',
    '2.1,1.1,0',
  ].join('\n');

  const rawPreview = previewEvaluationCsv(rawCsv, 'raw.csv');
  assert.equal(rawPreview.capabilities.taskType, 'raw_features_no_predictions');
  assert.equal(rawPreview.capabilities.isSupportedForInvestigation, false);
});

test('custom dataset: rejects invalid files with actionable error messages', () => {
  // Empty CSV
  assert.throws(
    () => ingestEvaluationCsv('', 'empty.csv'),
    (err) => err instanceof EvaluationValidationError
  );

  // Missing target column
  assert.throws(
    () => ingestEvaluationCsv('col_a,col_b\n1,2', 'missing.csv', {
      columnMapping: { targetColumn: 'y_true', predictionColumn: 'col_a' },
    }),
    (err) => err instanceof EvaluationValidationError && err.issues[0].code === 'required_column'
  );

  // Invalid probability value
  assert.throws(
    () => ingestEvaluationCsv('y_true,y_pred,y_probability\n1,1,1.5', 'bad_prob.csv'),
    (err) => err instanceof EvaluationValidationError && err.issues[0].code === 'probability'
  );
});
