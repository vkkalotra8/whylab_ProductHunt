import type { Hypothesis, VerificationExperiment } from '../domain/types.ts';
import type { Id } from '../domain/primitives.ts';
import type { ToolName } from '../domain/tool-contracts.ts';

export type FalsificationVerdict =
  | 'supported'
  | 'weakened'
  | 'rejected'
  | 'inconclusive'
  | 'untested';

export interface NextActionRecommendation {
  stage: 'repair' | 'investigate' | 'profile' | 'report';
  title: string;
  description: string;
  recommendedTool?: ToolName;
}

export interface FalsificationEvaluation {
  hypothesisId: Id<'hypothesis'>;
  statement: string;
  verdict: FalsificationVerdict;
  confidenceScore: number; // 0.0 to 1.0
  decisionRationale: string;
  nextAction: NextActionRecommendation;
  experimentsEvaluated: number;
  supportingEvidenceCount: number;
  weakeningEvidenceCount: number;
  rejectingEvidenceCount: number;
}

/**
 * Deterministically evaluates a hypothesis against formal falsification criteria
 * based on associated verification experiments and grounded evidence.
 */
export function evaluateHypothesisFalsification(
  hypothesis: Hypothesis,
  experiments: readonly VerificationExperiment[]
): FalsificationEvaluation {
  const matchingExperiments = experiments.filter(
    (exp) => exp.hypothesisId === hypothesis.id && exp.status === 'completed'
  );

  const supportingCount = hypothesis.evidence.filter((e) => e.relationship === 'supports').length;
  const weakeningCount = hypothesis.evidence.filter((e) => e.relationship === 'weakens').length;
  const rejectingCount = hypothesis.evidence.filter((e) => e.relationship === 'rejects').length;

  // Untested hypothesis case
  if (matchingExperiments.length === 0) {
    return {
      hypothesisId: hypothesis.id,
      statement: hypothesis.statement,
      verdict: 'untested',
      confidenceScore: 0.25,
      decisionRationale:
        'Hypothesis has been formulated but no verification or falsification experiment has completed.',
      nextAction: {
        stage: 'investigate',
        title: 'Run Falsification Experiment',
        description:
          'Execute deterministic counterfactual class reweighting (run_counterfactual_test) to test for majority-class dominance.',
        recommendedTool: 'run_counterfactual_test',
      },
      experimentsEvaluated: 0,
      supportingEvidenceCount: supportingCount,
      weakeningEvidenceCount: weakeningCount,
      rejectingEvidenceCount: rejectingCount,
    };
  }

  const outcomes = matchingExperiments.map((exp) => exp.outcome);

  // If any experiment rejected the prediction
  if (outcomes.includes('rejects')) {
    return {
      hypothesisId: hypothesis.id,
      statement: hypothesis.statement,
      verdict: 'rejected',
      confidenceScore: 0.1,
      decisionRationale:
        'Controlled counterfactual verification contradicted the predicted failure mechanism on this evaluation dataset.',
      nextAction: {
        stage: 'investigate',
        title: 'Abandon Hypothesis & Pivot Diagnosis',
        description:
          'Class imbalance distortion is rejected as the primary cause. Test probability reliability (check_calibration) or proxy correlation (scan_feature_leakage).',
        recommendedTool: 'check_calibration',
      },
      experimentsEvaluated: matchingExperiments.length,
      supportingEvidenceCount: supportingCount,
      weakeningEvidenceCount: weakeningCount,
      rejectingEvidenceCount: rejectingCount,
    };
  }

  // If any experiment weakened the prediction
  if (outcomes.includes('weakens')) {
    return {
      hypothesisId: hypothesis.id,
      statement: hypothesis.statement,
      verdict: 'weakened',
      confidenceScore: 0.45,
      decisionRationale:
        'Counterfactual experiment partially met criteria; gap between accuracy and balanced accuracy was lower than declared threshold.',
      nextAction: {
        stage: 'investigate',
        title: 'Investigate Subgroup Slices',
        description:
          'Evaluate performance across metadata slices (site, environment, demographic) to isolate whether degradation is concentrated in specific cohorts.',
        recommendedTool: 'slice_evaluation',
      },
      experimentsEvaluated: matchingExperiments.length,
      supportingEvidenceCount: supportingCount,
      weakeningEvidenceCount: weakeningCount,
      rejectingEvidenceCount: rejectingCount,
    };
  }

  // If all experiments yielded inconclusive
  if (outcomes.every((o) => o === 'inconclusive')) {
    return {
      hypothesisId: hypothesis.id,
      statement: hypothesis.statement,
      verdict: 'inconclusive',
      confidenceScore: 0.3,
      decisionRationale:
        'Counterfactual tests could not be evaluated conclusively (e.g. single-class evaluation dataset or identical class sizes).',
      nextAction: {
        stage: 'profile',
        title: 'Enrich Evaluation Sample',
        description:
          'Ingest additional evaluation data containing confirmed positive and negative instances.',
        recommendedTool: 'profile_dataset',
      },
      experimentsEvaluated: matchingExperiments.length,
      supportingEvidenceCount: supportingCount,
      weakeningEvidenceCount: weakeningCount,
      rejectingEvidenceCount: rejectingCount,
    };
  }

  // All completed experiments supported the prediction
  return {
    hypothesisId: hypothesis.id,
    statement: hypothesis.statement,
    verdict: 'supported',
    confidenceScore: 0.95,
    decisionRationale:
      'Counterfactual class reweighting confirmed Accuracy Paradox distortion: raw accuracy conceals severe minority class recall suppression.',
    nextAction: {
      stage: 'repair',
      title: 'Proceed to Operating Policy Optimization',
      description:
        'Generate and re-evaluate a cost-optimal operating threshold in the Repair Lab to recover critical minority recall.',
      recommendedTool: 'generate_repair_candidate',
    },
    experimentsEvaluated: matchingExperiments.length,
    supportingEvidenceCount: supportingCount,
    weakeningEvidenceCount: weakeningCount,
    rejectingEvidenceCount: rejectingCount,
  };
}
