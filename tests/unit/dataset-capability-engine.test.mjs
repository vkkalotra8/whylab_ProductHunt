import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeDatasetCapabilityManifest,
  TOOL_PREREQUISITES,
} from '../../src/core/domain/capability-contracts.ts';
import {
  inferColumnMapping,
  evaluateCapabilities,
  getCapabilitiesFromDataset,
} from '../../src/core/diagnostics/capability.ts';
import { ingestEvaluationCsv } from '../../src/core/diagnostics/evaluation-ingestion.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('Dataset Capability Engine: Supervised dataset enables all model evaluation diagnostics', () => {
  const context = {
    datasetId: 'ds-supervised-001',
    sourceName: 'melanoma-eval.csv',
    rowCount: 200,
    columns: ['patient_id', 'y_true', 'y_pred', 'y_probability', 'site', 'age'],
    roles: {
      target: 'y_true',
      prediction: 'y_pred',
      probability: 'y_probability',
      id: 'patient_id',
      slices: ['site'],
      features: ['age'],
      textFields: [],
      imageFields: [],
    },
    numericRanges: {
      y_probability: { min: 0.02, max: 0.98 },
    },
  };

  const manifest = computeDatasetCapabilityManifest(context);

  assert.equal(manifest.modality, 'tabular');
  assert.equal(manifest.purpose, 'supervised_evaluation');
  assert.ok(manifest.candidateTasks.includes('binary_classification'));
  assert.ok(manifest.candidateTasks.includes('threshold_optimization'));

  const availableTools = manifest.available.map((t) => t.tool);
  assert.ok(availableTools.includes('compute_classification_metrics'));
  assert.ok(availableTools.includes('check_calibration'));
  assert.ok(availableTools.includes('threshold_sweep'));
  assert.ok(availableTools.includes('slice_evaluation'));
  assert.ok(availableTools.includes('run_drift_tests'));

  // LLM and Vision tools should be unavailable with clear explanations
  const unavailableTools = manifest.unavailable;
  const ragTool = unavailableTools.find((t) => t.tool === 'evaluate_rag_attribution');
  assert.ok(ragTool);
  assert.equal(ragTool.status, 'unsupported_modality');
  assert.ok(ragTool.missingPrerequisites.length > 0);
});

test('Dataset Capability Engine: Labeled dataset without predictions gracefully declares purpose and unavailability', () => {
  const context = {
    datasetId: 'ds-stroke-001',
    sourceName: 'stroke-data.csv',
    rowCount: 500,
    columns: ['id', 'gender', 'age', 'hypertension', 'heart_disease', 'stroke'],
    roles: {
      target: 'stroke',
      slices: ['gender'],
      features: ['age', 'hypertension', 'heart_disease'],
      textFields: [],
      imageFields: [],
    },
  };

  const manifest = computeDatasetCapabilityManifest(context);

  assert.equal(manifest.purpose, 'labeled_unpredicted');
  assert.ok(manifest.candidateTasks.includes('data_profiling'));
  assert.ok(!manifest.candidateTasks.includes('binary_classification'));

  // Data profiling tools must be available
  const availableTools = manifest.available.map((t) => t.tool);
  assert.ok(availableTools.includes('profile_dataset'));
  assert.ok(availableTools.includes('scan_feature_leakage'));

  // Supervised model tools MUST be unavailable with honest explanatory reasons
  const unavailableMap = new Map(manifest.unavailable.map((t) => [t.tool, t]));
  assert.ok(unavailableMap.has('compute_classification_metrics'));
  const classMetricInfo = unavailableMap.get('compute_classification_metrics');
  assert.ok(classMetricInfo.missingPrerequisites.some((r) => r.includes('prediction')));
  assert.ok(classMetricInfo.howToEnable.includes('prediction'));

  assert.ok(unavailableMap.has('check_calibration'));
  assert.ok(unavailableMap.has('threshold_sweep'));
  assert.ok(unavailableMap.has('generate_repair_candidate'));
});

