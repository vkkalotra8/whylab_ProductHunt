import type { EvaluationDataset } from './evaluation-ingestion.ts';
import { evaluateClassification } from './classification-metrics.ts';
import { profileEvaluationDataset } from './dataset-profiler.ts';
import { toolSchemas, type ToolInput } from '../domain/tool-contracts.ts';
import { evidenceSchema, verificationExperimentSchema } from '../domain/types.ts';
import { id, type Id, type Measurement } from '../domain/primitives.ts';
import { fail } from '../domain/schema.ts';

/** Exact class reweighting: deterministic for all seeds; never retrains or changes predictions. */
export function runCounterfactualTest(
  data: EvaluationDataset,
  input: ToolInput<'run_counterfactual_test'>,
  context: { experimentId: Id<'experiment'>; evidenceId: Id<'evidence'>; callId: Id<'call'> }
) {
  const request = toolSchemas.run_counterfactual_test.input.parse(input);
  id('experiment').parse(context.experimentId);
  id('evidence').parse(context.evidenceId);
  id('call').parse(context.callId);

  const criterion = request.criterion;
  if (
    criterion.metric !== 'accuracy_paradox_gap' ||
    criterion.operator !== 'at_least' ||
    criterion.unit !== 'percentage_points' ||
    criterion.value <= 0 ||
    criterion.value > 100
  ) {
    fail(
      '$.criterion',
      'accuracy_paradox_gap requires at_least a positive percentage-point threshold no greater than 100'
    );
  }

  profileEvaluationDataset(data);
  const report = evaluateClassification(data, {
    datasetId: request.datasetId,
    positiveLabel: request.positiveLabel,
  });
  const baseline = report.output.metrics;

  const get = (name: string) => {
    const m = baseline.find((m) => m.name === name);
    return m?.status === 'measured' ? m.value : null;
  };
  const accuracy = get('accuracy'),
    balanced = get('balanced_accuracy'),
    minority = get('minority_recall');
  const n = data.rows.length;

  const measured = (name: string, value: number, unit: Measurement['unit']): Measurement => ({
    name,
    status: 'measured',
    value,
    unit,
    sampleSize: n,
  });
  const unavailable = (name: string, unit: Measurement['unit']): Measurement => ({
    name,
    status: 'undefined',
    reason: 'Both classes and a unique minority class are required to test the full prediction.',
    unit,
    sampleSize: n,
  });

  const balancedGap = accuracy !== null && balanced !== null ? (accuracy - balanced) * 100 : null;
  const minorityGap = accuracy !== null && minority !== null ? (accuracy - minority) * 100 : null;
  const gap = balancedGap !== null && minorityGap !== null ? Math.min(balancedGap, minorityGap) : null;

  const comparison: Measurement[] = [
    balanced === null
      ? unavailable('equal_class_weight_accuracy', 'ratio')
      : measured('equal_class_weight_accuracy', balanced, 'ratio'),
    balancedGap === null
      ? unavailable('accuracy_minus_balanced_accuracy', 'percentage_points')
      : measured('accuracy_minus_balanced_accuracy', balancedGap, 'percentage_points'),
    minorityGap === null
      ? unavailable('accuracy_minus_minority_recall', 'percentage_points')
      : measured('accuracy_minus_minority_recall', minorityGap, 'percentage_points'),
    gap === null
      ? unavailable('accuracy_paradox_gap', 'percentage_points')
      : measured('accuracy_paradox_gap', gap, 'percentage_points'),
  ];

  const outcome =
    gap === null
      ? 'inconclusive'
      : gap >= criterion.value
      ? 'supports'
      : Math.max(balancedGap!, minorityGap!) >= criterion.value
      ? 'weakens'
      : 'rejects';

  const rationale =
    gap === null
      ? 'The joint prediction cannot be evaluated without both classes and a unique minority class.'
      : `At the declared ${criterion.value} percentage-point threshold, raw accuracy exceeds balanced accuracy by ${balancedGap} points and minority recall by ${minorityGap} points. Both passing supports the prediction; one passing weakens it; neither passing rejects this threshold-specific prediction on this dataset.`;

  const limitations = [
    ...report.limitations,
    'Exact 50/50 class reweighting preserves within-class outcomes and uses every row. It is not retraining, new observations, or evidence that imbalance caused training failure.',
    'The seed is retained for replay compatibility but is unused because this experiment has no random sampling.',
    'The declared gap threshold is a user policy, not a significance test. Rejection applies only to this dataset-specific prediction, not every class-imbalance hypothesis.',
    'Reported sample sizes count original observations, not synthetic weighted observations. No confidence interval is estimated.',
  ];

  const evidence = evidenceSchema.parse({
    id: context.evidenceId,
    kind: 'measurement',
    description: rationale,
    measurements: comparison,
    provenance: { kind: 'experiment', experimentId: context.experimentId },
  });

  const experiment = verificationExperimentSchema.parse({
    id: context.experimentId,
    hypothesisId: request.hypothesisId,
    prediction: `Raw accuracy exceeds both balanced accuracy and minority recall by at least ${criterion.value} percentage points.`,
    method:
      'accuracy_paradox_v1: fixed supplied predictions; exact equal-class weighting; minimum of the two raw-accuracy gaps.',
    seed: request.seed,
    callIds: [context.callId],
    criterion,
    status: 'completed',
    outcome,
    evidenceIds: [evidence.id],
    limitations,
  });

  const output = toolSchemas.run_counterfactual_test.output.parse({
    hypothesisId: request.hypothesisId,
    outcome,
    baseline,
    comparison,
    evidenceIds: [evidence.id],
    rationale,
  });

  return {
    output,
    experiment,
    evidence,
    datasetId: request.datasetId,
    sourceId: data.metadata.sourceId,
  };
}
