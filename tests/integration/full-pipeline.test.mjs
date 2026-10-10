import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ingestEvaluationCsv } from '../../src/core/diagnostics/evaluation-ingestion.ts';
import { profileEvaluationDataset } from '../../src/core/diagnostics/dataset-profiler.ts';
import { evaluateClassification } from '../../src/core/diagnostics/classification-metrics.ts';
import { runCounterfactualTest } from '../../src/core/diagnostics/counterfactual.ts';
import { runThresholdSweep } from '../../src/core/diagnostics/threshold-sweep.ts';
import { generateRepairCandidate } from '../../src/core/diagnostics/repair-candidates.ts';
import { reEvaluateRepair } from '../../src/core/diagnostics/repair-reevaluation.ts';
import { computeReliabilityProfile } from '../../src/core/diagnostics/reliability.ts';
import { generateIncidentReport } from '../../src/server/export/incident-report.ts';
import { exportIncidentReportToMarkdown } from '../../src/server/export/markdown-export.ts';
import { runAdversarialReview } from '../../src/core/falsification/adversarial-review.ts';
import { analyzeMultiSiteShift } from '../../src/core/diagnostics/multi-site-shift.ts';
import { createDraftInvestigation, deriveInvestigationStage } from '../../src/core/investigation/state-machine.ts';
import { validateInvestigation } from '../../src/core/domain/validation.ts';
import { createId } from '../../src/core/domain/primitives.ts';

const fixturesDir = join(process.cwd(), 'public', 'fixtures');

