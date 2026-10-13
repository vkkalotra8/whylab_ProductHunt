import { evaluateClassification, metricsFromConfusion } from './classification-metrics.ts';
import type { EvaluationDataset } from './evaluation-ingestion.ts';
import { toolSchemas, type ToolInput, type ToolOutput } from '../domain/tool-contracts.ts';
import { fail } from '../domain/schema.ts';
import type { Measurement } from '../domain/primitives.ts';

export type HoldoutEvaluationResult = {
  baselineConfusion: { truePositive: number; falsePositive: number; trueNegative: number; falseNegative: number };
  repairedConfusion: { truePositive: number; falsePositive: number; trueNegative: number; falseNegative: number };
  baselineMetrics: readonly Measurement[];
  repairedMetrics: readonly Measurement[];
  confusionDelta: { truePositive: number; falsePositive: number; trueNegative: number; falseNegative: number };
  sampleSize: number;
};

export type RepairReevaluationReport = {
  output: ToolOutput<'re_evaluate_repair'>;
  limitations: string[];
  validationMode: 'single_cohort_optimization' | 'independent_holdout_validated';
  disclaimer: string;
  isHoldoutValidated: boolean;
  holdoutResults?: HoldoutEvaluationResult;
  leakageWarning?: string;
};

/**
 * Deterministically evaluates a proposed repair policy against baseline performance on
 * the optimization evaluation dataset, with optional scientific validation on an independent holdout dataset.
 */
