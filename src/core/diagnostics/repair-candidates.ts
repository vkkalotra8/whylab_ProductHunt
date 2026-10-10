import { evaluateClassification } from './classification-metrics.ts';
import type { EvaluationDataset } from './evaluation-ingestion.ts';
import { runThresholdSweep } from './threshold-sweep.ts';
import { evidenceSchema, type Evidence } from '../domain/types.ts';
import { toolSchemas, type ToolInput, type ToolOutput } from '../domain/tool-contracts.ts';
import { fail } from '../domain/schema.ts';

export type RepairCandidateReport = {
  output: ToolOutput<'generate_repair_candidate'>;
  limitations: string[];
};

/**
 * Deterministically generates an optimal operating policy repair candidate based on
 * cost minimization, target recall constraint, or balanced accuracy maximization.
 */
export function generateRepairCandidate(
  data: EvaluationDataset,
  input: ToolInput<'generate_repair_candidate'>,
  assumptions: readonly Evidence[] = []
): RepairCandidateReport {
  const request = toolSchemas.generate_repair_candidate.input.parse(input);
  evaluateClassification(data, { datasetId: request.datasetId, positiveLabel: request.positiveLabel });

  if (!data.rows.length) {
    fail('$.rows', 'repair candidate generation requires evaluation rows');
  }

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

  // Generate 101 thresholds from 0.00 to 1.00 with step 0.01
  const thresholds: number[] = [];
  for (let i = 0; i <= 100; i++) {
    thresholds.push(Math.round(i) / 100);
  }

  const sweep = runThresholdSweep(
    data,
    {
      datasetId: request.datasetId,
      positiveLabel: request.positiveLabel,
      thresholds,
      costs: request.costs,
    },
    assumptions
  );

  const points = sweep.output.points;

  let selectedPoint = points[0];
  let selectionRationale = '';

  if (request.targetMetric === 'cost') {
    if (!request.costs) {
      fail('$.costs', 'cost policy must be supplied when targetMetric is cost');
    }
    // sweep already found the optimal cost threshold (selectedThreshold)
    const optimal = points.find((p) => p.threshold === sweep.output.selectedThreshold);
    if (!optimal) {
      fail('$.targetMetric', 'failed to identify cost-optimal threshold point');
    }
    selectedPoint = optimal;
    const costMetric = selectedPoint.metrics.find((m) => m.name === 'expected_cost');
    const costVal = costMetric?.status === 'measured' ? costMetric.value : 0;
    selectionRationale = `Threshold ${selectedPoint.threshold.toFixed(
      2
    )} minimizes total expected misclassification cost to ${costVal} under the declared FN cost (${
      request.costs.falseNegativeCost
    }) and FP cost (${request.costs.falsePositiveCost}).`;
  } else if (request.targetMetric === 'recall') {
    const targetRecall = request.targetValue ?? 0.8;
    if (targetRecall < 0 || targetRecall > 1) {
      fail('$.targetValue', 'target recall must be in [0, 1]');
    }

    const getMetric = (point: (typeof points)[number], name: string): number => {
      const m = point.metrics.find((x) => x.name === name);
      return m && m.status === 'measured' ? m.value : 0;
    };

    // Filter points meeting recall constraint
    const qualifying = points.filter((p) => getMetric(p, 'recall') >= targetRecall);

    if (qualifying.length > 0) {
      // Pick the qualifying point with highest precision (or highest accuracy if tied),
      // breaking further ties with highest threshold.
      qualifying.sort((a, b) => {
        const precA = getMetric(a, 'precision');
        const precB = getMetric(b, 'precision');
        if (Math.abs(precB - precA) > 1e-9) return precB - precA;
        const accA = getMetric(a, 'accuracy');
        const accB = getMetric(b, 'accuracy');
        if (Math.abs(accB - accA) > 1e-9) return accB - accA;
        return b.threshold - a.threshold;
      });
      selectedPoint = qualifying[0];
      const actualRecall = getMetric(selectedPoint, 'recall');
      selectionRationale = `Threshold ${selectedPoint.threshold.toFixed(
        2
      )} satisfies target recall constraint >= ${(targetRecall * 100).toFixed(1)}% (achieving ${(
        actualRecall * 100
      ).toFixed(1)}%) while maximizing operating precision.`;
    } else {
      // No point meets target recall; select the highest recall available (lowest threshold)
      points.sort((a, b) => getMetric(b, 'recall') - getMetric(a, 'recall'));
      selectedPoint = points[0];
      selectionRationale = `No threshold achieved target recall >= ${(targetRecall * 100).toFixed(
        1
      )}%. Selected threshold ${selectedPoint.threshold.toFixed(2)} maximizes achievable recall.`;
    }
  } else if (request.targetMetric === 'balanced_accuracy') {
    // Find point that maximizes balanced accuracy
    let bestBalancedAcc = -1;
    for (const p of points) {
      const bal = p.metrics.find((m) => m.name === 'balanced_accuracy');
      const val = bal && bal.status === 'measured' ? bal.value : -1;
      if (val > bestBalancedAcc || (Math.abs(val - bestBalancedAcc) < 1e-9 && p.threshold > selectedPoint.threshold)) {
        bestBalancedAcc = val;
        selectedPoint = p;
      }
    }
    selectionRationale = `Threshold ${selectedPoint.threshold.toFixed(
      2
    )} maximizes balanced accuracy at ${(bestBalancedAcc * 100).toFixed(1)}%.`;
  }

  const limitations = [
    ...sweep.limitations,
    'Operating threshold shifts adjust decision boundary sensitivity without retraining or feature modification.',
    'Performance estimates are derived from the supplied evaluation dataset; out-of-distribution performance may differ.',
    'Threshold optimization assumes probability estimates are monotonically ordered relative to true risk.',
  ];

  const output: ToolOutput<'generate_repair_candidate'> = toolSchemas.generate_repair_candidate.output.parse({
    hypothesisId: request.hypothesisId,
    datasetId: request.datasetId,
    selectedThreshold: selectedPoint.threshold,
    policy: {
      threshold: selectedPoint.threshold,
      positiveLabel: request.positiveLabel,
      comparison: 'greater_than_or_equal',
      costs: request.costs,
    },
    projectedConfusion: selectedPoint.confusion,
    projectedMetrics: selectedPoint.metrics,
    rationale: selectionRationale,
    limitations,
  });

  return {
    output,
    limitations,
  };
}
