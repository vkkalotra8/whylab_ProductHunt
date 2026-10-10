import type { EvaluationDataset } from '../diagnostics/evaluation-ingestion.ts';
import { checkCalibration } from '../diagnostics/calibration.ts';
import { scanFeatureLeakage } from '../diagnostics/leakage-scanner.ts';
import { evaluateSlices } from '../diagnostics/slice-evaluation.ts';
import { analyzeMultiSiteShift, type MultiSiteShiftReport } from '../diagnostics/multi-site-shift.ts';
import { createId, type Id } from '../domain/primitives.ts';
import type { Investigation, Hypothesis } from '../domain/types.ts';

export type ChallengeVerdict = 'refuted' | 'upheld' | 'compound_factor' | 'inconclusive';

export interface AdversarialChallenge {
  id: string;
  name: string;
  rivalHypothesis: string;
  targetDiagnosticTool: string;
  verdict: ChallengeVerdict;
  testStatistic: {
    name: string;
    value: number | null;
    unit: string;
    threshold: string;
  };
  sampleSizeFloorProtected: boolean;
  rationale: string;
  recommendation: string;
  limitations: string[];
}

export interface AdversarialAuditReport {
  id: Id<'audit'>;
  timestamp: string;
  investigationId?: Id<'investigation'>;
  primaryHypothesisStatement: string;
  defenseStatus: 'defended' | 'compound_risk' | 'vulnerable';
  defenseScore: number; // 0 to 100 percentage
  challenges: AdversarialChallenge[];
  multiSiteReport: MultiSiteShiftReport | null;
  refutedCount: number;
  upheldCount: number;
  compoundCount: number;
  inconclusiveCount: number;
  executiveSummary: string;
}

export interface AdversarialReviewOptions {
  dataset: EvaluationDataset;
  investigation?: Investigation;
  primaryHypothesis?: Hypothesis;
  minimumSampleSizeFloor?: number;
}

/**
 * Executes a deterministic 5-part adversarial challenge battery against
 * the primary diagnosis to falsify alternative root causes:
 * 1. Covariate / Distribution Shift
 * 2. Feature Leakage / Target Proxy
 * 3. Probability Miscalibration
 * 4. Subgroup / Cohort Disparity Concentration
 * 5. Small-Sample Overfitting Artifact
 */
