import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ingestEvaluationCsv } from '../../src/core/diagnostics/evaluation-ingestion.ts';
import { auditDataQuality } from '../../src/core/diagnostics/data-quality-tools.ts';
import { runAutonomousInvestigation } from '../../src/server/orchestrator/investigator.ts';
import { OfflineInvestigatorProvider } from '../../src/server/orchestrator/provider-offline.ts';
import { deriveInvestigationStage } from '../../src/core/investigation/state-machine.ts';

test('Dataset-Only Investigation: auditDataQuality computes complete quality & readiness assessment on stroke dataset', () => {
  const fixturePath = join(process.cwd(), 'public', 'fixtures', 'kaggle_stroke_dataset.csv');
  const csvContent = readFileSync(fixturePath, 'utf8');

  const dataset = ingestEvaluationCsv(csvContent, 'kaggle_stroke_dataset.csv', {
    columnMapping: { targetColumn: 'stroke' },
  });

  const quality = auditDataQuality(dataset);

  assert.equal(quality.rowCount, dataset.rows.length);
  assert.equal(quality.columnCount, dataset.metadata.columns.length);
  assert.ok(quality.completeness.overallMissingRate >= 0);
  assert.ok(quality.completeness.columnMissing.length > 0);

  // Check BMI missingness detected (known in kaggle stroke dataset)
  const bmiMissing = quality.completeness.columnMissing.find((c) => c.column === 'bmi');
  assert.ok(bmiMissing);
  assert.ok(bmiMissing.missingCount > 0, 'Must detect missing BMI values');

  // Check class balance detected
  assert.ok(quality.classBalance);
  assert.equal(quality.classBalance.targetColumn, 'stroke');
  assert.ok(quality.classBalance.isSevereImbalance, 'Stroke dataset has severe class imbalance (~5% positive prevalence)');
  assert.ok(quality.classBalance.imbalanceRatio > 10);

  // Check numerical distributions
  assert.ok(quality.distributions.numericColumns.some((n) => n.name === 'age'));
  const ageStats = quality.distributions.numericColumns.find((n) => n.name === 'age');
  assert.ok(ageStats);
  assert.ok(ageStats.min >= 0 && ageStats.max <= 100);

  // Check readiness scoring
  assert.ok(quality.readiness.score > 0 && quality.readiness.score <= 100);
  assert.ok(['A', 'B', 'C', 'D', 'F'].includes(quality.readiness.grade));
  assert.ok(quality.readiness.findings.length > 0);
  assert.ok(quality.readiness.recommendations.length > 0);
});

test('Dataset-Only Investigation: auditDataQuality flags missing keyword/location on disaster tweets dataset', () => {
  const fixturePath = join(process.cwd(), 'public', 'fixtures', 'kaggle_disaster_tweets.csv');
  const csvContent = readFileSync(fixturePath, 'utf8');

  const dataset = ingestEvaluationCsv(csvContent, 'kaggle_disaster_tweets.csv', {
    columnMapping: { targetColumn: 'target' },
  });

  const quality = auditDataQuality(dataset);

  assert.equal(quality.rowCount, dataset.rows.length);
  assert.ok(quality.completeness.columnMissing.some((c) => c.column === 'location' && c.missingCount > 0));
  assert.ok(quality.classBalance);
  assert.equal(quality.classBalance.targetColumn, 'target');
  assert.equal(quality.classBalance.classes.length, 2);

  // ID column should be candidate key
  assert.ok(quality.uniqueness.candidateKeyColumns.includes('id'));
});

test('Dataset-Only Investigation: Autonomous investigation runs end-to-end on stroke dataset without predictions', async () => {
  const fixturePath = join(process.cwd(), 'public', 'fixtures', 'kaggle_stroke_dataset.csv');
  const csvContent = readFileSync(fixturePath, 'utf8');

  const dataset = ingestEvaluationCsv(csvContent, 'kaggle_stroke_dataset.csv', {
    columnMapping: { targetColumn: 'stroke' },
  });

  // Verify initial state
  assert.equal(dataset.metadata.predictionColumn, null);
  assert.equal(dataset.metadata.probabilityColumn, null);

  const provider = new OfflineInvestigatorProvider();
  const generator = runAutonomousInvestigation(dataset, {
    provider,
    maxRounds: 8,
  });

  const events = [];
  let finalInvestigation = null;

  for await (const event of generator) {
    events.push(event);
    if (event.type === 'completed') {
      finalInvestigation = event.investigation;
    }
  }

  assert.ok(finalInvestigation, 'Investigation must complete successfully');
  assert.equal(finalInvestigation.status, 'completed');

  // Must have run profile_dataset
  const profileResult = finalInvestigation.toolResults.find((r) => r.tool === 'profile_dataset');
  assert.ok(profileResult, 'Must execute profile_dataset');
  assert.equal(profileResult.status, 'completed');

  // Must have formulated hypothesis
  assert.ok(finalInvestigation.hypotheses.length > 0, 'Must formulate data-driven hypothesis');

  // Must have screened feature leakage
  const leakageResult = finalInvestigation.toolResults.find((r) => r.tool === 'scan_feature_leakage');
  assert.ok(leakageResult, 'Must execute scan_feature_leakage against target stroke');

  // Must produce diagnosis
  assert.ok(finalInvestigation.diagnosis, 'Must conclude with diagnosis');
  assert.ok(finalInvestigation.diagnosis.summary.length > 0);

  // Derive stage: must NOT be stuck in 'profile'
  const finalStage = deriveInvestigationStage(finalInvestigation);
  assert.equal(finalStage, 'report', 'Completed investigation with diagnosis must advance to report stage');

  // Strictly ZERO model evaluation tools should have been dispatched
  const calledTools = finalInvestigation.toolCalls.map((c) => c.tool);
  assert.ok(!calledTools.includes('compute_classification_metrics'));
  assert.ok(!calledTools.includes('threshold_sweep'));
  assert.ok(!calledTools.includes('check_calibration'));
  assert.ok(!calledTools.includes('generate_repair_candidate'));
  assert.ok(!calledTools.includes('re_evaluate_repair'));
});

test('Dataset-Only Investigation: Autonomous investigation runs on unlabeled dataset', async () => {
  // Mock unlabeled dataset without target or predictions
  const csvData = [
    'sensor_id,temperature,humidity,pressure,site',
    's1,22.4,45.2,1013.2,site_a',
    's2,23.1,44.8,1012.9,site_a',
    's3,25.0,50.1,1011.5,site_b',
    's4,24.8,49.8,1011.8,site_b',
    's5,21.9,46.0,1013.5,site_a',
  ].join('\n');

  const dataset = ingestEvaluationCsv(csvData, 'sensors.csv');
  assert.equal(dataset.metadata.targetColumn, null);
  assert.equal(dataset.metadata.predictionColumn, null);
  assert.equal(dataset.metadata.task, 'unsupervised_profiling');

  const provider = new OfflineInvestigatorProvider();
  const generator = runAutonomousInvestigation(dataset, {
    provider,
    maxRounds: 6,
  });

  let finalInvestigation = null;
  for await (const event of generator) {
    if (event.type === 'completed') {
      finalInvestigation = event.investigation;
    }
  }

  assert.ok(finalInvestigation);
  assert.equal(finalInvestigation.status, 'completed');
  assert.ok(finalInvestigation.toolResults.some((r) => r.tool === 'profile_dataset'));
  assert.ok(finalInvestigation.diagnosis);
  assert.equal(deriveInvestigationStage(finalInvestigation), 'report');
});
