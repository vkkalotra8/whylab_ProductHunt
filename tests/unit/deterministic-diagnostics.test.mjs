import test from 'node:test';
import assert from 'node:assert/strict';
import { computeRegressionMetrics } from '../../src/core/diagnostics/regression-metrics.ts';
import { analyzeTrainingDiagnostics } from '../../src/core/diagnostics/training-diagnostics.ts';
import { checkSplitContamination, auditDataQuality } from '../../src/core/diagnostics/split-contamination.ts';

test('computeRegressionMetrics: computes MAE, MSE, RMSE, and R2 on exact values', () => {
  const actuals = [10, 20, 30, 40, 50];
  const predictions = [12, 18, 32, 38, 52]; // errors: +2, -2, +2, -2, +2 => abs err 2, sq err 4

  const res = computeRegressionMetrics(actuals, predictions);
  assert.equal(res.sampleCount, 5);
  assert.equal(res.mae, 2);
  assert.equal(res.mse, 4);
  assert.equal(res.rmse, 2);
  assert.ok(res.r2 !== null && res.r2 > 0.95);
  assert.equal(res.meanActual, 30);
  assert.equal(res.meanPredicted, 30.4);
});

test('computeRegressionMetrics: handles slice breakdowns and zero variance safely', () => {
  const actuals = [10, 20, 10, 20];
  const predictions = [11, 21, 9, 19];
  const slices = ['US', 'US', 'EU', 'EU'];

  const res = computeRegressionMetrics(actuals, predictions, slices);
  assert.ok(res.sliceMetrics);
  assert.equal(res.sliceMetrics['US'].sampleCount, 2);
  assert.equal(res.sliceMetrics['US'].mae, 1);
  assert.equal(res.sliceMetrics['EU'].sampleCount, 2);
  assert.equal(res.sliceMetrics['EU'].mae, 1);

  // Zero variance actuals
  const constActuals = [5, 5, 5];
  const preds = [6, 4, 5];
  const constRes = computeRegressionMetrics(constActuals, preds);
  assert.equal(constRes.r2, null);
  assert.ok(constRes.warnings.some((w) => w.includes('undefined')));
});

test('analyzeTrainingDiagnostics: identifies diverging validation loss and overfitting gap', () => {
  const logExtraction = {
    framework: 'pytorch',
    totalEpochs: 4,
    metricHistory: [
      { epoch: 1, trainLoss: 0.60, valLoss: 0.62 },
      { epoch: 2, trainLoss: 0.40, valLoss: 0.64 },
      { epoch: 3, trainLoss: 0.25, valLoss: 0.70 },
      { epoch: 4, trainLoss: 0.15, valLoss: 0.85 },
    ],
    finalTrainLoss: 0.15,
    finalValLoss: 0.85,
    earlyStoppingEpoch: null,
    warnings: [],
    unrecognizedLinesCount: 0,
  };

  const diag = analyzeTrainingDiagnostics(logExtraction);
  assert.equal(diag.isDiverging, true);
  assert.equal(diag.isOverfitting, true);
  assert.equal(diag.minValLossEpoch, 1);
  assert.ok(diag.diagnoses.some((d) => d.includes('Diverging loss detected')));
  assert.ok(diag.recommendations.some((r) => r.includes('regularization')));
});

test('analyzeTrainingDiagnostics: detects underfitting when loss stagnates', () => {
  const logExtraction = {
    framework: 'keras',
    totalEpochs: 5,
    metricHistory: [
      { epoch: 1, trainLoss: 1.50, valLoss: 1.52 },
      { epoch: 2, trainLoss: 1.49, valLoss: 1.51 },
      { epoch: 3, trainLoss: 1.49, valLoss: 1.50 },
      { epoch: 4, trainLoss: 1.48, valLoss: 1.50 },
      { epoch: 5, trainLoss: 1.48, valLoss: 1.49 },
    ],
    finalTrainLoss: 1.48,
    finalValLoss: 1.49,
    earlyStoppingEpoch: null,
    warnings: [],
    unrecognizedLinesCount: 0,
  };

  const diag = analyzeTrainingDiagnostics(logExtraction);
  assert.equal(diag.isUnderfitting, true);
  assert.ok(diag.diagnoses.some((d) => d.includes('Underfitting')));
  assert.ok(diag.recommendations.some((r) => r.includes('capacity')));
});

test('checkSplitContamination: flags duplicate records between train and test', () => {
  const trainCsv = 'age,income,state,target\n25,50000,CA,0\n35,70000,NY,1\n45,90000,TX,0';
  // Row 1 of test is identical to row 2 of train on features age, income, state
  const testCsv = 'age,income,state,target\n35,70000,NY,1\n60,120000,FL,1';

  const res = checkSplitContamination(trainCsv, testCsv, 'target');
  assert.equal(res.hasContamination, true);
  assert.equal(res.duplicateRowCount, 1);
  assert.equal(res.duplicatePercentage, 50);
  assert.equal(res.sampleDuplicates.length, 1);
  assert.equal(res.sampleDuplicates[0].trainRowIndex, 2);
  assert.equal(res.sampleDuplicates[0].testRowIndex, 1);
  assert.ok(res.warnings.some((w) => w.includes('Split contamination alert')));
});

test('auditDataQuality: audits missing values, internal duplicates, and numeric outliers', () => {
  const csvData = [
    'id,value,category',
    '1,10,A',
    '2,12,B',
    '3,null,A',
    '4,11,B',
    '1,10,A', // Duplicate of row 1
  ].join('\n');

  const audit = auditDataQuality(csvData, 'quality_test.csv');
  assert.equal(audit.totalRows, 5);
  assert.equal(audit.internalDuplicateRowCount, 1);
  assert.equal(audit.missingValuesSummary['value'].count, 1);
  assert.equal(audit.missingValuesSummary['value'].percentage, 20);
});
