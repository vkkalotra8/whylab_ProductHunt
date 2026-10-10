import { evaluateClassification, metricsFromConfusion } from './classification-metrics.ts';
import type { EvaluationDataset } from './evaluation-ingestion.ts';
import { toolSchemas, type ToolInput, type ToolOutput } from '../domain/tool-contracts.ts';
import { fail } from '../domain/schema.ts';

export type RepairReevaluationReport = {
  output: ToolOutput<'re_evaluate_repair'>;
  limitations: string[];
};

/**
 * Deterministically evaluates a proposed repair policy against baseline performance on
 * identical rows of the evaluation dataset under identical criteria.
 */
export function reEvaluateRepair(
  data: EvaluationDataset,
  input: ToolInput<'re_evaluate_repair'>
): RepairReevaluationReport {
  const request = toolSchemas.re_evaluate_repair.input.parse(input);
  evaluateClassification(data, { datasetId: request.datasetId, positiveLabel: request.positiveLabel });

  if (!data.rows.length) {
    fail('$.rows', 'repair re-evaluation requires evaluation rows');
  }

  // Validate probabilities are present and finite
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

  const evaluateAtThreshold = (threshold: number) => {
    let tp = 0,
      fp = 0,
      tn = 0,
      fn = 0;
    for (const row of data.rows) {
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

  const baseline = evaluateAtThreshold(request.baselineThreshold);
  const repaired = evaluateAtThreshold(request.repairedThreshold);

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

  const rationale =
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
  };
}
