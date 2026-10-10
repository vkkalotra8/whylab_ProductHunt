import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ingestEvaluationCsv } from '../../src/core/diagnostics/evaluation-ingestion.ts';
import { profileEvaluationDataset } from '../../src/core/diagnostics/dataset-profiler.ts';
import { evaluateClassification } from '../../src/core/diagnostics/classification-metrics.ts';
import { runAdversarialReview } from '../../src/core/falsification/adversarial-review.ts';
import { analyzeMultiSiteShift } from '../../src/core/diagnostics/multi-site-shift.ts';
import { reEvaluateRepair } from '../../src/core/diagnostics/repair-reevaluation.ts';
import { parseCsv } from '../../src/core/diagnostics/csv.ts';
import { createId } from '../../src/core/domain/primitives.ts';

const fixturesDir = join(process.cwd(), 'public', 'fixtures');

test('golden regression: all 7 benchmark datasets pass ingestion, profiling, and parseability invariants', () => {
  const evalBenchmarks = [
    { file: 'melanoma-synthetic.csv', expectedRows: 100 },
    { file: 'site-failure.csv', expectedRows: 100 },
    { file: 'overconfident-classifier.csv', expectedRows: 100 },
    { file: 'icu_sepsis_repair_eval.csv', expectedRows: 1000 },
    { file: 'kaggle_icu_sepsis_benchmark.csv', expectedRows: 1000 },
  ];

  for (const { file, expectedRows } of evalBenchmarks) {
    const fullPath = join(fixturesDir, file);
    assert.ok(existsSync(fullPath), `Fixture ${file} must exist`);

    const content = readFileSync(fullPath, 'utf8');
    const dataset = ingestEvaluationCsv(content, file, {
      labels: { positive: '1', negative: '0' },
    });

    assert.equal(dataset.rows.length, expectedRows, `${file} row count mismatch`);
    assert.equal(dataset.schemaVersion, 1);
    assert.ok(dataset.metadata.columns.includes('y_true'));
    assert.ok(dataset.metadata.columns.includes('y_pred'));
    assert.ok(dataset.metadata.columns.includes('y_probability'));

    const profile = profileEvaluationDataset(dataset);
    assert.equal(profile.rowCount, expectedRows);
    assert.ok(profile.classes.length >= 1);
  }

  const rawKaggleBenchmarks = [
    { file: 'kaggle_stroke_dataset.csv', minRows: 1000 },
    { file: 'kaggle_disaster_tweets.csv', minRows: 1000 },
  ];

  for (const { file, minRows } of rawKaggleBenchmarks) {
    const fullPath = join(fixturesDir, file);
    assert.ok(existsSync(fullPath), `Fixture ${file} must exist`);

    const content = readFileSync(fullPath, 'utf8');
    const parsed = parseCsv(content);
    assert.ok(parsed.length >= minRows, `${file} must contain at least ${minRows} rows`);
    assert.ok(parsed[0].length > 0, `${file} must contain header columns`);
  }
});

test('golden regression: melanoma-synthetic accuracy paradox repair recovers 80% recall', () => {
  const content = readFileSync(join(fixturesDir, 'melanoma-synthetic.csv'), 'utf8');
  const dataset = ingestEvaluationCsv(content, 'melanoma-synthetic.csv', {
    labels: { positive: '1', negative: '0' },
  });

  // Baseline at 0.50
  const baseline = evaluateClassification(dataset, {
    datasetId: dataset.metadata.id,
    positiveLabel: '1',
  });
  const baseAcc = baseline.output.metrics.find((m) => m.name === 'accuracy');
  const baseRecall = baseline.output.metrics.find((m) => m.name === 'recall');
  assert.equal(baseAcc?.value, 0.92);
  assert.equal(baseRecall?.value, 0.20);

  // Re-evaluation at 0.19
  const reeval = reEvaluateRepair(dataset, {
    repairId: createId('repair'),
    datasetId: dataset.metadata.id,
    positiveLabel: '1',
    baselineThreshold: 0.50,
    repairedThreshold: 0.19,
    criterion: {
      metric: 'recall',
      operator: 'at_least',
      value: 0.80,
      unit: 'ratio',
    },
    baselineEvidenceIds: [],
  });

  assert.equal(reeval.output.status, 'passed');
  const repairedRecall = reeval.output.repairedMetrics.find((m) => m.name === 'recall');
  assert.equal(repairedRecall?.value, 1.0);
  assert.ok(repairedRecall?.value >= 0.80);
});

test('golden regression: site-failure.csv preserves exact -100 pp disparity and protection floor', () => {
  const content = readFileSync(join(fixturesDir, 'site-failure.csv'), 'utf8');
  const dataset = ingestEvaluationCsv(content, 'site-failure.csv', {
    labels: { positive: '1', negative: '0' },
  });

  const report = analyzeMultiSiteShift(dataset, { column: 'site', sampleSizeFloor: 30 });
  assert.equal(report.sites.length, 2);

  const siteA = report.sites.find((s) => s.site === 'A');
  const siteB = report.sites.find((s) => s.site === 'B');
  assert.equal(siteA?.sampleSize, 90);
  assert.equal(siteA?.accuracy, 1.0);
  assert.equal(siteB?.sampleSize, 10);
  assert.equal(siteB?.accuracy, 0.0);
  assert.equal(siteB?.sampleSizeProtected, true);

  const accDisparity = report.disparities.find((d) => d.metric === 'accuracy');
  assert.equal(accDisparity?.disparityPp, -100.0);
  assert.equal(accDisparity?.alertLevel, 'critical');
});

test('golden regression: overconfident-classifier.csv preserves miscalibration detection', () => {
  const content = readFileSync(join(fixturesDir, 'overconfident-classifier.csv'), 'utf8');
  const dataset = ingestEvaluationCsv(content, 'overconfident-classifier.csv', {
    labels: { positive: '1', negative: '0' },
  });

  const audit = runAdversarialReview({ dataset });
  assert.equal(audit.defenseStatus, 'vulnerable');
  const calibCh = audit.challenges.find((c) => c.id === 'challenge_calibration_drift');
  assert.equal(calibCh?.verdict, 'upheld');
});
