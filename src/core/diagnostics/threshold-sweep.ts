import { evaluateClassification, metricsFromConfusion } from './classification-metrics.ts';
import type { EvaluationDataset } from './evaluation-ingestion.ts';
import { evidenceSchema, type Evidence } from '../domain/types.ts';
import { toolSchemas, type ToolInput, type ToolOutput } from '../domain/tool-contracts.ts';
import { fail } from '../domain/schema.ts';

export type ThresholdSweepReport = {
  output: ToolOutput<'threshold_sweep'>;
  objective: 'minimize_expected_cost' | null;
  costs: ToolInput<'threshold_sweep'>['costs'];
  limitations: string[];
};

/** Positive prediction iff probability >= threshold. No retraining or policy application. */
export function runThresholdSweep(
  data: EvaluationDataset,
  input: ToolInput<'threshold_sweep'>,
  assumptions: readonly Evidence[] = []
): ThresholdSweepReport {
  const request = toolSchemas.threshold_sweep.input.parse(input);
  evaluateClassification(data, { datasetId: request.datasetId, positiveLabel: request.positiveLabel });

  if (!data.rows.length) fail('$.rows', 'threshold analysis requires evaluation rows');

  if (request.costs) {
    const matches = assumptions.filter((e) => e.id === request.costs!.assumptionEvidenceId);
    if (matches.length !== 1) {
      fail('$.costs', 'supply the unique referenced user-assumption evidence for the cost policy');
    }
    const e = evidenceSchema.parse(matches[0]);
    if (e.kind !== 'assumption' || e.provenance.kind !== 'source') {
      fail('$.costs', 'costs must reference an explicit user assumption');
    }
  }

  const ranked = data.rows
    .map((row, i) => {
      if (
        typeof row.positiveProbability !== 'number' ||
        !Number.isFinite(row.positiveProbability) ||
        row.positiveProbability < 0 ||
        row.positiveProbability > 1
      ) {
        fail(
          `$.rows[${i}].positiveProbability`,
          'every row needs a finite probability in [0,1] for threshold analysis'
        );
      }
      return { score: row.positiveProbability, positive: row.actual === data.labels.positive };
    })
    .sort((a, b) => b.score - a.score);

  const positives = ranked.filter((r) => r.positive).length,
    negatives = ranked.length - positives;
  let cursor = 0,
    tp = 0,
    fp = 0;
  const byThreshold = new Map<number, ToolOutput<'threshold_sweep'>['points'][number]>();
  let selectedThreshold: number | null = null,
    bestCost = Infinity;

  // Descending traversal updates each row once. Highest threshold wins exact cost ties.
  for (const threshold of [...request.thresholds].sort((a, b) => b - a)) {
    while (cursor < ranked.length && ranked[cursor].score >= threshold) {
      if (ranked[cursor].positive) tp++;
      else fp++;
      cursor++;
    }
    const confusion = {
      truePositive: tp,
      falsePositive: fp,
      trueNegative: negatives - fp,
      falseNegative: positives - tp,
    };
    const metrics = metricsFromConfusion(confusion);

    if (request.costs) {
      const cost =
        confusion.falseNegative * request.costs.falseNegativeCost +
        confusion.falsePositive * request.costs.falsePositiveCost;
      if (!Number.isFinite(cost)) fail('$.costs', 'total error cost overflows; use smaller cost units');
      metrics.push({
        name: 'expected_cost',
        status: 'measured',
        value: cost,
        unit: 'cost',
        sampleSize: ranked.length,
      });
      if (cost < bestCost) {
        bestCost = cost;
        selectedThreshold = threshold;
      }
    }
    byThreshold.set(threshold, { threshold, confusion, metrics });
  }

  const output = toolSchemas.threshold_sweep.output.parse({
    points: request.thresholds.map((t) => byThreshold.get(t)!),
    selectedThreshold,
  });

  const limitations = [
    'Every operating point uses the same evaluation rows and probability >= threshold.',
    'Selection, when requested through costs, minimizes total FN x FN cost + FP x FP cost over supplied candidates only. Exact cost ties choose the highest threshold.',
    'User-supplied costs are assumptions, not measured clinical or financial outcomes.',
    'Choosing a threshold on this dataset does not establish performance on a new holdout. No policy has been applied.',
    'A threshold of 1 still predicts positive for probability 1; the [0,1] candidate range does not always include an all-negative policy.',
  ];
  if (!request.costs) {
    limitations.push('No cost objective supplied: no operating point was selected.');
  }
  if (ranked.length < 30) {
    limitations.push('Fewer than 30 rows: estimates may be unstable; this is a heuristic warning.');
  }
  if (!positives || !negatives) {
    limitations.push('Only one true class is present; balanced accuracy and minority recall are undefined.');
  }

  return {
    output,
    objective: request.costs ? 'minimize_expected_cost' : null,
    costs: request.costs,
    limitations,
  };
}
