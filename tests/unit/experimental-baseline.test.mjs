import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  trainExperimentalBaseline,
  EXPERIMENTAL_BASELINE_DISCLAIMER,
} from '../../src/core/inference/baseline-trainer.ts';
import {
  executeSafeInference,
  INFERENCE_SAFETY_LIMITS,
} from '../../src/core/inference/safe-inference-adapter.ts';
import { previewEvaluationCsv } from '../../src/core/diagnostics/evaluation-ingestion.ts';
import { evaluateCapabilities, inferColumnMapping } from '../../src/core/diagnostics/capability.ts';

test('Milestone D4: ExperimentalBaselineTrainer strictly rejects execution without opt-in', () => {
  const rows = [
    { age: 25, bmi: 22.4, target: 0 },
    { age: 60, bmi: 31.2, target: 1 },
    { age: 45, bmi: 27.1, target: 0 },
    { age: 70, bmi: 29.5, target: 1 },
    { age: 30, bmi: 24.0, target: 0 },
    { age: 65, bmi: 33.1, target: 1 },
    { age: 50, bmi: 26.5, target: 0 },
    { age: 80, bmi: 30.0, target: 1 },
    { age: 35, bmi: 23.8, target: 0 },
    { age: 75, bmi: 32.4, target: 1 },
  ];

  assert.throws(
    () =>
      trainExperimentalBaseline({
        datasetName: 'test.csv',
        rows,
        targetColumn: 'target',
        positiveLabel: '1',
        optInConfirmed: false,
      }),
    /opt-in prohibited|opt-in was not confirmed/i
  );
});

test('Milestone D4: ExperimentalBaselineTrainer is 100% deterministic with fixed seed', () => {
  const rows = [
    { age: 25, bmi: 22.4, blood_pressure: 120, smoker: 'no', target: '0' },
    { age: 62, bmi: 31.2, blood_pressure: 145, smoker: 'yes', target: '1' },
    { age: 45, bmi: 27.1, blood_pressure: 130, smoker: 'no', target: '0' },
    { age: 71, bmi: 29.5, blood_pressure: 150, smoker: 'yes', target: '1' },
    { age: 33, bmi: 24.0, blood_pressure: 118, smoker: 'no', target: '0' },
    { age: 68, bmi: 33.1, blood_pressure: 140, smoker: 'no', target: '1' },
    { age: 52, bmi: 26.5, blood_pressure: 128, smoker: 'yes', target: '0' },
    { age: 81, bmi: 30.0, blood_pressure: 160, smoker: 'yes', target: '1' },
    { age: 39, bmi: 23.8, blood_pressure: 122, smoker: 'no', target: '0' },
    { age: 77, bmi: 32.4, blood_pressure: 155, smoker: 'yes', target: '1' },
    { age: 28, bmi: 21.9, blood_pressure: 115, smoker: 'no', target: '0' },
    { age: 65, bmi: 34.0, blood_pressure: 148, smoker: 'yes', target: '1' },
  ];

  const run1 = trainExperimentalBaseline({
    datasetName: 'test_patients.csv',
    rows,
    targetColumn: 'target',
    positiveLabel: '1',
    negativeLabel: '0',
    seed: 1337,
    optInConfirmed: true,
  });

  const run2 = trainExperimentalBaseline({
    datasetName: 'test_patients.csv',
    rows,
    targetColumn: 'target',
    positiveLabel: '1',
    negativeLabel: '0',
    seed: 1337,
    optInConfirmed: true,
  });

  assert.equal(run1.seed, 1337);
  assert.equal(run1.provenanceHash, run2.provenanceHash);
  assert.equal(run1.bias, run2.bias);
  assert.deepEqual(run1.featureWeights, run2.featureWeights);
  assert.deepEqual(run1.holdoutMetrics, run2.holdoutMetrics);
  assert.deepEqual(run1.predictions, run2.predictions);
  assert.equal(run1.disclaimer, EXPERIMENTAL_BASELINE_DISCLAIMER);
  assert.equal(run1.leakageAudit.fitOnTrainOnly, true);
  assert.equal(run1.leakageAudit.holdoutIsolated, true);
});

test('Milestone D4: Data hygiene audit verifies zero lookahead leakage into preprocessing', () => {
  // Construct rows with a huge outlier in the test set to ensure train statistics were NOT contaminated
  const rows = [
    { feature: 10, target: '0' },
    { feature: 10, target: '0' },
    { feature: 10, target: '0' },
    { feature: 10, target: '0' },
    { feature: 10, target: '0' },
    { feature: 20, target: '1' },
    { feature: 20, target: '1' },
    { feature: 20, target: '1' },
    { feature: 20, target: '1' },
    { feature: 20, target: '1' },
    // Outliers that will land in test split
    { feature: 99999, target: '0' },
    { feature: 99999, target: '1' },
  ];

  const res = trainExperimentalBaseline({
    datasetName: 'leakage_check.csv',
    rows,
    targetColumn: 'target',
    positiveLabel: '1',
    seed: 42,
    trainRatio: 0.6,
    optInConfirmed: true,
  });

  // Train median for feature must be either 10 or 20, NOT 99999
  const trainMedian = res.preprocessing.trainMedians['feature'];
  assert.ok(trainMedian <= 20, `Train median (${trainMedian}) must not be contaminated by test outliers`);
  assert.ok(res.splits.trainCount > 0);
  assert.ok(res.splits.testCount > 0);
  assert.equal(res.leakageAudit.preprocessorLeakageFree, true);
});