export function reEvaluateRepair(
  data: EvaluationDataset,
  input: ToolInput<'re_evaluate_repair'>,
  holdoutData?: EvaluationDataset
): RepairReevaluationReport {
  const request = toolSchemas.re_evaluate_repair.input.parse(input);
  evaluateClassification(data, { datasetId: request.datasetId, positiveLabel: request.positiveLabel });

  if (!data.rows.length) {
    fail('$.rows', 'repair re-evaluation requires evaluation rows');
  }

  // Validate probabilities are present and finite on optimization dataset
  for (let i = 0; i < data.rows.length; i++) {
    const row = data.rows[i];
    if (
      typeof row.positiveProbability !== 'number' ||
      !Number.isFinite(row.positiveProbability) ||
      row.positiveProbability < 0 ||
      row.positiveProbability > 1
    ) {
      fail(
        `$.rows[${i}].positiveProbability`,
        'every row needs a finite probability in [0,1] for repair re-evaluation'
      );
    }
  }

  const evaluateRowsAtThreshold = (rows: EvaluationDataset['rows'], threshold: number) => {
    let tp = 0,
      fp = 0,
      tn = 0,
      fn = 0;
    for (const row of rows) {
      const isActualPositive = row.actual === request.positiveLabel;
      const isPredictedPositive = row.positiveProbability! >= threshold;
      if (isActualPositive) {
        if (isPredictedPositive) tp++;
        else fn++;
      } else {
        if (isPredictedPositive) fp++;
        else tn++;
      }
    }
    const confusion = { truePositive: tp, falsePositive: fp, trueNegative: tn, falseNegative: fn };
    const metrics = metricsFromConfusion(confusion);
    return { confusion, metrics };
  };

  const baseline = evaluateRowsAtThreshold(data.rows, request.baselineThreshold);
  const repaired = evaluateRowsAtThreshold(data.rows, request.repairedThreshold);

  const confusionDelta = {
    truePositive: repaired.confusion.truePositive - baseline.confusion.truePositive,
    falsePositive: repaired.confusion.falsePositive - baseline.confusion.falsePositive,
    trueNegative: repaired.confusion.trueNegative - baseline.confusion.trueNegative,
    falseNegative: repaired.confusion.falseNegative - baseline.confusion.falseNegative,
  };

  // Evaluate acceptance criterion
  const targetMetric = repaired.metrics.find((m) => m.name === request.criterion.metric);
  let criterionMet = false;
  let status: 'passed' | 'failed' | 'inconclusive' = 'failed';

  if (!targetMetric || targetMetric.status !== 'measured') {
    status = 'inconclusive';
  } else {
    const targetVal = targetMetric.value;
    if (request.criterion.operator === 'at_least') {
      criterionMet = targetVal >= request.criterion.value;
    } else {
      criterionMet = targetVal <= request.criterion.value;
    }
    status = criterionMet ? 'passed' : 'failed';
  }

  const getMetric = (metrics: readonly { name: string; status: string; value?: number }[], name: string): number => {
    const m = metrics.find((x) => x.name === name);
    return m && m.status === 'measured' && typeof m.value === 'number' ? m.value : 0;
  };

  const baseRecall = getMetric(baseline.metrics, 'recall');
  const repRecall = getMetric(repaired.metrics, 'recall');
  const baseAcc = getMetric(baseline.metrics, 'accuracy');
  const repAcc = getMetric(repaired.metrics, 'accuracy');

  let rationale =
    `Threshold adjustment from ${request.baselineThreshold.toFixed(2)} to ${request.repairedThreshold.toFixed(2)} ` +
    `shifted recall from ${(baseRecall * 100).toFixed(1)}% to ${(repRecall * 100).toFixed(1)}% ` +
    `and accuracy from ${(baseAcc * 100).toFixed(1)}% to ${(repAcc * 100).toFixed(1)}%. ` +
    `False negatives changed by ${confusionDelta.falseNegative > 0 ? '+' : ''}${confusionDelta.falseNegative}, ` +
    `false positives changed by ${confusionDelta.falsePositive > 0 ? '+' : ''}${confusionDelta.falsePositive}. ` +
    `Criterion '${request.criterion.metric} ${request.criterion.operator} ${request.criterion.value}' ` +
    `${criterionMet ? 'was satisfied.' : 'was not satisfied.'}`;

  const limitations = [
    'Re-evaluation is computed on the identical evaluation rows supplied by the user.',
    'Threshold policy shifts adjust operating sensitivity without retraining model parameters.',
    'Does not constitute independent prospective validation on future or external data splits.',
  ];

  let validationMode: 'single_cohort_optimization' | 'independent_holdout_validated' = 'single_cohort_optimization';
  let isHoldoutValidated = false;
  let holdoutResults: HoldoutEvaluationResult | undefined;
  let leakageWarning: string | undefined;

  // Scientific Holdout Validation Evaluation
  if (holdoutData && holdoutData.rows.length > 0) {
    // Check for identical dataset ID or overlapping sample signatures
    if (holdoutData.metadata.id === data.metadata.id) {
      leakageWarning =
        'Data Contamination Warning: Holdout dataset has the identical ID as the optimization dataset. This does not represent independent validation.';
    } else {
      // Check row-level overlap (leakage)
      const optKeys = new Set(data.rows.map((r) => `${r.actual}_${r.positiveProbability?.toFixed(6)}_${JSON.stringify(r.attributes)}`));
      let matchCount = 0;
      for (const hr of holdoutData.rows) {
        const key = `${hr.actual}_${hr.positiveProbability?.toFixed(6)}_${JSON.stringify(hr.attributes)}`;
        if (optKeys.has(key)) matchCount++;
      }
      if (matchCount > 0 && matchCount >= holdoutData.rows.length * 0.5) {
        leakageWarning = `Data Contamination Warning: ${matchCount} of ${holdoutData.rows.length} holdout rows duplicate samples in the optimization dataset.`;
      }
    }

    const holdoutBaseline = evaluateRowsAtThreshold(holdoutData.rows, request.baselineThreshold);
    const holdoutRepaired = evaluateRowsAtThreshold(holdoutData.rows, request.repairedThreshold);

    const holdoutConfusionDelta = {
      truePositive: holdoutRepaired.confusion.truePositive - holdoutBaseline.confusion.truePositive,
      falsePositive: holdoutRepaired.confusion.falsePositive - holdoutBaseline.confusion.falsePositive,
      trueNegative: holdoutRepaired.confusion.trueNegative - holdoutBaseline.confusion.trueNegative,
      falseNegative: holdoutRepaired.confusion.falseNegative - holdoutBaseline.confusion.falseNegative,
    };

    holdoutResults = {
      baselineConfusion: holdoutBaseline.confusion,
      repairedConfusion: holdoutRepaired.confusion,
      baselineMetrics: holdoutBaseline.metrics,
      repairedMetrics: holdoutRepaired.metrics,
      confusionDelta: holdoutConfusionDelta,
      sampleSize: holdoutData.rows.length,
    };

    if (!leakageWarning) {
      validationMode = 'independent_holdout_validated';
      isHoldoutValidated = true;
      const hBaseRecall = getMetric(holdoutBaseline.metrics, 'recall');
      const hRepRecall = getMetric(holdoutRepaired.metrics, 'recall');
      rationale += ` Independent holdout validation (n=${holdoutData.rows.length}) confirmed recall shifted from ${(hBaseRecall * 100).toFixed(1)}% to ${(hRepRecall * 100).toFixed(1)}%.`;
      limitations.push(`Holdout Generalization: Verified on separate holdout partition of ${holdoutData.rows.length} records.`);
    } else {
      limitations.push(`Contamination Warning: ${leakageWarning}`);
    }
  }

  if (validationMode === 'single_cohort_optimization') {
    limitations.push(
      '[SAFEGUARD DISCLAIMER] Optimization Cohort Only (Not Holdout): Threshold discovery and re-evaluation were conducted on the identical cohort. Reported metrics reflect training optimization and may overestimate true out-of-sample generalization. Independent holdout validation is strongly recommended prior to production deployment.'
    );
  }

  const disclaimer =
    validationMode === 'independent_holdout_validated'
      ? 'Holdout Validated: Policy generalization confirmed on independent holdout partition.'
      : 'Optimization Cohort Only (Not Holdout): Threshold was discovered and evaluated on the same cohort. Independent holdout validation is required.';

  const output: ToolOutput<'re_evaluate_repair'> = toolSchemas.re_evaluate_repair.output.parse({
    repairId: request.repairId,
    datasetId: request.datasetId,
    status,
    baselineMetrics: baseline.metrics,
    repairedMetrics: repaired.metrics,
    confusionDelta,
    criterionMet,
    rationale,
    limitations,
  });

  return {
    output,
    limitations,
    validationMode,
    disclaimer,
    isHoldoutValidated,
    holdoutResults,
    leakageWarning,
  };
}
