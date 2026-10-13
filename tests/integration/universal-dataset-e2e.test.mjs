import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Diagnostics & Ingestion
import {
  ingestEvaluationCsv,
  previewEvaluationCsv,
} from '../../src/core/diagnostics/evaluation-ingestion.ts';
import {
  evaluateCapabilities,
  inferColumnMapping,
  detectTaskType,
} from '../../src/core/diagnostics/capability.ts';
import { profileEvaluationDataset } from '../../src/core/diagnostics/dataset-profiler.ts';
import { evaluateClassification } from '../../src/core/diagnostics/classification-metrics.ts';

// Autonomous Orchestration & Providers
import { runAutonomousInvestigation } from '../../src/server/orchestrator/investigator.ts';
import { OfflineInvestigatorProvider } from '../../src/server/orchestrator/provider-offline.ts';
import { deriveInvestigationStage } from '../../src/core/investigation/state-machine.ts';

// Repair Lab & Code Generation
import { generatePolicyCodeSnippets } from '../../src/server/repair/code-generator.ts';
import { RepairRegistry } from '../../src/server/repair/repair-registry.ts';

// Export & Reports
import { generateIncidentReport } from '../../src/server/export/incident-report.ts';
import { buildIncidentReportPdf } from '../../src/server/export/pdf-generator.ts';
import { exportIncidentReportToMarkdown } from '../../src/server/export/markdown-export.ts';

// Multi-Format Adapters & Security Guards
import {
  parseAnyTabularDataset,
  UnsupportedFormatError,
} from '../../src/core/diagnostics/format-adapters.ts';
import {
  trainExperimentalBaseline,
  EXPERIMENTAL_BASELINE_DISCLAIMER,
} from '../../src/core/inference/baseline-trainer.ts';

const fixturesDir = join(process.cwd(), 'public', 'fixtures');

// =========================================================================
// SCENARIO A: Full Supervised Evaluation (Target + Prediction + Probability)
// =========================================================================
test('Milestone D6 [Scenario A]: Supervised dataset executes complete 6-stage lifecycle', async () => {
  const csvContent = readFileSync(join(fixturesDir, 'melanoma-synthetic.csv'), 'utf8');

  // 1. Preview & Capability evaluation
  const preview = previewEvaluationCsv(csvContent, 'melanoma-synthetic.csv');
  assert.equal(preview.capabilities.taskType, 'binary_classification');
  assert.equal(preview.capabilities.isSupportedForInvestigation, true);

  const binCap = preview.capabilities.items.find((i) => i.id === 'binary_metrics');
  assert.equal(binCap?.status, 'available');
  const sweepCap = preview.capabilities.items.find((i) => i.id === 'threshold_sweep');
  assert.equal(sweepCap?.status, 'available');

  // 2. Autonomous Astra Investigation Loop
  const dataset = ingestEvaluationCsv(csvContent, 'melanoma-synthetic.csv');
  const offlineProvider = new OfflineInvestigatorProvider();
  let investigation = null;
  for await (const event of runAutonomousInvestigation(dataset, { provider: offlineProvider, maxRounds: 6 })) {
    if (event.type === 'completed') {
      investigation = event.investigation;
    }
  }

  assert.ok(investigation, 'Investigation must complete successfully');
  assert.equal(investigation.status, 'completed');
  assert.ok(investigation.toolResults.length >= 4);

  // Verifies threshold sweep tool was invoked and embedded
  const sweepResult = investigation.toolResults.find((r) => r.tool === 'threshold_sweep');
  assert.ok(sweepResult);
  assert.equal(sweepResult.status, 'completed');
  assert.equal(sweepResult.output.points.length, 101);

  // 3. State machine progression
  assert.equal(deriveInvestigationStage(investigation), 'report');

  // 4. Certified Incident Report & Vector PDF Export
  const report = generateIncidentReport(investigation);
  assert.equal(report.modality, 'tabular');
  assert.ok(report.cryptographicDigest.startsWith('sha256:'));

  const pdfBytes = buildIncidentReportPdf(report);
  assert.ok(pdfBytes instanceof Uint8Array);
  const pdfString = Buffer.from(pdfBytes).toString('binary');
  assert.ok(pdfString.startsWith('%PDF-1.4'));
  assert.ok(pdfString.includes('%%EOF'));
});

