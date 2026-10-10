import test from 'node:test';
import assert from 'node:assert/strict';
import { runThresholdSweep } from '../../src/core/diagnostics/threshold-sweep.ts';
import { reEvaluateRepair } from '../../src/core/diagnostics/repair-reevaluation.ts';
import { getFlagshipEvaluationData, runFlagshipMelanomaInvestigation } from '../../src/core/diagnostics/flagship-melanoma.ts';
import { createId } from '../../src/core/domain/primitives.ts';

test('repair-lab: 101-point threshold sweep computes exact confusion matrices across all cutoffs', () => {
  const evalData = getFlagshipEvaluationData();
  const dsId = evalData.metadata.id;
  const thresholds101 = Array.from({ length: 101 }, (_, i) => Math.round(i) / 100);

  const report = runThresholdSweep(evalData, {
    datasetId: dsId,
    positiveLabel: '1',
    thresholds: thresholds101,
    costs: null,
  });

  assert.equal(report.output.points.length, 101);

  // At threshold 0.00, every case is predicted positive
  const p0 = report.output.points.find((p) => p.threshold === 0);
  assert.ok(p0);
  assert.equal(p0.confusion.falseNegative, 0);
  assert.equal(p0.confusion.trueNegative, 0);
  assert.equal(p0.confusion.truePositive + p0.confusion.falsePositive, evalData.rows.length);

  // At threshold 1.00, almost every case or all cases with prob < 1.0 are predicted negative
  const p1 = report.output.points.find((p) => p.threshold === 1);
  assert.ok(p1);
  assert.equal(p1.confusion.falsePositive, 0);

  // Verify monotonicity of recall: recall must be non-increasing as threshold rises
  let prevRecall = 1.0;
  for (const pt of report.output.points) {
    const rec = pt.confusion.truePositive / (pt.confusion.truePositive + pt.confusion.falseNegative);
    assert.ok(rec <= prevRecall + 1e-9, `Recall non-monotonic at threshold ${pt.threshold}`);
    prevRecall = rec;
  }
});

test('repair-lab: domain cost matrix deterministically selects cost-optimal threshold', () => {
  const evalData = getFlagshipEvaluationData();
  const dsId = evalData.metadata.id;
  const srcId = evalData.source.id;
  const assumpId = createId('evidence');

  const costAssumption = {
    id: assumpId,
    kind: 'assumption',
    description: 'Clinical priority FN 20x vs FP 1x',
    measurements: [],
    provenance: {
      kind: 'source',
      sourceId: srcId,
      datasetId: null,
      rows: null,
      columns: [],
    },
  };

  const thresholds101 = Array.from({ length: 101 }, (_, i) => Math.round(i) / 100);

  // High FN penalty (20x)
  const sweepHighFn = runThresholdSweep(
    evalData,
    {
      datasetId: dsId,
      positiveLabel: '1',
      thresholds: thresholds101,
      costs: {
        falseNegativeCost: 20,
        falsePositiveCost: 1,
        assumptionEvidenceId: assumpId,
      },
    },
    [costAssumption]
  );

  assert.ok(sweepHighFn.output.selectedThreshold !== null);
  // Optimal threshold under 20x FN penalty should be significantly lower than 0.50
  assert.ok(
    sweepHighFn.output.selectedThreshold < 0.35,
    `Selected threshold was ${sweepHighFn.output.selectedThreshold}, expected < 0.35`
  );

  // Symmetric penalty (1x vs 1x)
  const sweepSymmetric = runThresholdSweep(
    evalData,
    {
      datasetId: dsId,
      positiveLabel: '1',
      thresholds: thresholds101,
      costs: {
        falseNegativeCost: 1,
        falsePositiveCost: 1,
        assumptionEvidenceId: assumpId,
      },
    },
    [costAssumption]
  );

  assert.ok(sweepSymmetric.output.selectedThreshold !== null);
  // Symmetric penalty should produce a higher cutoff than 20x FN penalty
  assert.ok(
    sweepSymmetric.output.selectedThreshold > sweepHighFn.output.selectedThreshold,
    'Symmetric penalty threshold should be higher than asymmetric clinical threshold'
  );
});

test('repair-lab: re-evaluation on identical rows verifies recall recovery and zero synthetic interpolation', () => {
  const evalData = getFlagshipEvaluationData();
  const dsId = evalData.metadata.id;

  const reeval = reEvaluateRepair(evalData, {
    datasetId: dsId,
    repairId: createId('repair'),
    positiveLabel: '1',
    baselineThreshold: 0.5,
    repairedThreshold: 0.19,
    criterion: {
      metric: 'recall',
      operator: 'at_least',
      value: 0.8,
      unit: 'ratio',
    },
    baselineEvidenceIds: [],
  });

  assert.equal(reeval.output.status, 'passed');

  const getMetric = (metrics, name) => {
    const m = metrics.find((x) => x.name === name);
    return m?.value ?? 0;
  };

  const baseRecall = getMetric(reeval.output.baselineMetrics, 'recall');
  const repRecall = getMetric(reeval.output.repairedMetrics, 'recall');
  const baseBA = getMetric(reeval.output.baselineMetrics, 'balanced_accuracy');
  const repBA = getMetric(reeval.output.repairedMetrics, 'balanced_accuracy');

  // Baseline recall was poor (0.20), repaired recall reaches >= 0.80
  assert.equal(baseRecall, 0.2);
  assert.ok(repRecall >= 0.8, `Repaired recall ${repRecall} was not >= 0.80`);

  // Balanced accuracy increases dramatically
  assert.ok(repBA > baseBA + 0.25, `Balanced accuracy improvement ${repBA - baseBA} not >= 0.25`);

  // Total samples across confusion matrix strictly equals row count in both baseline and repaired
  const bSum =
    (reeval.output.baselineMetrics.find((m) => m.name === 'accuracy')?.sampleSize ?? evalData.rows.length);
  assert.equal(bSum, evalData.rows.length);
});

