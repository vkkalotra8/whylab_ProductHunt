import type { EvaluationDataset } from '../diagnostics/evaluation-ingestion.ts';
import { evaluateClassification } from '../diagnostics/classification-metrics.ts';

export interface PrevalenceDistortionPoint {
  simulatedPrevalence: number; // e.g. 0.01 (1%), 0.05, 0.10, 0.20, 0.50
  rawAccuracy: number;
  balancedAccuracy: number;
  sensitivity: number;
  specificity: number;
  accuracyParadoxGap: number; // rawAccuracy - balancedAccuracy in percentage points
}

export interface PrevalenceDistortionCurve {
  observedPrevalence: number;
  observedAccuracy: number;
  observedRecall: number;
  points: PrevalenceDistortionPoint[];
  distortionIndex: number; // Difference in accuracy between observed prevalence and balanced 50% prevalence
  mathematicalExplanation: string;
}

/**
 * Computes a deterministic prevalence distortion curve across synthetic prevalence rates [0.01 to 0.50]
 * demonstrating how class imbalance inflates top-line accuracy without improving discrimination.
 */
export function computePrevalenceDistortionCurve(
  dataset: EvaluationDataset,
  simulatedRates: readonly number[] = [0.01, 0.02, 0.05, 0.1, 0.2, 0.35, 0.5]
): PrevalenceDistortionCurve {
  const report = evaluateClassification(dataset, {
    datasetId: dataset.metadata.id,
    positiveLabel: dataset.labels.positive,
  });

  const getMetric = (name: string): number => {
    const m = report.output.metrics.find((x) => x.name === name);
    return m && m.status === 'measured' ? m.value : 0;
  };

  const sensitivity = getMetric('recall');
  const specificity = getMetric('specificity');
  const balancedAccuracy = (sensitivity + specificity) / 2;

  const total =
    report.output.confusion.truePositive +
    report.output.confusion.falsePositive +
    report.output.confusion.trueNegative +
    report.output.confusion.falseNegative;

  const observedPositives =
    report.output.confusion.truePositive + report.output.confusion.falseNegative;
  const observedPrevalence = total > 0 ? observedPositives / total : 0;
  const observedAccuracy = getMetric('accuracy');

  const points: PrevalenceDistortionPoint[] = simulatedRates.map((p) => {
    // Under prevalence p, Accuracy = p * sensitivity + (1 - p) * specificity
    const rawAcc = p * sensitivity + (1 - p) * specificity;
    const gap = (rawAcc - balancedAccuracy) * 100;

    return {
      simulatedPrevalence: Math.round(p * 1000) / 1000,
      rawAccuracy: Math.round(rawAcc * 10000) / 10000,
      balancedAccuracy: Math.round(balancedAccuracy * 10000) / 10000,
      sensitivity: Math.round(sensitivity * 10000) / 10000,
      specificity: Math.round(specificity * 10000) / 10000,
      accuracyParadoxGap: Math.round(gap * 100) / 100,
    };
  });

  // Distortion index is the gap between observed prevalence accuracy and 50% prevalence accuracy
  const balancedAccAt50 = 0.5 * sensitivity + 0.5 * specificity;
  const distortionIndex = Math.round((observedAccuracy - balancedAccAt50) * 10000) / 100;

  const explanation =
    `Sensitivity (${(sensitivity * 100).toFixed(1)}%) and Specificity (${(specificity * 100).toFixed(1)}%) are invariant to prevalence. ` +
    `However, raw accuracy scales with majority-class frequency. At ${(observedPrevalence * 100).toFixed(1)}% observed prevalence, ` +
    `accuracy is inflated by ${distortionIndex.toFixed(1)} percentage points compared to a balanced clinical population.`;

  return {
    observedPrevalence: Math.round(observedPrevalence * 10000) / 10000,
    observedAccuracy: Math.round(observedAccuracy * 10000) / 10000,
    observedRecall: Math.round(sensitivity * 10000) / 10000,
    points,
    distortionIndex,
    mathematicalExplanation: explanation,
  };
}