test('Dataset Capability Engine: Unlabeled features dataset routes to unsupervised profiling', () => {
  const context = {
    datasetId: 'ds-unlabeled-001',
    sourceName: 'customer_sensors.csv',
    rowCount: 350,
    columns: ['device_id', 'temp', 'humidity', 'pressure', 'site'],
    roles: {
      id: 'device_id',
      slices: ['site'],
      features: ['temp', 'humidity', 'pressure'],
      textFields: [],
      imageFields: [],
    },
  };

  const manifest = computeDatasetCapabilityManifest(context);

  assert.equal(manifest.purpose, 'unlabeled_features');
  assert.ok(manifest.candidateTasks.includes('unsupervised_profiling'));

  const availableTools = manifest.available.map((t) => t.tool);
  assert.ok(availableTools.includes('profile_dataset'));

  const unavailableMap = new Map(manifest.unavailable.map((t) => [t.tool, t]));
  assert.ok(unavailableMap.has('compute_classification_metrics'));
  assert.ok(unavailableMap.has('slice_evaluation'));
});

test('Dataset Capability Engine: Predictions-only dataset routes to prediction audit', () => {
  const context = {
    datasetId: 'ds-pred-only-001',
    sourceName: 'model_predictions.csv',
    rowCount: 400,
    columns: ['id', 'predicted_label', 'confidence_score', 'cohort'],
    roles: {
      id: 'id',
      prediction: 'predicted_label',
      probability: 'confidence_score',
      slices: ['cohort'],
      features: [],
      textFields: [],
      imageFields: [],
    },
    numericRanges: {
      confidence_score: { min: 0.1, max: 0.95 },
    },
  };

  const manifest = computeDatasetCapabilityManifest(context);

  assert.equal(manifest.purpose, 'prediction_only');
  assert.ok(manifest.candidateTasks.includes('prediction_audit'));

  const unavailableMap = new Map(manifest.unavailable.map((t) => [t.tool, t]));
  // Supervised ground-truth metrics unavailable
  assert.ok(unavailableMap.has('compute_classification_metrics'));
  assert.ok(unavailableMap.get('compute_classification_metrics').missingPrerequisites.some((r) => r.includes('target')));
});

test('Dataset Capability Engine: User-confirmed column mapping overrides heuristics', () => {
  const columns = ['patient_id', 'target', 'my_prob_score', 'facility'];

  // Without user overrides, 'target' is a candidate and 'my_prob_score' has no stats
  const inferred = inferColumnMapping(columns);
  assert.equal(inferred.targetColumn, 'target');

  // With user confirmed mapping overriding target to null and specifying probability
  const confirmed = inferColumnMapping(columns, undefined, {
    targetColumn: null,
    predictionColumn: null,
    probabilityColumn: 'my_prob_score',
    idColumn: 'patient_id',
    sliceColumns: ['facility'],
  });

  assert.equal(confirmed.targetColumn, null);
  assert.equal(confirmed.predictionColumn, null);
  assert.equal(confirmed.probabilityColumn, 'my_prob_score');
  assert.equal(confirmed.idColumn, 'patient_id');
  assert.deepEqual(confirmed.sliceColumns, ['facility']);
});

test('Dataset Capability Engine: Rejects arbitrary numeric columns with stats outside [0, 1] as probabilities', () => {
  const columns = ['record_id', 'y_true', 'y_pred', 'credit_score'];
  const columnStats = [
    {
      name: 'credit_score',
      isNumeric: true,
      min: 300,
      max: 850,
      distinctCount: 50,
      missingCount: 0,
      totalCount: 100,
      sampleValues: ['650', '720'],
    },
  ];

  const inferred = inferColumnMapping(columns, columnStats);
  assert.equal(inferred.probabilityColumn, null, 'credit_score must NOT be inferred as probability');

  const context = {
    datasetId: 'ds-credit',
    sourceName: 'credit.csv',
    rowCount: 100,
    columns,
    roles: {
      target: 'y_true',
      prediction: 'y_pred',
      probability: 'credit_score',
      features: ['credit_score'],
      textFields: [],
      imageFields: [],
    },
    numericRanges: {
      credit_score: { min: 300, max: 850 },
    },
  };

  const manifest = computeDatasetCapabilityManifest(context);
  const unavailableMap = new Map(manifest.unavailable.map((t) => [t.tool, t]));
  assert.ok(unavailableMap.has('check_calibration'));
  assert.ok(unavailableMap.get('check_calibration').reason.includes('0.0, 1.0'));
});

