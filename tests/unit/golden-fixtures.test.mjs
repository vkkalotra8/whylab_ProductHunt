import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runFlagshipMelanomaInvestigation } from '../../src/core/diagnostics/flagship-melanoma.ts';
import { ingestEvaluationCsv } from '../../src/core/diagnostics/evaluation-ingestion.ts';
import { profileEvaluationDataset } from '../../src/core/diagnostics/dataset-profiler.ts';
import { parseCsv } from '../../src/core/diagnostics/csv.ts';
import { validateInvestigation } from '../../src/core/domain/validation.ts';

const fixturesDir = join(process.cwd(), 'public', 'fixtures');

test('flagship melanoma investigation: end-to-end regression validation', () => {
  const investigation = runFlagshipMelanomaInvestigation();

  // Investigation aggregate must satisfy all structural domain invariants
  assert.doesNotThrow(() => validateInvestigation(investigation));

  assert.equal(investigation.status, 'completed');
  assert.equal(investigation.datasets.length, 1);
  assert.equal(investigation.datasets[0].rowCount, 100);

  // Check baseline measurements: 92% raw accuracy, 20% recall
  const baselineEv = investigation.evidence.find((e) => e.description.includes('Baseline evaluation'));
  assert.ok(baselineEv !== undefined);

  const acc = baselineEv.measurements.find((m) => m.name === 'accuracy');
  assert.equal(acc?.value, 0.92);

  const recall = baselineEv.measurements.find((m) => m.name === 'recall');
  assert.equal(recall?.value, 0.20);

  // Check experiment outcome: supported, 32 pp gap
  assert.equal(investigation.experiments.length, 1);
  assert.equal(investigation.experiments[0].outcome, 'supports');

  // Check repair and comparison
  assert.equal(investigation.repairs.length, 1);
  assert.equal(investigation.comparisons.length, 1);
  assert.equal(investigation.comparisons[0].status, 'passed');

  // Check diagnosis
  assert.ok(investigation.diagnosis !== null);
  assert.equal(investigation.diagnosis.status, 'completed');
  assert.equal(investigation.diagnosis.confidence.level, 'strong');
});

test('golden fixtures: all 7 datasets exist and are parseable', () => {
  const expectedFixtures = [
    'melanoma-synthetic.csv',
    'kaggle_icu_sepsis_benchmark.csv',
    'icu_sepsis_repair_eval.csv',
    'kaggle_stroke_dataset.csv',
    'kaggle_disaster_tweets.csv',
    'overconfident-classifier.csv',
    'site-failure.csv',
  ];

  for (const filename of expectedFixtures) {
    const fullPath = join(fixturesDir, filename);
    assert.ok(existsSync(fullPath), `Fixture ${filename} must exist in public/fixtures/`);

    const content = readFileSync(fullPath, 'utf8');
    assert.ok(content.length > 0, `Fixture ${filename} must not be empty`);

    // Verify CSV parseability
    const parsed = parseCsv(content);
    assert.ok(parsed.length > 1, `Fixture ${filename} must contain rows`);
    assert.ok(parsed[0].length > 0, `Fixture ${filename} must contain columns`);
  }
});

test('golden fixtures: benchmark evaluation CSVs ingest and profile successfully', () => {
  const evalDatasets = [
    { file: 'melanoma-synthetic.csv', positive: '1', negative: '0' },
    { file: 'icu_sepsis_repair_eval.csv', positive: '1', negative: '0' },
    { file: 'overconfident-classifier.csv', positive: '1', negative: '0' },
    { file: 'site-failure.csv', positive: '1', negative: '0' },
  ];

  for (const { file, positive, negative } of evalDatasets) {
    const fullPath = join(fixturesDir, file);
    const content = readFileSync(fullPath, 'utf8');

    const evalData = ingestEvaluationCsv(content, file, {
      labels: { positive, negative },
    });

    assert.ok(evalData.rows.length > 0, `${file} must ingest with rows`);

    const profile = profileEvaluationDataset(evalData);
    assert.ok(profile.rowCount > 0, `${file} must profile rowCount > 0`);
    assert.ok(profile.columns.length >= 3, `${file} must have at least y_true, y_pred, y_probability`);
  }
});