// =========================================================================
// SCENARIO B: Real-World Labeled Dataset without Predictions (kaggle_stroke)
// =========================================================================
test('Milestone D6 [Scenario B]: Dataset-only investigation executes with zero hallucinated metrics', async () => {
  const csvContent = readFileSync(join(fixturesDir, 'kaggle_stroke_dataset.csv'), 'utf8');

  // 1. Ingestion with explicit confirmed target
  const preview = previewEvaluationCsv(csvContent, 'kaggle_stroke_dataset.csv');
  const mapping = inferColumnMapping(
    preview.columns.map((c) => c.name),
    preview.columns,
    { targetColumn: 'stroke' }
  );
  const caps = evaluateCapabilities(preview.columns, mapping);

  // Verifies honest capability manifest
  const dataQualityCap = caps.items.find((i) => i.id === 'data_quality');
  assert.equal(dataQualityCap?.status, 'available');
  const leakageCap = caps.items.find((i) => i.id === 'feature_leakage');
  assert.equal(leakageCap?.status, 'available');

  const binMetricsCap = caps.items.find((i) => i.id === 'binary_metrics');
  assert.equal(binMetricsCap?.status, 'missing_evidence');
  const sweepCap = caps.items.find((i) => i.id === 'threshold_sweep');
  assert.equal(sweepCap?.status, 'unavailable');

  // 2. Autonomous Investigation for Dataset Intelligence
  const strokeDataset = ingestEvaluationCsv(csvContent, 'kaggle_stroke_dataset.csv', {
    columnMapping: mapping,
  });
  const offlineProvider = new OfflineInvestigatorProvider();
  let inv = null;
  for await (const event of runAutonomousInvestigation(strokeDataset, { provider: offlineProvider, maxRounds: 6 })) {
    if (event.type === 'completed') {
      inv = event.investigation;
    }
  }

  assert.ok(inv, 'Dataset-only investigation must complete');
  assert.equal(inv.status, 'completed');

  // Strictly verify model-only tools were NEVER hallucinated or called
  const calledTools = inv.toolCalls.map((c) => c.tool);
  assert.ok(calledTools.includes('profile_dataset'));
  assert.ok(calledTools.includes('scan_feature_leakage'));
  assert.ok(!calledTools.includes('compute_classification_metrics'));
  assert.ok(!calledTools.includes('threshold_sweep'));
  assert.ok(!calledTools.includes('check_calibration'));

  // 3. Stage 05 Data Curation Policy
  const curationSnippets = generatePolicyCodeSnippets({
    policyId: 'pol_curation_stroke_d6',
    modality: 'data_curation',
    suggestedThreshold: 0.5,
    rule: 'Median Imputation + IQR Outlier Clipping',
    rationale: 'Clean missing numeric features and protect against extreme outliers.',
  });

  assert.ok(curationSnippets.python.includes('curate_dataset'));
  assert.ok(curationSnippets.python.includes('AUTOMATED_DEPLOYMENT_PROHIBITED'));
  assert.ok(curationSnippets.typescript.includes('curateRecord'));
  assert.ok(curationSnippets.typescript.includes('DATA_CURATION_POLICY'));

  // 4. Certified Export with Dataset Intelligence Profile
  const report = generateIncidentReport(inv);
  assert.ok(report.datasetAudit);
  assert.ok(report.datasetAudit.rowCount > 1000);
  assert.ok(report.datasetAudit.classImbalanceRatio > 1.0);
  assert.equal(report.datasetAudit.minorityClassLabel, '1');

  const pdfBytes = buildIncidentReportPdf(report);
  const pdfString = Buffer.from(pdfBytes).toString('binary');
  assert.ok(pdfString.startsWith('%PDF-1.4'));
  assert.ok(pdfString.includes('Dataset Intelligence'));
});

// =========================================================================
// SCENARIO C & D: Unlabeled Dataset & Prediction-Only Audit
// =========================================================================
test('Milestone D6 [Scenario C & D]: Unlabeled and prediction-only datasets route accurately', () => {
  // Scenario C: Unlabeled features
  const unlabeledCsv = [
    'sensor_1,sensor_2,temperature,location',
    '10.2,4.5,22.1,chicago',
    '11.0,4.8,23.0,chicago',
    '9.8,4.1,21.5,austin',
  ].join('\n');

  const unlPreview = previewEvaluationCsv(unlabeledCsv, 'sensors.csv');
  assert.equal(unlPreview.capabilities.taskType, 'unsupervised_profiling');
  assert.equal(unlPreview.capabilities.isSupportedForInvestigation, true);

  // Scenario D: Prediction-only outputs
  const predOnlyCsv = [
    'patient_id,model_prediction,confidence_score',
    'pt_01,1,0.92',
    'pt_02,0,0.15',
    'pt_03,1,0.78',
  ].join('\n');

  const predPreview = previewEvaluationCsv(predOnlyCsv, 'inferences.csv');
  assert.equal(predPreview.capabilities.taskType, 'prediction_audit');
  assert.equal(predPreview.capabilities.isSupportedForInvestigation, true);
});

