/**
 * Multiclass Classification & Per-Class Statistical Metrics Engine.
 * Evaluates multiclass and binary vision predictions against ground truth labels:
 * - K x K confusion matrix
 * - Per-class Precision, Recall, F1-Score, Specificity, Prevalence
 * - Aggregate Macro F1, Micro F1, Weighted F1, and Overall Accuracy
 * - Strict null-safe handling of unrepresented classes (no NaN / division-by-zero artifacts)
 * - Error categorization: High Confidence Incorrect, Low Confidence Correct, etc.
 */

import type {
  MulticlassSummaryMetrics,
  MulticlassPerClassMetric,
  VisionRecord,
  VisionClassificationOutcome,
  VisionFailureCategory,
} from '../../domain/vision-types.ts';

export interface EvaluatedVisionRecord extends VisionRecord {
  outcome: VisionClassificationOutcome;
  failureCategory: VisionFailureCategory;
}

/**
 * Computes multiclass metrics and annotates individual records with failure categories
 */
export function evaluateMulticlassVisionMetrics(
  records: VisionRecord[],
  knownClasses?: string[]
): {
  metrics: MulticlassSummaryMetrics;
  evaluatedRecords: EvaluatedVisionRecord[];
} {
  const n = records.length;
  if (n === 0) {
    return {
      metrics: {
        totalSamples: 0,
        classes: knownClasses ?? [],
        overallAccuracy: 0,
        macroPrecision: 0,
        macroRecall: 0,
        macroF1: 0,
        microF1: 0,
        weightedF1: 0,
        confusionMatrix: { classes: knownClasses ?? [], matrix: [] },
        perClass: {},
        highConfidenceErrorCount: 0,
        lowConfidenceCorrectCount: 0,
      },
      evaluatedRecords: [],
    };
  }

  // Determine unique classes in sorted deterministic order
  const classSet = new Set<string>(knownClasses ?? []);
  for (const r of records) {
    classSet.add(String(r.yTrue));
    classSet.add(String(r.yPred));
  }
  const classes = Array.from(classSet).sort();
  const k = classes.length;
  const classToIndex = new Map<string, number>(classes.map((c, i) => [c, i]));

  // Initialize K x K confusion matrix: matrix[trueIdx][predIdx]
  const matrix: number[][] = Array.from({ length: k }, () => Array(k).fill(0));

  let highConfidenceErrorCount = 0;
  let lowConfidenceCorrectCount = 0;
  let correctCount = 0;

  const isBinary =
    k === 2 &&
    ((classes.includes('0') && classes.includes('1')) ||
      (classes.includes('negative') && classes.includes('positive')) ||
      (classes.includes('benign') && classes.includes('malignant')));

  const positiveLabel = isBinary
    ? classes.includes('1')
      ? '1'
      : classes.includes('positive')
      ? 'positive'
      : 'malignant'
    : null;

  const evaluatedRecords: EvaluatedVisionRecord[] = [];

  for (const r of records) {
    const tStr = String(r.yTrue);
    const pStr = String(r.yPred);
    const tIdx = classToIndex.get(tStr)!;
    const pIdx = classToIndex.get(pStr)!;

    matrix[tIdx][pIdx]++;

    const isCorrect = tStr === pStr;
    if (isCorrect) correctCount++;

    // Compute effective confidence in predicted class [0, 1]
    let effectiveConf: number;
    if (r.confidence !== undefined && r.confidence !== null) {
      effectiveConf = r.confidence;
    } else if (r.yProbability !== undefined && r.yProbability !== null) {
      effectiveConf = pStr === positiveLabel ? r.yProbability : 1 - r.yProbability;
    } else {
      effectiveConf = 0.5; // neutral fallback
    }

    // Determine failure category
    let failureCategory: VisionFailureCategory;
    if (isCorrect) {
      if (effectiveConf >= 0.7) {
        failureCategory = 'CORRECT_HIGH_CONF';
      } else {
        failureCategory = 'CORRECT_LOW_CONF';
        lowConfidenceCorrectCount++;
      }
    } else {
      if (effectiveConf >= 0.7) {
        failureCategory = 'INCORRECT_HIGH_CONF';
        highConfidenceErrorCount++;
      } else {
        failureCategory = 'INCORRECT_LOW_CONF';
      }
    }

    // Determine outcome
    let outcome: VisionClassificationOutcome;
    if (isBinary && positiveLabel !== null) {
      if (tStr === positiveLabel && pStr === positiveLabel) outcome = 'TRUE_POSITIVE';
      else if (tStr !== positiveLabel && pStr !== positiveLabel) outcome = 'TRUE_NEGATIVE';
      else if (tStr !== positiveLabel && pStr === positiveLabel) outcome = 'FALSE_POSITIVE';
      else outcome = 'FALSE_NEGATIVE';
    } else {
      outcome = isCorrect ? 'CORRECT' : 'INCORRECT';
    }

    evaluatedRecords.push({
      ...r,
      outcome,
      failureCategory,
    });
  }

  // Compute per-class metrics
  const perClass: Record<string, MulticlassPerClassMetric> = {};

  let sumValidPrecision = 0;
  let countValidPrecision = 0;
  let sumValidRecall = 0;
  let countValidRecall = 0;
  let sumValidF1 = 0;
  let countValidF1 = 0;
  let weightedF1Numerator = 0;

  for (let i = 0; i < k; i++) {
    const className = classes[i];
    const tp = matrix[i][i];

    let fn = 0;
    for (let j = 0; j < k; j++) {
      if (j !== i) fn += matrix[i][j];
    }

    let fp = 0;
    for (let j = 0; j < k; j++) {
      if (j !== i) fp += matrix[j][i];
    }

    const tn = n - (tp + fp + fn);
    const support = tp + fn;

    // Precision = TP / (TP + FP)
    const precision = tp + fp > 0 ? tp / (tp + fp) : null;

    // Recall = TP / (TP + FN)
    const recall = support > 0 ? tp / support : null;

    // F1 = 2 * P * R / (P + R)
    let f1Score: number | null = null;
    if (precision !== null && recall !== null && precision + recall > 0) {
      f1Score = (2 * precision * recall) / (precision + recall);
    }

    // Specificity = TN / (TN + FP)
    const specificity = tn + fp > 0 ? tn / (tn + fp) : null;

    const prevalence = n > 0 ? support / n : 0;

    perClass[className] = {
      className,
      support,
      truePositives: tp,
      falsePositives: fp,
      falseNegatives: fn,
      trueNegatives: tn,
      precision,
      recall,
      f1Score,
      specificity,
      prevalence,
    };

    if (precision !== null) {
      sumValidPrecision += precision;
      countValidPrecision++;
    }
    if (recall !== null) {
      sumValidRecall += recall;
      countValidRecall++;
    }
    if (f1Score !== null) {
      sumValidF1 += f1Score;
      countValidF1++;
      weightedF1Numerator += support * f1Score;
    }
  }

  const overallAccuracy = n > 0 ? correctCount / n : 0;
  const macroPrecision = countValidPrecision > 0 ? sumValidPrecision / countValidPrecision : 0;
  const macroRecall = countValidRecall > 0 ? sumValidRecall / countValidRecall : 0;
  const macroF1 = countValidF1 > 0 ? sumValidF1 / countValidF1 : 0;
  const microF1 = overallAccuracy; // Micro F1 in single-label multiclass is identical to overall accuracy
  const weightedF1 = n > 0 ? weightedF1Numerator / n : 0;

  const metrics: MulticlassSummaryMetrics = {
    totalSamples: n,
    classes,
    overallAccuracy,
    macroPrecision,
    macroRecall,
    macroF1,
    microF1,
    weightedF1,
    confusionMatrix: {
      classes,
      matrix,
    },
    perClass,
    highConfidenceErrorCount,
    lowConfidenceCorrectCount,
  };

  return { metrics, evaluatedRecords };
}