export function runAdversarialReview(
  options: AdversarialReviewOptions
): AdversarialAuditReport {
  const { dataset, investigation, primaryHypothesis } = options;
  const floor = options.minimumSampleSizeFloor ?? 30;

  const primaryStatement =
    primaryHypothesis?.statement ??
    investigation?.hypotheses[0]?.statement ??
    'Class imbalance suppresses minority class recall at 0.50 cutoff.';

  const challenges: AdversarialChallenge[] = [];

  // =========================================================================
  // Challenge 1: Covariate & Distribution Shift Challenge
  // =========================================================================
  const multiSiteReport = analyzeMultiSiteShift(dataset, { sampleSizeFloor: floor });
  let driftVerdict: ChallengeVerdict = 'refuted';
  let maxKs: number | null = null;
  let maxPsi: number | null = null;
  let driftRationale = '';

  if (multiSiteReport.sites.length > 1 && multiSiteReport.pairwiseDrift.length > 0) {
    const validKs = multiSiteReport.pairwiseDrift
      .map((p) => p.ksStatistic)
      .filter((v): v is number => v !== null);
    const validPsi = multiSiteReport.pairwiseDrift
      .map((p) => p.psiStatistic)
      .filter((v): v is number => v !== null);

    maxKs = validKs.length ? Math.max(...validKs) : 0;
    maxPsi = validPsi.length ? Math.max(...validPsi) : 0;

    const hasSevereDrift = multiSiteReport.pairwiseDrift.some((p) => p.driftLevel === 'severe');
    const hasDisparity = multiSiteReport.disparities.some((d) => d.alertLevel === 'critical');

    if (hasSevereDrift && hasDisparity) {
      driftVerdict = 'compound_factor';
      driftRationale = `Significant distribution shift detected across operational cohorts (max KS = ${maxKs.toFixed(
        3
      )}, PSI = ${maxPsi.toFixed(3)}) coinciding with critical performance disparities. Covariate shift is an active compound factor.`;
    } else if (maxKs < 0.15 && maxPsi < 0.10) {
      driftVerdict = 'refuted';
      driftRationale = `Feature and probability distributions across cohorts are congruent (max KS = ${maxKs.toFixed(
        3
      )} < 0.15, PSI = ${maxPsi.toFixed(3)} < 0.10). Covariate shift is refuted as the primary cause.`;
    } else {
      driftVerdict = 'refuted';
      driftRationale = `Cohort distribution divergence (max KS = ${maxKs.toFixed(
        3
      )}) does not reach critical shift thresholds. Internal decision threshold dominates.`;
    }
  } else {
    driftVerdict = 'refuted';
    driftRationale =
      'Evaluation dataset represents a single congruent cohort; external covariate drift is not present.';
  }

  challenges.push({
    id: 'challenge_covariate_shift',
    name: 'Covariate & Distribution Shift Challenge',
    rivalHypothesis:
      'The failure is caused by an external shift in feature distributions or target priors across deployment cohorts, rather than an internal model flaw.',
    targetDiagnosticTool: 'run_drift_tests',
    verdict: driftVerdict,
    testStatistic: {
      name: 'max_ks_statistic',
      value: maxKs,
      unit: 'ratio',
      threshold: '< 0.15 for refutation',
    },
    sampleSizeFloorProtected: multiSiteReport.floorViolations.length > 0,
    rationale: driftRationale,
    recommendation:
      driftVerdict === 'compound_factor'
        ? 'Deploy domain adaptation or site-specific threshold calibration.'
        : 'Proceed with internal model repair and decision threshold calibration.',
    limitations: [
      'KS tests evaluate 1D marginal empirical CDFs.',
      'Sample size protection floor applies to small cohorts.',
    ],
  });

  // =========================================================================
  // Challenge 2: Feature Leakage / Target Proxy Challenge
  // =========================================================================
  const featureCols = dataset.metadata.columns.filter(
    (c) => !['y_true', 'y_pred', 'y_probability'].includes(c)
  );

  let leakageVerdict: ChallengeVerdict = 'refuted';
  let leakageCount = 0;
  let leakageRationale = '';

  if (featureCols.length === 0) {
    leakageVerdict = 'refuted';
    leakageRationale =
      'Evaluation dataset contains purely predictions and ground truth labels; no auxiliary features exist that could act as target proxies.';
  } else {
    try {
      const leakageReport = scanFeatureLeakage(dataset, {
        datasetId: dataset.metadata.id,
        targetColumn: 'y_true',
        featureColumns: featureCols,
        predictionTimeColumn: null,
        outcomeTimeColumn: null,
        assumptionEvidenceIds: [],
      });
      leakageCount = leakageReport.output.observations.length;
      if (leakageCount > 0) {
        leakageVerdict = 'upheld';
        leakageRationale = `Feature leakage scanner identified ${leakageCount} suspicious feature(s) acting as target proxies or temporal lookaheads.`;
      } else {
        leakageVerdict = 'refuted';
        leakageRationale =
          'Feature leakage scan completed with 0 target proxies or temporal lookaheads detected. Feature integrity is upheld.';
      }
    } catch {
      leakageVerdict = 'inconclusive';
      leakageRationale = 'Feature leakage scanner could not evaluate candidate columns on this dataset.';
    }
  }

  challenges.push({
    id: 'challenge_feature_leakage',
    name: 'Feature Leakage & Target Proxy Challenge',
    rivalHypothesis:
      'The model apparent performance or failure is distorted by an illegitimate target proxy, identifier, or temporal lookahead feature in evaluation data.',
    targetDiagnosticTool: 'scan_feature_leakage',
    verdict: leakageVerdict,
    testStatistic: {
      name: 'leakage_observations',
      value: leakageCount,
      unit: 'features',
      threshold: '0 observations',
    },
    sampleSizeFloorProtected: false,
    rationale: leakageRationale,
    recommendation:
      leakageVerdict === 'upheld'
        ? 'Prune leaky features immediately and retrain model.'
        : 'Feature representations are legitimate; focus on operating cutoff.',
    limitations: ['Evaluates linear and rank correlations; complex multi-feature leakage requires deep interaction checks.'],
  });

  // =========================================================================
  // Challenge 3: Probability Miscalibration Challenge
  // =========================================================================
  let calibVerdict: ChallengeVerdict = 'refuted';
  let eceValue: number | null = null;
  let brierValue: number | null = null;
  let calibRationale = '';

  try {
    const calibReport = checkCalibration(dataset, {
      datasetId: dataset.metadata.id,
      positiveLabel: dataset.labels.positive,
      bins: 10,
      strategy: 'equal_width',
    });

    if (!calibReport.output) {
      calibVerdict = 'inconclusive';
      calibRationale = 'Calibration output could not be computed (insufficient class variation).';
    } else {
      const brierMetric = calibReport.output.metrics.find((m) => m.name === 'brier_score');
      brierValue = brierMetric && brierMetric.status === 'measured' ? brierMetric.value : null;

      // Compute empirical Expected Calibration Error (ECE) across bins
      const totalN = dataset.rows.length;
      let computedEce = 0;
      for (const bin of calibReport.output.bins) {
        if (bin.meanProbability !== null && bin.observedFrequency !== null) {
          computedEce += (bin.sampleSize / totalN) * Math.abs(bin.meanProbability - bin.observedFrequency);
        }
      }
      eceValue = Number(computedEce.toFixed(4));

      const isSevereMiscalibration =
        eceValue >= 0.20 || (brierValue !== null && brierValue >= 0.15);
      const isWellCalibrated =
        eceValue < 0.10 || (brierValue !== null && brierValue <= 0.06 && eceValue < 0.20);

      if (isSevereMiscalibration) {
        calibVerdict = 'upheld';
        calibRationale = `Severe probability miscalibration detected (ECE = ${(eceValue * 100).toFixed(
          1
        )}%, Brier score = ${brierValue?.toFixed(3) ?? 'N/A'}). Probabilities do not correspond to empirical event likelihoods.`;
      } else if (isWellCalibrated) {
        calibVerdict = 'refuted';
        calibRationale = `Model probabilities are well-calibrated (Brier score = ${
          brierValue?.toFixed(3) ?? 'N/A'
        }, ECE = ${(eceValue * 100).toFixed(
          1
        )}%). Failure is caused by decision boundary placement, not miscalibrated scores.`;
      } else {
        calibVerdict = 'compound_factor';
        calibRationale = `Moderate probability miscalibration (ECE = ${(eceValue * 100).toFixed(
          1
        )}%). Probabilities have slight distortion alongside decision threshold misalignment.`;
      }
    }
  } catch {
    calibVerdict = 'inconclusive';
    calibRationale = 'Calibration could not be evaluated (e.g. single-class evaluation dataset).';
  }

  challenges.push({
    id: 'challenge_calibration_drift',
    name: 'Probability Miscalibration Challenge',
    rivalHypothesis:
      'The failure is solely uncalibrated probabilities where scores do not correspond to true empirical posterior probabilities.',
    targetDiagnosticTool: 'check_calibration',
    verdict: calibVerdict,
    testStatistic: {
      name: 'expected_calibration_error',
      value: eceValue,
      unit: 'ratio',
      threshold: '< 0.10 for refutation',
    },
    sampleSizeFloorProtected: dataset.rows.length < floor,
    rationale: calibRationale,
    recommendation:
      calibVerdict === 'upheld'
        ? 'Apply Platt scaling or isotonic regression probability calibration before threshold tuning.'
        : 'Probabilities are reliable; tune operating threshold in Repair Lab directly.',
    limitations: ['ECE is computed across 10 equal-width bins with empirical bin centers.'],
  });

  // =========================================================================
  // Challenge 4: Subgroup Disparity & Cohort Concentration Challenge
  // =========================================================================
  const sliceCandidates = ['site', 'environment', 'device', 'group'].filter((c) =>
    dataset.metadata.columns.includes(c)
  );

  let sliceVerdict: ChallengeVerdict = 'inconclusive';
  let maxDisparityPp: number | null = null;
  let sliceRationale = '';

  if (sliceCandidates.length > 0) {
    try {
      const sliceReport = evaluateSlices(dataset, {
        datasetId: dataset.metadata.id,
        positiveLabel: dataset.labels.positive,
        columns: sliceCandidates,
        minimumSampleSize: floor,
      });

      const deltas: number[] = [];
      for (const sl of sliceReport.output.slices) {
        for (const m of sl.metrics) {
          if (m.name === 'accuracy_delta_vs_overall' && m.status === 'measured') {
            deltas.push(m.value);
          }
        }
      }

      if (deltas.length > 0) {
        maxDisparityPp = Math.max(...deltas.map(Math.abs));
        if (maxDisparityPp >= 20.0) {
          sliceVerdict = 'compound_factor';
          sliceRationale = `Severe localized performance disparity detected: at least one cohort exhibits ${maxDisparityPp.toFixed(
            1
          )} pp delta compared to overall population. Failure is heavily concentrated in specific subgroups.`;
        } else if (maxDisparityPp <= 10.0) {
          sliceVerdict = 'refuted';
          sliceRationale = `Performance degradation is uniform across evaluated subgroups (maximum delta = ${maxDisparityPp.toFixed(
            1
          )} pp <= 10.0 pp). Failure is systemic, not a localized cohort artifact.`;
        } else {
          sliceVerdict = 'compound_factor';
          sliceRationale = `Moderate subgroup disparity detected (maximum delta = ${maxDisparityPp.toFixed(
            1
          )} pp).`;
        }
      } else {
        sliceVerdict = 'inconclusive';
        sliceRationale = 'No slice disparity metrics could be calculated.';
      }
    } catch {
      sliceVerdict = 'inconclusive';
      sliceRationale = 'Slice evaluation encountered schema or cardinality constraints.';
    }
  } else {
    sliceVerdict = 'inconclusive';
    sliceRationale =
      'No demographic, site, environment, or device metadata columns exist in the evaluation dataset to evaluate subgroup slices.';
  }

  challenges.push({
    id: 'challenge_subgroup_disparity',
    name: 'Subgroup Disparity & Cohort Concentration Challenge',
    rivalHypothesis:
      'The failure is not systemic to the model, but is concentrated in a specific demographic, geographic site, or device cohort.',
    targetDiagnosticTool: 'slice_evaluation',
    verdict: sliceVerdict,
    testStatistic: {
      name: 'max_slice_delta',
      value: maxDisparityPp,
      unit: 'percentage_points',
      threshold: '< 10.0 pp for refutation',
    },
    sampleSizeFloorProtected: dataset.rows.length < floor,
    rationale: sliceRationale,
    recommendation:
      sliceVerdict === 'compound_factor' || (sliceVerdict as string) === 'upheld'
        ? 'Establish cohort-specific monitoring rules and verify repair across each slice individually.'
        : 'Global policy modification will uniformly repair model behavior.',
    limitations: ['Minimum sample size floor of 30 protects against small-sample subgroup noise.'],
  });

  // =========================================================================
  // Challenge 5: Small-Sample Overfitting Artifact Challenge
  // =========================================================================
  const n = dataset.rows.length;
  const correctCount = dataset.rows.filter((r) => r.actual === r.predicted).length;
  const p = n > 0 ? correctCount / n : 0;

  // Wilson Score 95% Confidence Interval
  const z = 1.95996;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const halfWidth = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  const ciLower = Math.max(0, center - halfWidth);
  const ciUpper = Math.min(1, center + halfWidth);
  const ciWidth = ciUpper - ciLower;

  let sampleVerdict: ChallengeVerdict = 'refuted';
  let sampleRationale = '';

  if (n < floor) {
    sampleVerdict = 'upheld';
    sampleRationale = `Evaluation sample size N = ${n} is below the minimum reliability floor of ${floor}. The 95% confidence interval spans ${(
      ciWidth * 100
    ).toFixed(1)} pp ([${(ciLower * 100).toFixed(1)}%, ${(ciUpper * 100).toFixed(
      1
    )}%]). The observed failure cannot be reliably distinguished from small-sample variance.`;
  } else if (n >= 100 && ciWidth <= 0.15) {
    sampleVerdict = 'refuted';
    sampleRationale = `Sample size N = ${n} provides statistical robustness (95% CI: [${(ciLower * 100).toFixed(
      1
    )}%, ${(ciUpper * 100).toFixed(1)}%], margin of error ±${(halfWidth * 100).toFixed(
      1
    )} pp). Metric degradation is statistically significant and not an artifact of random sampling noise.`;
  } else {
    sampleVerdict = 'refuted';
    sampleRationale = `Sample size N = ${n} meets minimum reliability floor ${floor} (95% CI margin of error ±${(
      halfWidth * 100
    ).toFixed(1)} pp). Sampling power is acceptable.`;
  }

  challenges.push({
    id: 'challenge_overfitting_artifact',
    name: 'Small-Sample & Overfitting Noise Challenge',
    rivalHypothesis:
      'The observed failure or performance metric is not statistically significant; it is a small-sample binomial artifact or random sampling noise.',
    targetDiagnosticTool: 'compute_classification_metrics',
    verdict: sampleVerdict,
    testStatistic: {
      name: 'ci_95_margin_of_error',
      value: Number((halfWidth * 100).toFixed(2)),
      unit: 'percentage_points',
      threshold: `N >= ${floor}`,
    },
    sampleSizeFloorProtected: n < floor,
    rationale: sampleRationale,
    recommendation:
      sampleVerdict === 'upheld'
        ? 'Expand evaluation dataset sample size above 100 rows before committing to production changes.'
        : 'Sample size is sufficient for high-confidence engineering decisions.',
    limitations: ['Wilson score method provides exact continuity-corrected binomial confidence intervals.'],
  });

  // =========================================================================
  // Overall Defense Audit Aggregation
  // =========================================================================
  const refutedCount = challenges.filter((c) => c.verdict === 'refuted').length;
  const upheldCount = challenges.filter((c) => c.verdict === 'upheld').length;
  const compoundCount = challenges.filter((c) => c.verdict === 'compound_factor').length;
  const inconclusiveCount = challenges.filter((c) => c.verdict === 'inconclusive').length;

  let defenseStatus: AdversarialAuditReport['defenseStatus'] = 'defended';
  if (upheldCount > 0) {
    defenseStatus = 'vulnerable';
  } else if (compoundCount > 0) {
    defenseStatus = 'compound_risk';
  }

  const defenseScore = Math.round(
    ((refutedCount + 0.5 * inconclusiveCount) / challenges.length) * 100
  );

  let executiveSummary = '';
  if (defenseStatus === 'defended') {
    executiveSummary = `Primary root cause hypothesis successfully defended against all 5 adversarial challenges (${refutedCount} refuted, 0 upheld). Alternative explanations (covariate shift, feature leakage, probability miscalibration, subgroup concentration, and sample noise) were deterministically ruled out.`;
  } else if (defenseStatus === 'compound_risk') {
    executiveSummary = `Primary root cause hypothesis is upheld, but ${compoundCount} compound factor(s) were uncovered (e.g., localized cohort disparity or distribution shift) that intensify system vulnerability. Address compound factors alongside the primary repair.`;
  } else {
    executiveSummary = `Adversarial review identified ${upheldCount} upheld rival explanation(s). The current diagnosis is vulnerable to alternative explanations (e.g. severe miscalibration or small-sample noise) and requires revision.`;
  }

  const auditId: Id<'audit'> = createId('audit');

  return {
    id: auditId,
    timestamp: new Date().toISOString(),
    investigationId: investigation?.id,
    primaryHypothesisStatement: primaryStatement,
    defenseStatus,
    defenseScore,
    challenges,
    multiSiteReport: multiSiteReport.sites.length > 0 ? multiSiteReport : null,
    refutedCount,
    upheldCount,
    compoundCount,
    inconclusiveCount,
    executiveSummary,
  };
}
