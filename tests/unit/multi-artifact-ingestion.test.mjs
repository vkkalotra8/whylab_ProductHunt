import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectArtifactFormat,
  inferArtifactRole,
  ingestArtifact,
  ingestMultipleArtifacts,
} from '../../src/core/diagnostics/multi-artifact-ingestion.ts';
import { checkUnsafeModelBinary, parseModelMetadata } from '../../src/core/diagnostics/model-metadata.ts';
import { parseTrainingLog } from '../../src/core/diagnostics/training-logs.ts';

test('detectArtifactFormat: detects CSV, TSV, JSON, JSONL, and text logs', () => {
  assert.equal(detectArtifactFormat('data.csv', 'a,b\n1,2'), 'csv');
  assert.equal(detectArtifactFormat('data.tsv', 'a\tb\n1\t2'), 'tsv');
  assert.equal(detectArtifactFormat('data.txt', 'a\tb\n1\t2'), 'tsv');
  assert.equal(detectArtifactFormat('data.jsonl', '{"a": 1}\n{"a": 2}'), 'jsonl');
  assert.equal(detectArtifactFormat('data.json', '[{"a": 1}, {"a": 2}]'), 'json');
  assert.equal(detectArtifactFormat('training.log', 'Epoch 1/10 - loss: 0.5'), 'text_log');
});

test('inferArtifactRole: correctly identifies roles by name and content', () => {
  assert.equal(inferArtifactRole('train_set.csv', 'x,y', 'csv'), 'training');
  assert.equal(inferArtifactRole('validation_holdout.tsv', 'x\ty', 'tsv'), 'validation');
  assert.equal(inferArtifactRole('production_traffic.csv', 'x,y', 'csv'), 'production');
  assert.equal(inferArtifactRole('reference_baseline.csv', 'x,y', 'csv'), 'reference');
  assert.equal(inferArtifactRole('predictions.csv', 'pred_label,prob', 'csv'), 'predictions');
  assert.equal(inferArtifactRole('ground_truth.csv', 'actual_label', 'csv'), 'ground_truth');
  assert.equal(inferArtifactRole('training.log', 'Epoch 1: loss=0.5', 'text_log'), 'training_log');
  assert.equal(inferArtifactRole('model_config.json', '{"model_name": "rf"}', 'json'), 'model_metadata');
});

test('ingestArtifact: ingests TSV tabular data and computes schema', () => {
  const tsvData = 'feature1\tfeature2\ttarget\n1.5\tA\t0\n2.5\tB\t1\n3.5\tA\t0';
  const artifact = ingestArtifact({ name: 'train_data.tsv', content: tsvData });

  assert.equal(artifact.role, 'training');
  assert.equal(artifact.format, 'tsv');
  assert.equal(artifact.validationStatus, 'valid');
  assert.ok(artifact.schema);
  assert.equal(artifact.schema.rowCount, 3);
  assert.deepEqual(artifact.schema.columns, ['feature1', 'feature2', 'target']);
  assert.equal(artifact.schema.columnTypes['feature1'], 'numeric');
  assert.equal(artifact.schema.columnTypes['feature2'], 'categorical');
});

test('ingestArtifact: ingests JSONL table into tabular schema', () => {
  const jsonlData = '{"user_id": "u1", "score": 0.85, "label": 1}\n{"user_id": "u2", "score": 0.12, "label": 0}';
  const artifact = ingestArtifact({ name: 'eval.jsonl', content: jsonlData });

  assert.equal(artifact.format, 'jsonl');
  assert.equal(artifact.validationStatus, 'valid');
  assert.ok(artifact.schema);
  assert.equal(artifact.schema.rowCount, 2);
  assert.ok(artifact.schema.columns.includes('score'));
});

test('ingestMultipleArtifacts: checks relationships and warns on train/val schema mismatch', () => {
  const trainCsv = 'age,income,zip_code,default\n25,50000,90210,0\n40,80000,10001,1';
  // Val is missing zip_code and has unexpected foreign_key
  const valCsv = 'age,income,foreign_key,default\n29,55000,123,0';

  const res = ingestMultipleArtifacts([
    { name: 'train.csv', content: trainCsv },
    { name: 'val.csv', content: valCsv },
  ]);

  assert.equal(res.artifacts.length, 2);
  assert.ok(res.validation.warnings.some((w) => w.includes('missing 1 columns present in Training')));
  assert.ok(res.validation.warnings.some((w) => w.includes('unexpected columns')));
});

