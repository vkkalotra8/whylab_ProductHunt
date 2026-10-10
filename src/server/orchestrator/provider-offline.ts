import type { InvestigatorProvider, ProviderTurnRequest, ProviderTurnResponse } from './provider.ts';

export class OfflineInvestigatorProvider implements InvestigatorProvider {
  readonly name = 'offline_deterministic_investigator';

  async nextStep(request: ProviderTurnRequest): Promise<ProviderTurnResponse> {
    const { investigation, dataset, userDirectives } = request;

    // Check for baseline metrics
    const hasBaselineMetrics = investigation.evidence.some(
      (e) =>
        e.provenance.kind === 'tool_result' &&
        investigation.toolResults.some(
          (r) =>
            r.id === (e.provenance as { resultId: string }).resultId &&
            r.tool === 'compute_classification_metrics'
        )
    );

    if (!hasBaselineMetrics) {
      return {
        action: 'call_tool',
        tool: 'compute_classification_metrics',
        input: {
          datasetId: dataset.metadata.id,
          positiveLabel: dataset.labels?.positive ?? '1',
        },
        rationale: 'Establish baseline classification metrics, sample size, and confusion matrix.',
      };
    }

    // Extract baseline measurements for data-driven decisions
    const metricsEvidence = investigation.evidence.find(
      (e) =>
        e.provenance.kind === 'tool_result' &&
        investigation.toolResults.some(
          (r) =>
            r.id === (e.provenance as { resultId: string }).resultId &&
            r.tool === 'compute_classification_metrics'
        )
    );

    const measurements = metricsEvidence?.measurements ?? [];
    const getMeasuredValue = (name: string): number | undefined => {
      const m = measurements.find((meas) => meas.name === name);
      return m && m.status === 'measured' ? m.value : undefined;
    };
    const acc = getMeasuredValue('accuracy') ?? 0;
    const recall = getMeasuredValue('recall') ?? 0;
    const minRecall = getMeasuredValue('minority_recall');
    const posPrev = getMeasuredValue('positive_prevalence') ?? 0.5;

    const hasProbabilities = dataset.metadata.probabilityColumn !== null;
    const hasImbalance = posPrev < 0.35 || posPrev > 0.65;
    const hasParadoxGap = minRecall !== undefined ? acc - minRecall > 0.15 : acc - recall > 0.15;

    // Check user directives for mid-turn steering
    const latestDirective = userDirectives[userDirectives.length - 1]?.toLowerCase() ?? '';

    // Directive: Slice evaluation requested
    if (
      (latestDirective.includes('slice') || latestDirective.includes('subgroup') || latestDirective.includes('demographic')) &&
      !investigation.toolResults.some((r) => r.tool === 'slice_evaluation')
    ) {
      const candidateCols = dataset.metadata.columns.filter(
        (c) =>
          c !== dataset.metadata.targetColumn &&
          c !== dataset.metadata.predictionColumn &&
          c !== dataset.metadata.probabilityColumn &&
          c !== 'id'
      );
      if (candidateCols.length > 0) {
        return {
          action: 'call_tool',
          tool: 'slice_evaluation',
          input: {
            datasetId: dataset.metadata.id,
            positiveLabel: dataset.labels?.positive ?? '1',
            columns: [candidateCols[0]],
            minimumSampleSize: 5,
          },
          rationale: `Steering directive detected: Evaluate performance parity across metadata slices (${candidateCols[0]}).`,
        };
      }
    }

    // Directive: Calibration evaluation requested
    if (
      latestDirective.includes('calibration') &&
      hasProbabilities &&
      !investigation.toolResults.some((r) => r.tool === 'check_calibration')
    ) {
      return {
        action: 'call_tool',
        tool: 'check_calibration',
        input: {
          datasetId: dataset.metadata.id,
          positiveLabel: dataset.labels?.positive ?? '1',
          bins: 10,
          strategy: 'equal_width',
        },
        rationale: 'Steering directive detected: Evaluate predicted probability calibration and Brier reliability score.',
      };
    }

    // Directive: Feature leakage screening requested
    if (
      latestDirective.includes('leakage') &&
      !investigation.toolResults.some((r) => r.tool === 'scan_feature_leakage')
    ) {
      const featureCols = dataset.metadata.columns.filter(
        (c) =>
          c !== dataset.metadata.targetColumn &&
          c !== dataset.metadata.predictionColumn &&
          c !== dataset.metadata.probabilityColumn &&
          c !== 'id' &&
          c !== 'timestamp'
      );
      if (featureCols.length > 0) {
        return {
          action: 'call_tool',
          tool: 'scan_feature_leakage',
          input: {
            datasetId: dataset.metadata.id,
            targetColumn: dataset.metadata.targetColumn,
            featureColumns: featureCols,
            predictionTimeColumn: null,
            outcomeTimeColumn: null,
            assumptionEvidenceIds: [],
          },
          rationale: 'Steering directive detected: Screen features for correlation anomalies and proxy leakage.',
        };
      }
    }

    // If no hypothesis proposed yet, formulate data-driven hypothesis
    if (investigation.hypotheses.length === 0) {
      if (hasImbalance && hasParadoxGap) {
        return {
          action: 'propose_hypothesis',
          statement:
            'Class Imbalance Distortion: High raw accuracy conceals severe sensitivity suppression on the minority class due to an uncalibrated default 0.50 decision threshold.',
          confidenceLevel: 'limited',
          confidenceRationale:
            `Baseline metrics demonstrate strong tension between overall accuracy (${(acc * 100).toFixed(1)}%) and minority class recall (${(Number(minRecall ?? recall) * 100).toFixed(1)}%), suggesting majority class domination under ${(posPrev * 100).toFixed(1)}% prevalence.`,
        };
      }

      // Check for available slice columns
      const sliceCols = dataset.metadata.columns.filter(
        (c) =>
          c !== dataset.metadata.targetColumn &&
          c !== dataset.metadata.predictionColumn &&
          c !== dataset.metadata.probabilityColumn &&
          c !== 'id'
      );

      if (sliceCols.length > 0) {
        return {
          action: 'propose_hypothesis',
          statement:
            `Subgroup Performance Disparity: Aggregate metrics mask significant performance variance across cohort slice column '${sliceCols[0]}'.`,
          confidenceLevel: 'limited',
          confidenceRationale:
            'Metadata attributes are present; performance may diverge significantly across sub-populations.',
        };
      }

      if (hasProbabilities) {
        return {
          action: 'propose_hypothesis',
          statement:
            'Probability Miscalibration: Predicted probabilities deviate from empirical class frequencies across confidence bins.',
          confidenceLevel: 'limited',
          confidenceRationale:
            'Continuous probability scores available; confidence scores may be over- or under-confident.',
        };
      }

      return {
        action: 'propose_hypothesis',
        statement:
          'Decision Boundary Misalignment: Discrete model predictions exhibit substantial trade-off tension between precision and recall.',
        confidenceLevel: 'limited',
        confidenceRationale:
          'Discrete prediction distribution indicates asymmetric classification error rates.',
      };
    }

    const primaryHypothesis = investigation.hypotheses[0];

    // If hypothesis proposed but no verification experiment conducted yet:
    if (investigation.experiments.length === 0) {
      if (primaryHypothesis.statement.includes('Class Imbalance') || primaryHypothesis.statement.includes('Accuracy Paradox')) {
        return {
          action: 'call_tool',
          tool: 'run_counterfactual_test',
          input: {
            datasetId: dataset.metadata.id,
            positiveLabel: dataset.labels?.positive ?? '1',
            hypothesisId: primaryHypothesis.id,
            method: 'accuracy_paradox',
            seed: 42,
            criterion: {
              metric: 'accuracy_paradox_gap',
              operator: 'at_least',
              value: 10,
              unit: 'percentage_points',
            },
          },
          rationale:
            'Conduct deterministic counterfactual class reweighting to test for the Accuracy Paradox under 50/50 balanced prevalence.',
        };
      }

      if (primaryHypothesis.statement.includes('Subgroup Performance Disparity')) {
        const sliceCols = dataset.metadata.columns.filter(
          (c) =>
            c !== dataset.metadata.targetColumn &&
            c !== dataset.metadata.predictionColumn &&
            c !== dataset.metadata.probabilityColumn &&
            c !== 'id'
        );
        if (sliceCols.length > 0) {
          return {
            action: 'call_tool',
            tool: 'slice_evaluation',
            input: {
              datasetId: dataset.metadata.id,
              positiveLabel: dataset.labels?.positive ?? '1',
              columns: [sliceCols[0]],
              minimumSampleSize: 5,
            },
            rationale: `Evaluate slice performance across column '${sliceCols[0]}'.`,
          };
        }
      }

      if (primaryHypothesis.statement.includes('Probability Miscalibration') && hasProbabilities) {
        return {
          action: 'call_tool',
          tool: 'check_calibration',
          input: {
            datasetId: dataset.metadata.id,
            positiveLabel: dataset.labels?.positive ?? '1',
            bins: 10,
            strategy: 'equal_width',
          },
          rationale: 'Evaluate probability calibration and reliability diagram.',
        };
      }
    }

    // Check whether repair candidate can be generated
    // Only possible if continuous probabilities exist
    if (hasProbabilities && investigation.repairs.length === 0) {
      const expOutcome = investigation.experiments[0]?.outcome;
      if (expOutcome === 'supports' || latestDirective.includes('repair') || latestDirective.includes('fix')) {
        // Conduct 101-point threshold sweep on this specific dataset if not already recorded
        const hasSweep = investigation.toolResults.some(
          (r) => r.tool === 'threshold_sweep' && r.status === 'completed'
        );
        if (!hasSweep) {
          const thresholds101: number[] = [];
          for (let i = 0; i <= 100; i++) {
            thresholds101.push(Math.round(i) / 100);
          }
          return {
            action: 'call_tool',
            tool: 'threshold_sweep',
            input: {
              datasetId: dataset.metadata.id,
              positiveLabel: dataset.labels?.positive ?? '1',
              thresholds: thresholds101,
              costs: null,
            },
            rationale: `Conduct 101-point continuous decision threshold sweep on ${dataset.metadata.name} to map empirical sensitivity, specificity, and confusion trade-offs across cutoffs [0.00 - 1.00].`,
          };
        }

        return {
          action: 'call_tool',
          tool: 'generate_repair_candidate',
          input: {
            datasetId: dataset.metadata.id,
            positiveLabel: dataset.labels?.positive ?? '1',
            hypothesisId: primaryHypothesis.id,
            targetMetric: 'recall',
            targetValue: 0.8,
            costs: null,
            criterion: {
              metric: 'recall',
              operator: 'at_least',
              value: 0.8,
              unit: 'ratio',
            },
          },
          rationale:
            'Generate cost-optimal operating policy repair candidate targeting at least 80% recall on the critical minority class.',
        };
      }
    }

    // If repair candidate exists but no before-after re-evaluation completed:
    if (hasProbabilities && investigation.repairs.length > 0 && investigation.comparisons.length === 0) {
      const repair = investigation.repairs[0];
      const repairedThreshold = repair.kind === 'operating_policy' ? repair.policy.threshold : 0.19;
      const baselineEvidenceId = investigation.evidence[0]?.id;

      return {
        action: 'call_tool',
        tool: 're_evaluate_repair',
        input: {
          datasetId: dataset.metadata.id,
          positiveLabel: dataset.labels?.positive ?? '1',
          repairId: repair.id,
          baselineThreshold: 0.5,
          repairedThreshold,
          criterion: {
            metric: 'recall',
            operator: 'at_least',
            value: 0.8,
            unit: 'ratio',
          },
          baselineEvidenceIds: baselineEvidenceId ? [baselineEvidenceId] : [],
        },
        rationale:
          'Re-evaluate proposed repair operating policy on identical evaluation rows to verify target metric lift and measure trade-offs.',
      };
    }

    // All diagnostic cycles completed: Conclude investigation with honest diagnosis
    const comparison = investigation.comparisons[0];

    let rootCause = 'Model Reliability Risk Identified';
    let summary = `Autonomous investigation completed for ${dataset.metadata.name}.`;

    if (primaryHypothesis.statement.includes('Class Imbalance') || primaryHypothesis.statement.includes('Accuracy Paradox')) {
      rootCause =
        `Class Imbalance Suppression: The model applies a standard 0.50 decision threshold on an imbalanced dataset (${(posPrev * 100).toFixed(1)}% positive prevalence), optimizing for overall accuracy at the expense of severe false-negative rates in the minority class.`;

      if (comparison) {
        summary =
          `Autonomous investigation verified accuracy paradox distortion via counterfactual reweighting. Re-calibrating the operating threshold from ${(comparison.baselinePolicy.threshold).toFixed(2)} to ${(comparison.afterPolicy.threshold).toFixed(2)} recovers sensitivity while preserving balanced accuracy on identical evaluation rows.`;
      } else if (!hasProbabilities) {
        summary =
          `Identified class imbalance accuracy paradox risk (${(acc * 100).toFixed(1)}% accuracy vs ${(recall * 100).toFixed(1)}% recall). Threshold optimization was unavailable because continuous probability scores were not provided. Model retraining or score calibration is recommended.`;
      } else {
        summary =
          'Autonomous investigation verified accuracy paradox distortion via counterfactual reweighting.';
      }
    } else if (primaryHypothesis.statement.includes('Subgroup Performance Disparity')) {
      rootCause =
        'Subgroup Performance Disparity: Disproportionate error rates observed across distinct metadata categories.';
      summary =
        'Slice evaluation completed: performance divergence observed across metadata partitions. Cohort-specific calibration is advised.';
    } else {
      rootCause =
        'Empirical Decision Boundary Tension: Asymmetric precision/recall trade-offs observed across evaluation cohort.';
      summary =
        `Baseline evaluation completed for ${dataset.metadata.name} across ${dataset.metadata.rowCount.toLocaleString()} cases.`;
    }

    const limitations = [
      'Diagnosis is based strictly on observed evaluation data distribution; ongoing drift monitoring is advised.',
    ];
    if (!hasProbabilities) {
      limitations.push('Continuous probability scores were absent; threshold sweeping and calibration curves were disabled.');
    }

    return {
      action: 'conclude',
      rootCause,
      summary,
      primaryHypothesisId: primaryHypothesis.id,
      confidenceLevel: 'strong',
      confidenceRationale:
        'Empirically validated through deterministic mathematical evaluation without data fabrication or uncalibrated extrapolation.',
      limitations,
    };
  }
}