test('Dataset Capability Engine: LLM & Vision capability prerequisites evaluation', () => {
  // LLM Context
  const llmContext = {
    datasetId: 'ds-llm-rag',
    sourceName: 'rag_eval.csv',
    rowCount: 50,
    columns: ['id', 'query', 'retrieved_context', 'model_answer', 'reference_answer'],
    roles: {
      id: 'id',
      textFields: ['query', 'retrieved_context', 'model_answer', 'reference_answer'],
      features: [],
      imageFields: [],
    },
  };

  const llmManifest = computeDatasetCapabilityManifest(llmContext);
  assert.equal(llmManifest.modality, 'llm');
  assert.ok(llmManifest.candidateTasks.includes('rag_hallucination_audit'));
  const llmAvailable = llmManifest.available.map((t) => t.tool);
  assert.ok(llmAvailable.includes('evaluate_rag_attribution'));

  // Vision Context
  const visionContext = {
    datasetId: 'ds-vision',
    sourceName: 'dermatology_images.zip',
    format: 'zip',
    rowCount: 120,
    columns: ['image_path', 'label', 'split'],
    roles: {
      target: 'label',
      slices: ['split'],
      imageFields: ['image_path'],
      features: [],
      textFields: [],
    },
  };

  const visionManifest = computeDatasetCapabilityManifest(visionContext);
  assert.equal(visionManifest.modality, 'vision');
  assert.ok(visionManifest.candidateTasks.includes('visual_defect_detection'));
  const visionAvailable = visionManifest.available.map((t) => t.tool);
  assert.ok(visionAvailable.includes('detect_exact_duplicates'));
  assert.ok(visionAvailable.includes('audit_image_quality'));
});

test('Dataset Capability Engine: Ingests real-world stroke dataset without prediction column', () => {
  const fixturePath = join(process.cwd(), 'public', 'fixtures', 'kaggle_stroke_dataset.csv');
  const csvContent = readFileSync(fixturePath, 'utf8');

  // Case 1: Ingest without explicit column mapping:
  // Stroke is NOT guessed as target, and missing y_pred does NOT throw an error!
  const unmapped = ingestEvaluationCsv(csvContent, 'kaggle_stroke_dataset.csv');
  assert.ok(unmapped);
  assert.equal(unmapped.metadata.targetColumn, null);
  assert.equal(unmapped.metadata.predictionColumn, null);
  assert.equal(unmapped.metadata.task, 'unsupervised_profiling');

  // Case 2: Ingest WITH confirmed user mapping for target 'stroke':
  const dataset = ingestEvaluationCsv(csvContent, 'kaggle_stroke_dataset.csv', {
    columnMapping: { targetColumn: 'stroke' },
  });

  assert.ok(dataset);
  assert.equal(dataset.metadata.targetColumn, 'stroke');
  assert.equal(dataset.metadata.predictionColumn, null);
  assert.equal(dataset.metadata.probabilityColumn, null);
  assert.equal(dataset.metadata.task, 'binary_classification');
  assert.ok(dataset.rows.length > 0);

  // All rows have predicted as null
  assert.ok(dataset.rows.every((r) => r.predicted === null));
  assert.ok(dataset.rows.some((r) => r.actual !== null));

  // Verify capability report evaluated on this dataset
  assert.ok(dataset.capabilityManifest);
  assert.equal(dataset.capabilityManifest.purpose, 'labeled_unpredicted');
  const available = dataset.capabilityManifest.available.map((t) => t.tool);
  assert.ok(available.includes('profile_dataset'));
  assert.ok(available.includes('scan_feature_leakage'));

  // Evaluate UI capabilities checklist
  const preview = {
    datasetId: dataset.metadata.id,
    rowCount: dataset.rows.length,
    columnCount: dataset.metadata.columns.length,
    previewRows: [],
    columns: [],
    inferredMapping: {
      targetColumn: dataset.metadata.targetColumn,
      predictionColumn: dataset.metadata.predictionColumn,
      probabilityColumn: dataset.metadata.probabilityColumn,
      idColumn: null,
      sliceColumns: [],
    },
    detectedLabels: dataset.labels ? { ...dataset.labels, candidates: [dataset.labels.positive, dataset.labels.negative] } : null,
    capabilities: getCapabilitiesFromDataset(dataset),
    validationIssues: [],
  };

  assert.equal(preview.capabilities.taskType, 'raw_features_no_predictions');
  const binItem = preview.capabilities.items.find((i) => i.id === 'binary_metrics');
  assert.equal(binItem.status, 'missing_evidence');
  assert.ok(binItem.reason.toLowerCase().includes('prediction'));
  assert.ok(binItem.howToEnable.toLowerCase().includes('prediction'));
});