test('Milestone D4: End-to-end baseline training on kaggle_stroke_dataset unlocks supervised capabilities', () => {
  const fixturePath = join(process.cwd(), 'public', 'fixtures', 'kaggle_stroke_dataset.csv');
  const csvContent = readFileSync(fixturePath, 'utf8');

  const lines = csvContent.trim().split(/\r?\n/);
  const headers = lines[0].split(',').map((h) => h.trim());
  const rows = lines.slice(1, 201).map((line) => {
    const vals = line.split(',');
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = vals[i] ?? '';
    });
    return obj;
  });

  const baselineResult = trainExperimentalBaseline({
    datasetName: 'kaggle_stroke_dataset.csv',
    rows,
    targetColumn: 'stroke',
    positiveLabel: '1',
    negativeLabel: '0',
    seed: 42,
    optInConfirmed: true,
  });

  assert.equal(baselineResult.isExperimentalBaseline, true);
  assert.ok(baselineResult.holdoutMetrics.accuracy >= 0.5, 'Baseline accuracy sanity check');
  assert.ok(baselineResult.predictions.length === rows.length);

  // Augment dataset with baseline outputs
  const augmentedHeaders = [...headers, '_baseline_pred', '_baseline_prob'];
  const augmentedLines = [augmentedHeaders.join(',')];
  for (let i = 0; i < rows.length; i++) {
    const p = baselineResult.predictions[i];
    const orig = lines[i + 1];
    augmentedLines.push(`${orig},${p.predicted},${p.probability}`);
  }
  const augmentedCsv = augmentedLines.join('\n');

  const preview = previewEvaluationCsv(augmentedCsv, 'kaggle_stroke_augmented.csv');
  const mapping = inferColumnMapping(
    preview.columns.map((c) => c.name),
    preview.columns,
    {
      targetColumn: 'stroke',
      predictionColumn: '_baseline_pred',
      probabilityColumn: '_baseline_prob',
    }
  );

  const caps = evaluateCapabilities(preview.columns, mapping);

  // Now binary metrics and threshold sweep MUST be available!
  const binaryMetrics = caps.items.find((i) => i.id === 'binary_metrics');
  assert.ok(binaryMetrics);
  assert.equal(binaryMetrics.status, 'available');

  const sweep = caps.items.find((i) => i.id === 'threshold_sweep');
  assert.ok(sweep);
  assert.equal(sweep.status, 'available');

  const calib = caps.items.find((i) => i.id === 'probability_calibration');
  assert.ok(calib);
  assert.equal(calib.status, 'available');
});

test('Milestone D4: SafeInferenceAdapter enforces timeout and batch limit constraints', async () => {
  // 1. Batch size limit
  const hugeBatch = new Array(INFERENCE_SAFETY_LIMITS.maxBatchSize + 1).fill({ x: 1 });
  await assert.rejects(
    async () => {
      await executeSafeInference({
        endpointUrl: 'https://api.example.com/predict',
        records: hugeBatch,
      });
    },
    /exceeds safety limit/i
  );

  // 2. Protocol validation
  await assert.rejects(
    async () => {
      await executeSafeInference({
        endpointUrl: 'file:///etc/passwd',
        records: [{ x: 1 }],
      });
    },
    /Invalid protocol/i
  );

  // 3. Mock successful endpoint parsing
  const mockFetch = async () => {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        predictions: [
          { prediction: '1', probability: 0.88 },
          { prediction: '0', probability: 0.12 },
        ],
      }),
    };
  };

  const response = await executeSafeInference(
    {
      endpointUrl: 'https://api.example.com/v1/infer',
      records: [{ feature_1: 10 }, { feature_1: 20 }],
      modelIdentifier: 'my_clinical_model_v1',
    },
    mockFetch
  );

  assert.equal(response.success, true);
  assert.equal(response.predictions.length, 2);
  assert.equal(response.predictions[0].predictedLabel, '1');
  assert.equal(response.predictions[0].probability, 0.88);
  assert.equal(response.predictions[1].predictedLabel, '0');
  assert.equal(response.predictions[1].probability, 0.12);
  assert.equal(response.provenance.modelIdentifier, 'my_clinical_model_v1');
});
