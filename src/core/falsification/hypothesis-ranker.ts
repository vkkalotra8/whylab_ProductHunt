import type { Investigation, Hypothesis, VerificationExperiment } from '../domain/types.ts';
import { evaluateHypothesisFalsification, type FalsificationEvaluation } from './falsification-engine.ts';

export interface RankedHypothesis {
  rank: number;
  hypothesis: Hypothesis;
  evaluation: FalsificationEvaluation;
  rankingScore: number;
  isPrimaryCandidate: boolean;
}

const statusWeight: Record<Hypothesis['status'], number> = {
  confirmed: 1000,
  supported: 800,
  proposed: 400,
  weakened: 200,
  rejected: 0,
};

const confidenceWeight: Record<Hypothesis['confidence']['level'], number> = {
  strong: 150,
  moderate: 100,
  limited: 50,
  unassessed: 0,
};

/**
 * Computes a deterministic numerical ranking score for a candidate hypothesis.
 */
function computeHypothesisScore(
  hypothesis: Hypothesis,
  evaluation: FalsificationEvaluation,
  matchingExperiments: readonly VerificationExperiment[]
): number {
  let score = statusWeight[hypothesis.status] ?? 0;
  score += confidenceWeight[hypothesis.confidence.level] ?? 0;

  // Add evidence relationship bonuses
  score += evaluation.supportingEvidenceCount * 25;
  score -= evaluation.weakeningEvidenceCount * 30;
  score -= evaluation.rejectingEvidenceCount * 100;

  // Add experiment outcome scores
  for (const exp of matchingExperiments) {
    if (exp.outcome === 'supports') score += 100;
    else if (exp.outcome === 'weakens') score -= 50;
    else if (exp.outcome === 'rejects') score -= 250;
  }

  return score;
}

/**
 * Deterministically ranks all hypotheses in an investigation by empirical verification strength.
 */
export function rankInvestigationHypotheses(
  hypotheses: readonly Hypothesis[],
  experiments: readonly VerificationExperiment[]
): RankedHypothesis[] {
  if (hypotheses.length === 0) return [];

  const scored = hypotheses.map((hypothesis) => {
    const matchingExperiments = experiments.filter(
      (exp) => exp.hypothesisId === hypothesis.id && exp.status === 'completed'
    );
    const evaluation = evaluateHypothesisFalsification(hypothesis, experiments);
    const rankingScore = computeHypothesisScore(hypothesis, evaluation, matchingExperiments);

    return {
      hypothesis,
      evaluation,
      rankingScore,
    };
  });

  // Sort descending by score, tie-breaking by statement alphabetically then by id
  scored.sort((a, b) => {
    if (b.rankingScore !== a.rankingScore) {
      return b.rankingScore - a.rankingScore;
    }
    const cmp = a.hypothesis.statement.localeCompare(b.hypothesis.statement);
    if (cmp !== 0) return cmp;
    return a.hypothesis.id.localeCompare(b.hypothesis.id);
  });

  return scored.map((item, index) => ({
    rank: index + 1,
    hypothesis: item.hypothesis,
    evaluation: item.evaluation,
    rankingScore: item.rankingScore,
    isPrimaryCandidate: index === 0 && item.evaluation.verdict === 'supported',
  }));
}

/**
 * Helper to rank hypotheses directly from an Investigation aggregate.
 */
export function rankHypothesesFromInvestigation(investigation: Investigation): RankedHypothesis[] {
  return rankInvestigationHypotheses(
    investigation.hypotheses,
    investigation.experiments
  );
}
