/**
 * Shortcut Learning & Spurious Visual Confounder Diagnostic.
 * Detects whether a computer vision model has learned an extraneous visual artifact
 * (e.g., scale ruler, hospital watermark, boundary marker) as a shortcut for classification.
 * Computes:
 * - Prevalence disparity in training data (positives vs negatives)
 * - Prevalence in production/clinical deployment
 * - Recall collapse delta: Recall(with_shortcut) - Recall(without_shortcut)
 * - Odds ratio of positive prediction conditional on shortcut presence
 */

import type { VisionRecord } from '../../domain/vision-types.ts';

export interface ShortcutLearningReport {
  shortcutKey: string;
  totalEvaluatedRecords: number;
  trainPrevalenceInPositives: number;
  trainPrevalenceInNegatives: number;
  trainPrevalenceDisparity: number;
  prodPrevalenceInPositives: number;
  prodPrevalenceInNegatives: number;
  positiveRecallWithShortcut: number;
  positiveRecallWithoutShortcut: number;
  recallCollapseDelta: number; // percentage points drop when shortcut is removed
  oddsRatio: number;
  hasShortcutBiasConfirmed: boolean;
  evidenceSummary: string;
  recommendations: string[];
}

export interface ShortcutDetectorOptions {
  shortcutKey?: string;     // default 'has_ruler'
  positiveLabel?: string;   // default '1'
}

/**
 * Evaluates dataset for shortcut learning / spurious feature bias
 */
export function detectShortcutLearning(
  records: VisionRecord[],
  options: ShortcutDetectorOptions = {}
): ShortcutLearningReport {
  const shortcutKey = options.shortcutKey ?? 'has_ruler';
  const posLabel = options.positiveLabel ?? '1';

  let trainPosTotal = 0;
  let trainPosWithShortcut = 0;
  let trainNegTotal = 0;
  let trainNegWithShortcut = 0;

  let prodPosTotal = 0;
  let prodPosWithShortcut = 0;
  let prodNegTotal = 0;
  let prodNegWithShortcut = 0;

  let allPosWithShortcut = 0;
  let allPosWithShortcutCorrect = 0;
  let allPosWithoutShortcut = 0;
  let allPosWithoutShortcutCorrect = 0;

  // Contingency table for Odds Ratio: Pred Pos vs Pred Neg by Shortcut Presence
  let shortcutPresentPredPos = 0;
  let shortcutPresentPredNeg = 0;
  let shortcutAbsentPredPos = 0;
  let shortcutAbsentPredNeg = 0;

  for (const r of records) {
    const isPos = String(r.yTrue) === posLabel;
    const isPredPos = String(r.yPred) === posLabel;
    const split = r.split?.toLowerCase() || '';

    // Extract shortcut indicator (1/0, true/false, or truthy)
    const rawVal = r.metadata?.[shortcutKey];
    const hasShortcut = rawVal === 1 || rawVal === '1' || rawVal === true || rawVal === 'true';

    // Contingency counts
    if (hasShortcut) {
      if (isPredPos) shortcutPresentPredPos++;
      else shortcutPresentPredNeg++;
    } else {
      if (isPredPos) shortcutAbsentPredPos++;
      else shortcutAbsentPredNeg++;
    }

    // Split-based prevalence
    if (split === 'train') {
      if (isPos) {
        trainPosTotal++;
        if (hasShortcut) trainPosWithShortcut++;
      } else {
        trainNegTotal++;
        if (hasShortcut) trainNegWithShortcut++;
      }
    } else if (split === 'production' || split === 'prod') {
      if (isPos) {
        prodPosTotal++;
        if (hasShortcut) prodPosWithShortcut++;
      } else {
        prodNegTotal++;
        if (hasShortcut) prodNegWithShortcut++;
      }
    }

    // Overall recall with vs without shortcut on actual positives
    if (isPos) {
      if (hasShortcut) {
        allPosWithShortcut++;
        if (isPredPos) allPosWithShortcutCorrect++;
      } else {
        allPosWithoutShortcut++;
        if (isPredPos) allPosWithoutShortcutCorrect++;
      }
    }
  }

  const trainPrevPos = trainPosTotal > 0 ? trainPosWithShortcut / trainPosTotal : 0;
  const trainPrevNeg = trainNegTotal > 0 ? trainNegWithShortcut / trainNegTotal : 0;
  const trainPrevalenceDisparity = trainPrevPos - trainPrevNeg;

  const prodPrevPos = prodPosTotal > 0 ? prodPosWithShortcut / prodPosTotal : 0;
  const prodPrevNeg = prodNegTotal > 0 ? prodNegWithShortcut / prodNegTotal : 0;

  const recallWith = allPosWithShortcut > 0 ? allPosWithShortcutCorrect / allPosWithShortcut : 0;
  const recallWithout = allPosWithoutShortcut > 0 ? allPosWithoutShortcutCorrect / allPosWithoutShortcut : 0;
  const recallCollapseDelta = recallWith - recallWithout;

  // Odds Ratio = (A * D) / (B * C) with Haldane-Anscombe 0.5 correction
  const oddsRatio =
    ((shortcutPresentPredPos + 0.5) * (shortcutAbsentPredNeg + 0.5)) /
    ((shortcutPresentPredNeg + 0.5) * (shortcutAbsentPredPos + 0.5));

  // Confirmed if training prevalence disparity is > 50 pp and recall collapse > 30 pp
  const isConfirmed = trainPrevalenceDisparity > 0.5 && recallCollapseDelta > 0.3;

  const evidenceSummary = isConfirmed
    ? `Shortcut learning confirmed for artifact "${shortcutKey}". Artifact was present in ${(trainPrevPos * 100).toFixed(1)}% of positive training samples but only ${(prodPrevPos * 100).toFixed(1)}% of production positives. When the artifact is absent, positive recall collapses from ${(recallWith * 100).toFixed(1)}% down to ${(recallWithout * 100).toFixed(1)}% (a -${(recallCollapseDelta * 100).toFixed(1)} pp collapse; Odds Ratio ${oddsRatio.toFixed(1)}x).`
    : `No critical shortcut learning disparity detected for artifact "${shortcutKey}".`;

  const recommendations: string[] = [];
  if (isConfirmed) {
    recommendations.push(
      `Apply border inpainting or central bounding box cropping during pre-processing to eliminate the "${shortcutKey}" artifact.`
    );
    recommendations.push(
      `Perform counterfactual data augmentation: synthetically paste the "${shortcutKey}" artifact onto negative samples to unlearn the spurious correlation.`
    );
    recommendations.push(
      `Audit future clinical data collection protocols to ensure physical measurement scale rulers are standardized across both benign and malignant cases.`
    );
  }

  return {
    shortcutKey,
    totalEvaluatedRecords: records.length,
    trainPrevalenceInPositives: trainPrevPos,
    trainPrevalenceInNegatives: trainPrevNeg,
    trainPrevalenceDisparity,
    prodPrevalenceInPositives: prodPrevPos,
    prodPrevalenceInNegatives: prodPrevNeg,
    positiveRecallWithShortcut: recallWith,
    positiveRecallWithoutShortcut: recallWithout,
    recallCollapseDelta,
    oddsRatio,
    hasShortcutBiasConfirmed: isConfirmed,
    evidenceSummary,
    recommendations,
  };
}