// =========================================================================
// SCENARIO E: Nonstandard Column Names with Custom Mapping
// =========================================================================
test('Milestone D6 [Scenario E]: Ingests nonstandard column names with full diagnostic execution', () => {
  const customCsv = [
    'record_uuid,ground_truth_label,model_class_guess,output_confidence,facility',
    'u-001,malignant,malignant,0.94,site_alpha',
    'u-002,benign,benign,0.06,site_alpha',
    'u-003,malignant,benign,0.42,site_beta',
    'u-004,benign,malignant,0.71,site_beta',
  ].join('\n');

  const dataset = ingestEvaluationCsv(customCsv, 'custom-clinic.csv', {
    columnMapping: {
      targetColumn: 'ground_truth_label',
      predictionColumn: 'model_class_guess',
      probabilityColumn: 'output_confidence',
      idColumn: 'record_uuid',
      sliceColumns: ['facility'],
    },
    labels: { positive: 'malignant', negative: 'benign' },
  });

  assert.equal(dataset.metadata.targetColumn, 'ground_truth_label');
  assert.equal(dataset.metadata.predictionColumn, 'model_class_guess');
  assert.equal(dataset.metadata.probabilityColumn, 'output_confidence');
  assert.equal(dataset.rows.length, 4);

  const metricsReport = evaluateClassification(dataset, {
    datasetId: dataset.metadata.id,
    positiveLabel: 'malignant',
  });

  assert.equal(metricsReport.output.sampleSize, 4);
  const acc = metricsReport.output.metrics.find((m) => m.name === 'accuracy');
  assert.equal(acc?.value, 0.5);
});

// =========================================================================
// SCENARIO F: Format Ingestion Expansion (TSV, Excel, Parquet)
// =========================================================================
test('Milestone D6 [Scenario F]: Multi-format ingestion hub processes TSV transparently', () => {
  const tsvData = [
    'patient_id\tage\tstroke_risk',
    'p_1\t67\t1',
    'p_2\t45\t0',
    'p_3\t52\t0',
    'p_4\t71\t1',
  ].join('\n');

  const parsed = parseAnyTabularDataset(tsvData, 'stroke_cohort.tsv');
  assert.equal(parsed.format, 'tsv');
  assert.equal(parsed.totalRows, 4);
  assert.deepEqual(parsed.headers, ['patient_id', 'age', 'stroke_risk']);
  assert.equal(parsed.records[0].patient_id, 'p_1');

  // Verify CWE-502 rejection of pickled formats
  assert.throws(
    () => parseAnyTabularDataset(Buffer.from('pickle_bytes'), 'weights.joblib'),
    (err) => err instanceof UnsupportedFormatError
  );
});

// =========================================================================
// SCENARIO G: Edge Cases (Single-Class Target, Extreme Imbalance, NaNs)
// =========================================================================
test('Milestone D6 [Scenario G]: Edge-case robustness (single-class, extreme imbalance, NaNs)', () => {
  // 1. Single-class evaluation (all true labels identical)
  const singleClassCsv = [
    'actual,pred,prob',
    '1,1,0.9',
    '1,1,0.85',
    '1,0,0.4',
    '1,1,0.7',
  ].join('\n');

  const scDataset = ingestEvaluationCsv(singleClassCsv, 'single-class.csv', {
    labels: { positive: '1', negative: '0' },
  });

  const scMetrics = evaluateClassification(scDataset, {
    datasetId: scDataset.metadata.id,
    positiveLabel: '1',
  });

  // Accuracy succeeds, ROC-AUC is cleanly undefined without crashing
  const scAcc = scMetrics.output.metrics.find((m) => m.name === 'accuracy');
  assert.equal(scAcc?.value, 0.75);
  const scRoc = scMetrics.output.metrics.find((m) => m.name === 'roc_auc');
  assert.equal(scRoc?.status, 'undefined');

  // 2. Severe class imbalance: 1 positive out of 100
  const imbalancedRows = [
    { target: '1', score: 0.95 },
    ...new Array(99).fill(null).map((_, i) => ({ target: '0', score: 0.1 + (i % 10) * 0.02 })),
  ];

  const baseline = trainExperimentalBaseline({
    datasetName: 'imbalanced.csv',
    rows: imbalancedRows,
    targetColumn: 'target',
    positiveLabel: '1',
    negativeLabel: '0',
    seed: 42,
    optInConfirmed: true,
  });

  assert.equal(baseline.isExperimentalBaseline, true);
  assert.ok(baseline.holdoutMetrics.accuracy > 0.8);
  assert.equal(baseline.disclaimer, EXPERIMENTAL_BASELINE_DISCLAIMER);
});