test('full pipeline integration: executes complete 10-stage lifecycle deterministically', () => {
  const csvContent = readFileSync(join(fixturesDir, 'melanoma-synthetic.csv'), 'utf8');

  // Stage 0: Create draft investigation
  const investigation = createDraftInvestigation('Full Pipeline Integration Audit');
  assert.equal(investigation.status, 'draft');
  assert.equal(deriveInvestigationStage(investigation), 'ingest');

  // Stage 1: Ingest evaluation CSV
  const dataset = ingestEvaluationCsv(csvContent, 'melanoma-synthetic.csv', {
    labels: { positive: '1', negative: '0' },
  });
  investigation.sources.push(dataset.source);
  investigation.datasets.push(dataset.metadata);
  assert.equal(dataset.rows.length, 100);

  // Stage 2: Profile dataset
  const profile = profileEvaluationDataset(dataset);
  assert.equal(profile.rowCount, 100);
  assert.equal(deriveInvestigationStage(investigation), 'profile');

  // Stage 3: Baseline metrics
  const baselineMetrics = evaluateClassification(dataset, {
    datasetId: dataset.metadata.id,
    positiveLabel: '1',
  });
  const baselineAccuracy = baselineMetrics.output.metrics.find((m) => m.name === 'accuracy');
  const baselineRecall = baselineMetrics.output.metrics.find((m) => m.name === 'recall');
  assert.equal(baselineAccuracy?.value, 0.92);
  assert.equal(baselineRecall?.value, 0.20);

  const baselineCallId = createId('call');
  const baselineResultId = createId('result');
  const baselineEvidenceId = createId('evidence');

  investigation.toolCalls.push({
    id: baselineCallId,
    investigationId: investigation.id,
    tool: 'compute_classification_metrics',
    toolVersion: 1,
    requestedAt: new Date().toISOString(),
    input: {
      datasetId: dataset.metadata.id,
      positiveLabel: '1',
    },
  });

  investigation.toolResults.push({
    id: baselineResultId,
    callId: baselineCallId,
    tool: 'compute_classification_metrics',
    toolVersion: 1,
    status: 'completed',
    completedAt: new Date().toISOString(),
    datasetIds: [dataset.metadata.id],
    evidenceIds: [baselineEvidenceId],
    limitations: baselineMetrics.limitations,
    output: baselineMetrics.output,
  });

  investigation.evidence.push({
    id: baselineEvidenceId,
    kind: 'measurement',
    description: 'Baseline evaluation shows 92% accuracy and 20% recall.',
    measurements: baselineMetrics.output.metrics,
    provenance: {
      kind: 'tool_result',
      resultId: baselineResultId,
    },
  });

  assert.equal(deriveInvestigationStage(investigation), 'investigate');

  // Stage 4: Formulate and falsify Accuracy Paradox hypothesis
  const hypId = createId('hypothesis');
  investigation.hypotheses.push({
    id: hypId,
    statement: 'Class imbalance suppresses minority melanoma recall at 0.50 cutoff.',
    status: 'supported',
    confidence: {
      kind: 'evidence_strength',
      level: 'strong',
      rationale: 'Counterfactual class reweighting proves paradox.',
    },
    evidence: [
      {
        evidenceId: baselineEvidenceId,
        relationship: 'supports',
        rationale: 'Raw accuracy conceals 80% false negative rate.',
      },
    ],
    unresolvedQuestions: [],
  });

  assert.equal(deriveInvestigationStage(investigation), 'verify');

  const expId = createId('experiment');
  const expEvId = createId('evidence');
  const expCallId = createId('call');

  investigation.toolCalls.push({
    id: expCallId,
    investigationId: investigation.id,
    tool: 'run_counterfactual_test',
    toolVersion: 1,
    requestedAt: new Date().toISOString(),
    input: {
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
  });

  const counterfactualRes = runCounterfactualTest(
    dataset,
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
    { experimentId: expId, evidenceId: expEvId, callId: expCallId }
  );

  assert.equal(counterfactualRes.experiment.outcome, 'supports');
  investigation.experiments.push(counterfactualRes.experiment);
  investigation.evidence.push(counterfactualRes.evidence);

  const expResultId = createId('result');
  investigation.toolResults.push({
    id: expResultId,
    callId: expCallId,
    tool: 'run_counterfactual_test',
    toolVersion: 1,
    status: 'completed',
    completedAt: new Date().toISOString(),
    datasetIds: [dataset.metadata.id],
    evidenceIds: [],
    limitations: [],
    output: counterfactualRes.output,
  });

  // Stage 5: Diagnosis
  investigation.diagnosis = {
    id: createId('diagnosis'),
    investigationId: investigation.id,
    status: 'completed',
    summary: 'Confirmed Accuracy Paradox: minority class omitted due to uncalibrated decision boundary.',
    evidenceIds: [baselineEvidenceId, expEvId],
    hypothesisIds: [hypId],
    primaryHypothesisId: hypId,
    confidence: {
      kind: 'evidence_strength',
      level: 'strong',
      rationale: 'Verified via counterfactual test.',
    },
    experimentIds: [expId],
    repairIds: [],
    comparisonIds: [],
    unresolvedQuestions: [],
    limitations: ['Evaluation limited to 100 rows.'],
  };

  assert.equal(deriveInvestigationStage(investigation), 'repair');

  // Stage 6: 101-point threshold sweep and repair optimization
  const thresholds101 = Array.from({ length: 101 }, (_, i) => Math.round(i) / 100);
  const costSourceId = createId('source');
  investigation.sources.push({
    id: costSourceId,
    kind: 'user_assumption',
    name: 'Clinical Cost Priority Assumption',
    capturedAt: new Date().toISOString(),
    contentDigest: null,
  });

  const costEvidenceId = createId('evidence');
  const costEvidence = {
    id: costEvidenceId,
    kind: 'assumption',
    description: 'Cost matrix: FN penalty = 20x, FP penalty = 1x.',
    measurements: [],
    provenance: {
      kind: 'source',
      sourceId: costSourceId,
      datasetId: null,
      rows: null,
      columns: [],
    },
  };
  investigation.evidence.push(costEvidence);

  const sweep = runThresholdSweep(
    dataset,
    {
      datasetId: dataset.metadata.id,
      positiveLabel: '1',
      thresholds: thresholds101,
      costs: {
        falseNegativeCost: 20,
        falsePositiveCost: 1,
        assumptionEvidenceId: costEvidenceId,
      },
    },
    investigation.evidence
  );
  assert.ok(sweep.output.selectedThreshold !== null);

  const repairReport = generateRepairCandidate(
    dataset,
    {
      datasetId: dataset.metadata.id,
      hypothesisId: hypId,
      positiveLabel: '1',
      targetMetric: 'cost',
      targetValue: null,
      costs: {
        falseNegativeCost: 20,
        falsePositiveCost: 1,
        assumptionEvidenceId: costEvidenceId,
      },
      criterion: {
        metric: 'recall',
        operator: 'at_least',
        value: 0.8,
        unit: 'ratio',
      },
    },
    [costEvidence]
  );
  assert.equal(repairReport.output.policy.threshold, 0.2);

  const repairId = createId('repair');
  const repairCandidate = {
    id: repairId,
    hypothesisId: hypId,
    kind: 'operating_policy',
    verification: 'evaluation_data',
    datasetId: dataset.metadata.id,
    policy: repairReport.output.policy,
    criterion: {
      metric: 'recall',
      operator: 'at_least',
      value: 0.8,
      unit: 'ratio',
    },
    rationale: repairReport.output.rationale,
    evidenceIds: [costEvidenceId],
  };
  investigation.repairs.push(repairCandidate);

  // Stage 7: Deterministic before/after re-evaluation on identical rows
  const reeval = reEvaluateRepair(dataset, {
    repairId,
    datasetId: dataset.metadata.id,
    positiveLabel: '1',
    baselineThreshold: 0.5,
    repairedThreshold: 0.2,
    criterion: {
      metric: 'recall',
      operator: 'at_least',
      value: 0.8,
      unit: 'ratio',
    },
    baselineEvidenceIds: [baselineEvidenceId],
  });
  assert.equal(reeval.output.status, 'passed');

  const reevalEvidenceId = createId('evidence');
  investigation.evidence.push({
    id: reevalEvidenceId,
    kind: 'measurement',
    description: reeval.output.rationale,
    measurements: reeval.output.repairedMetrics,
    provenance: {
      kind: 'source',
      sourceId: dataset.source.id,
      datasetId: dataset.metadata.id,
      rows: { first: 1, last: 100 },
      columns: [],
    },
  });

  const comparison = {
    id: createId('comparison'),
    repairId,
    datasetId: dataset.metadata.id,
    baselinePolicy: {
      threshold: 0.5,
      positiveLabel: '1',
      comparison: 'greater_than_or_equal',
      costs: null,
    },
    afterPolicy: repairCandidate.policy,
    baselineEvidenceIds: [baselineEvidenceId],
    afterEvidenceIds: [reevalEvidenceId],
    criterion: {
      metric: 'recall',
      operator: 'at_least',
      value: 0.8,
      unit: 'ratio',
    },
    status: reeval.output.status,
    limitations: reeval.limitations,
  };
  investigation.comparisons.push(comparison);
  investigation.diagnosis.repairIds = [repairId];
  investigation.diagnosis.comparisonIds = [comparison.id];
  assert.equal(deriveInvestigationStage(investigation), 'report');

  // Stage 8: 6-Dimension Evidence-Backed Reliability Profile
  const reliabilityProfile = computeReliabilityProfile(investigation);
  assert.equal(reliabilityProfile.totalDimensions, 6);
  assert.ok(reliabilityProfile.dimensions.length === 6);
  assert.ok(reliabilityProfile.assessedCount >= 2);

  // Stage 9: Executive Incident Report & Certified Markdown Export
  const incidentReport = generateIncidentReport(investigation);
  assert.equal(incidentReport.status, 'REMEDIATED');
  assert.ok(incidentReport.cicdPolicy.yamlConfig.includes('pipeline_gates:'));

  const markdownExport = exportIncidentReportToMarkdown(incidentReport);
  assert.ok(markdownExport.includes('# WhyLab 2.0 Certified ML Reliability Incident Report'));
  assert.ok(markdownExport.includes('Verified Remediation & Re-evaluation'));

  // Stage 10: Adversarial Review Falsification Battery
  const adversarialAudit = runAdversarialReview({
    dataset,
    investigation,
    minimumSampleSizeFloor: 30,
  });
  assert.equal(adversarialAudit.defenseStatus, 'defended');
  assert.equal(adversarialAudit.challenges.length, 5);
  assert.ok(adversarialAudit.refutedCount >= 3);

  // Final validation: Investigation aggregate satisfies all schema invariants
  assert.doesNotThrow(() => validateInvestigation(investigation));
});

test('full pipeline integration: multi-site dataset triggers compound disparity alert', () => {
  const csvContent = readFileSync(join(fixturesDir, 'site-failure.csv'), 'utf8');
  const dataset = ingestEvaluationCsv(csvContent, 'site-failure.csv', {
    labels: { positive: '1', negative: '0' },
  });

  const multiSite = analyzeMultiSiteShift(dataset, { column: 'site', sampleSizeFloor: 30 });
  assert.equal(multiSite.sites.length, 2);

  const audit = runAdversarialReview({ dataset, minimumSampleSizeFloor: 30 });
  assert.equal(audit.defenseStatus, 'compound_risk');
  assert.ok(audit.compoundCount >= 1);
});