test('training log parser: extracts PyTorch / Lightning metrics history', () => {
  const ptLog = `
Epoch 1: train_loss=0.693, val_loss=0.680, val_f1=0.62, lr=0.001
Epoch 2: train_loss=0.540, val_loss=0.510, val_f1=0.74, lr=0.001
Epoch 3: train_loss=0.420, val_loss=0.480, val_f1=0.78, lr=0.0005
Early stopping triggered at epoch 3.
`;
  const parsed = parseTrainingLog(ptLog);
  assert.equal(parsed.framework, 'pytorch');
  assert.equal(parsed.totalEpochs, 3);
  assert.equal(parsed.metricHistory[0].trainLoss, 0.693);
  assert.equal(parsed.metricHistory[2].valLoss, 0.480);
  assert.equal(parsed.earlyStoppingEpoch, 3);
});

test('training log parser: extracts Keras multi-line training logs', () => {
  const kerasLog = `
Using TensorFlow backend.
Epoch 1/2
100/100 [==============================] - 2s 18ms/step - loss: 0.5421 - accuracy: 0.7600 - val_loss: 0.4912 - val_accuracy: 0.8100
Epoch 2/2
100/100 [==============================] - 1s 15ms/step - loss: 0.4120 - accuracy: 0.8400 - val_loss: 0.4350 - val_accuracy: 0.8350
`;
  const parsed = parseTrainingLog(kerasLog);
  assert.equal(parsed.framework, 'keras');
  assert.equal(parsed.totalEpochs, 2);
  assert.equal(parsed.metricHistory[0].trainLoss, 0.5421);
  assert.equal(parsed.metricHistory[1].valAccuracy, 0.8350);
});

test('training log parser: extracts XGBoost iteration metrics', () => {
  const xgbLog = `
[0] train-logloss:0.6543 val-logloss:0.6612
[1] train-logloss:0.5432 val-logloss:0.5621
[2] train-logloss:0.4321 val-logloss:0.4812
Stopping. Best iteration: [2]
`;
  const parsed = parseTrainingLog(xgbLog);
  assert.equal(parsed.framework, 'xgboost');
  assert.equal(parsed.totalEpochs, 3);
  assert.equal(parsed.metricHistory[0].trainLoss, 0.6543);
  assert.equal(parsed.metricHistory[2].valLoss, 0.4812);
  assert.equal(parsed.earlyStoppingEpoch, 2);
});

test('model metadata parser: parses task, hyperparameters, seed, and config', () => {
  const configJson = JSON.stringify({
    model_name: 'RandomForestClassifier',
    model_version: 'v1.4.0',
    framework: 'scikit-learn',
    task_type: 'binary_classification',
    target_column: 'is_fraud',
    feature_columns: ['amount', 'hour', 'card_type'],
    hyperparameters: {
      n_estimators: 100,
      max_depth: 8,
      min_samples_split: 5,
    },
    random_seed: 42,
  });

  const parsed = parseModelMetadata(configJson);
  assert.equal(parsed.modelName, 'RandomForestClassifier');
  assert.equal(parsed.taskType, 'binary_classification');
  assert.equal(parsed.targetColumn, 'is_fraud');
  assert.deepEqual(parsed.featureColumns, ['amount', 'hour', 'card_type']);
  assert.equal(parsed.randomSeed, 42);
  assert.equal(parsed.hyperparameters?.n_estimators, 100);
});

test('model security check: blocks unsafe model binary execution with actionable guidance', () => {
  const pklCheck = checkUnsafeModelBinary('classifier.pkl');
  assert.equal(pklCheck.isUnsafeBinary, true);
  assert.ok(pklCheck.reason?.includes('cannot be safely executed'));
  assert.ok(pklCheck.reason?.includes('predictions'));

  const joblibCheck = checkUnsafeModelBinary('model.joblib');
  assert.equal(joblibCheck.isUnsafeBinary, true);

  const ptCheck = checkUnsafeModelBinary('weights.pt');
  assert.equal(ptCheck.isUnsafeBinary, true);

  const csvCheck = checkUnsafeModelBinary('predictions.csv');
  assert.equal(csvCheck.isUnsafeBinary, false);
});