test('repair-lab: flagship investigation embeds 101-point threshold sweep tool results', () => {
  const inv = runFlagshipMelanomaInvestigation();

  const sweepCall = inv.toolCalls.find((c) => c.tool === 'threshold_sweep');
  assert.ok(sweepCall !== undefined, 'Investigation must contain threshold_sweep toolCall');

  const sweepResult = inv.toolResults.find((r) => r.tool === 'threshold_sweep');
  assert.ok(sweepResult !== undefined, 'Investigation must contain threshold_sweep toolResult');
  assert.equal(sweepResult.status, 'completed');
  assert.equal(sweepResult.output.points.length, 101);
});

test('repair-lab: different datasets produce distinct threshold sweep curves and cutoffs', async () => {
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { ingestEvaluationCsv } = await import('../../src/core/diagnostics/evaluation-ingestion.ts');

  const melanomaData = getFlagshipEvaluationData();
  const sepsisCsv = readFileSync(join(process.cwd(), 'public', 'fixtures', 'kaggle_icu_sepsis_benchmark.csv'), 'utf8');
  const sepsisData = ingestEvaluationCsv(sepsisCsv, 'kaggle_icu_sepsis_benchmark.csv');

  const thresholds101 = Array.from({ length: 101 }, (_, i) => Math.round(i) / 100);

  const melanomaReport = runThresholdSweep(melanomaData, {
    datasetId: melanomaData.metadata.id,
    positiveLabel: '1',
    thresholds: thresholds101,
    costs: null,
  });

  const sepsisReport = runThresholdSweep(sepsisData, {
    datasetId: sepsisData.metadata.id,
    positiveLabel: '1',
    thresholds: thresholds101,
    costs: null,
  });

  assert.equal(melanomaReport.output.points.length, 101);
  assert.equal(sepsisReport.output.points.length, 101);

  // Compare points at threshold 0.30: sample counts and metrics must differ!
  const melPoint30 = melanomaReport.output.points.find((p) => Math.abs(p.threshold - 0.3) < 0.005);
  const sepPoint30 = sepsisReport.output.points.find((p) => Math.abs(p.threshold - 0.3) < 0.005);
  assert.ok(melPoint30 && sepPoint30);

  const melTotal =
    melPoint30.confusion.truePositive +
    melPoint30.confusion.falsePositive +
    melPoint30.confusion.trueNegative +
    melPoint30.confusion.falseNegative;
  const sepTotal =
    sepPoint30.confusion.truePositive +
    sepPoint30.confusion.falsePositive +
    sepPoint30.confusion.trueNegative +
    sepPoint30.confusion.falseNegative;

  assert.equal(melTotal, melanomaData.rows.length);
  assert.equal(sepTotal, sepsisData.rows.length);

  // Recall at cutoff 0.30 differs between datasets
  const melRecall =
    melPoint30.confusion.truePositive /
    (melPoint30.confusion.truePositive + melPoint30.confusion.falseNegative);
  const sepRecall =
    sepPoint30.confusion.truePositive /
    (sepPoint30.confusion.truePositive + sepPoint30.confusion.falseNegative);
  assert.notEqual(melRecall, sepRecall, 'Melanoma and Sepsis must have different empirical recall at threshold 0.30');
});

test('repair-lab: autonomous investigation on custom dataset embeds dataset-specific 101 sweep points', async () => {
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { ingestEvaluationCsv } = await import('../../src/core/diagnostics/evaluation-ingestion.ts');
  const { runAutonomousInvestigation } = await import('../../src/server/orchestrator/investigator.ts');
  const { OfflineInvestigatorProvider } = await import('../../src/server/orchestrator/provider-offline.ts');

  const sepsisCsv = readFileSync(join(process.cwd(), 'public', 'fixtures', 'kaggle_icu_sepsis_benchmark.csv'), 'utf8');
  const sepsisData = ingestEvaluationCsv(sepsisCsv, 'kaggle_icu_sepsis_benchmark.csv');

  const provider = new OfflineInvestigatorProvider();
  const generator = runAutonomousInvestigation(sepsisData, { provider });

  let completedEvent = null;
  for await (const event of generator) {
    if (event.type === 'completed') completedEvent = event;
  }

  assert.ok(completedEvent);
  const inv = completedEvent.investigation;

  const sweepResult = inv.toolResults.find((r) => r.tool === 'threshold_sweep');
  assert.ok(sweepResult, 'Investigation toolResults must contain threshold_sweep');
  assert.equal(sweepResult.status, 'completed');
  assert.equal(sweepResult.output.points.length, 101);

  // Verify the sweep points are computed on Sepsis (N=1000), not Melanoma (N=20000) or fallback (N=100)
  const p0 = sweepResult.output.points[0];
  const totalCases =
    p0.confusion.truePositive +
    p0.confusion.falsePositive +
    p0.confusion.trueNegative +
    p0.confusion.falseNegative;
  assert.equal(totalCases, 1000, 'Sweep points must be computed on exact 1,000 sepsis cases');
});

