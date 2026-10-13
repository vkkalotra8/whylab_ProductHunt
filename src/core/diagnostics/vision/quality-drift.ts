/**
 * Image Quality Distribution Shift & Cohort Drift Diagnostics.
 * Computes:
 * - Two-sample Kolmogorov-Smirnov (KS) statistic
 * - Population Stability Index (PSI) with 10 bins
 * - Wasserstein-1 distance (Earth Mover's Distance)
 * Evaluates quality drift (sharpness, luminance) across acquisition sites (Site A vs Site B)
 * and dataset partitions (Train vs Production).
 */

import type { VisionRecord } from '../../domain/vision-types.ts';

export interface DistributionShiftMetric {
  featureName: string;
  sampleSizeA: number;
  sampleSizeB: number;
  meanA: number;
  meanB: number;
  deltaMean: number;
  ksStatistic: number;       // [0, 1]
  psi: number;               // Population Stability Index
  wassersteinDistance: number;
  shiftLevel: 'NONE' | 'MODERATE' | 'SEVERE';
}

export interface VisionCohortDriftReport {
  cohortAName: string;
  cohortBName: string;
  metrics: Record<string, DistributionShiftMetric>;
  hasSevereQualityShift: boolean;
  recommendations: string[];
}

/**
 * Computes two-sample Kolmogorov-Smirnov statistic D = max |F_A(x) - F_B(x)|
 */
export function computeTwoSampleKS(sampleA: number[], sampleB: number[]): number {
  if (sampleA.length === 0 || sampleB.length === 0) return 0;

  const a = [...sampleA].sort((x, y) => x - y);
  const b = [...sampleB].sort((x, y) => x - y);

  const nA = a.length;
  const nB = b.length;

  let i = 0;
  let j = 0;
  let maxD = 0;

  while (i < nA && j < nB) {
    const valA = a[i];
    const valB = b[j];

    if (valA <= valB) {
      i++;
    }
    if (valB <= valA) {
      j++;
    }

    const cdfA = i / nA;
    const cdfB = j / nB;
    const diff = Math.abs(cdfA - cdfB);
    if (diff > maxD) maxD = diff;
  }

  return maxD;
}

/**
 * Computes Population Stability Index (PSI) using 10 equal-width bins
 */
export function computePSI(sampleA: number[], sampleB: number[], binCount = 10): number {
  if (sampleA.length === 0 || sampleB.length === 0) return 0;

  const minVal = Math.min(...sampleA, ...sampleB);
  const maxVal = Math.max(...sampleA, ...sampleB);

  if (minVal === maxVal) return 0;

  const binWidth = (maxVal - minVal) / binCount;
  const countsA = new Array(binCount).fill(0);
  const countsB = new Array(binCount).fill(0);

  for (const v of sampleA) {
    let b = Math.floor((v - minVal) / binWidth);
    if (b >= binCount) b = binCount - 1;
    countsA[b]++;
  }

  for (const v of sampleB) {
    let b = Math.floor((v - minVal) / binWidth);
    if (b >= binCount) b = binCount - 1;
    countsB[b]++;
  }

  const eps = 1e-4;
  let psi = 0;

  for (let i = 0; i < binCount; i++) {
    const pA = countsA[i] / sampleA.length;
    const pB = countsB[i] / sampleB.length;

    const actualA = Math.max(pA, eps);
    const actualB = Math.max(pB, eps);

    psi += (actualA - actualB) * Math.log(actualA / actualB);
  }

  return Math.max(0, psi);
}

/**
 * Computes 1D Wasserstein-1 Distance (integral of |F_A(x) - F_B(x)|)
 */
export function computeWasserstein1D(sampleA: number[], sampleB: number[]): number {
  if (sampleA.length === 0 || sampleB.length === 0) return 0;

  const a = [...sampleA].sort((x, y) => x - y);
  const b = [...sampleB].sort((x, y) => x - y);

  const nA = a.length;
  const nB = b.length;

  const allPoints = Array.from(new Set([...a, ...b])).sort((x, y) => x - y);
  let distance = 0;

  let i = 0;
  let j = 0;

  for (let k = 0; k < allPoints.length - 1; k++) {
    const xCurrent = allPoints[k];
    const xNext = allPoints[k + 1];
    const dx = xNext - xCurrent;

    while (i < nA && a[i] <= xCurrent) i++;
    while (j < nB && b[j] <= xCurrent) j++;

    const cdfA = i / nA;
    const cdfB = j / nB;

    distance += Math.abs(cdfA - cdfB) * dx;
  }

  return distance;
}

/**
 * Compares two numerical feature cohorts and produces a structured drift metric
 */
export function compareQualityFeatureShift(
  sampleA: number[],
  sampleB: number[],
  featureName: string
): DistributionShiftMetric {
  const sumA = sampleA.reduce((acc, v) => acc + v, 0);
  const sumB = sampleB.reduce((acc, v) => acc + v, 0);
  const meanA = sampleA.length > 0 ? sumA / sampleA.length : 0;
  const meanB = sampleB.length > 0 ? sumB / sampleB.length : 0;

  const ksStatistic = computeTwoSampleKS(sampleA, sampleB);
  const psi = computePSI(sampleA, sampleB);
  const wassersteinDistance = computeWasserstein1D(sampleA, sampleB);

  let shiftLevel: 'NONE' | 'MODERATE' | 'SEVERE' = 'NONE';
  if (psi >= 0.25 || ksStatistic >= 0.4) {
    shiftLevel = 'SEVERE';
  } else if (psi >= 0.1 || ksStatistic >= 0.2) {
    shiftLevel = 'MODERATE';
  }

  return {
    featureName,
    sampleSizeA: sampleA.length,
    sampleSizeB: sampleB.length,
    meanA,
    meanB,
    deltaMean: meanB - meanA,
    ksStatistic,
    psi,
    wassersteinDistance,
    shiftLevel,
  };
}

/**
 * Detects cohort drift across acquisition sites or dataset splits
 */
export function detectVisionCohortDrift(
  records: VisionRecord[],
  options: {
    cohortAIdentifier?: string; // e.g. 'site_A' or 'train'
    cohortBIdentifier?: string; // e.g. 'site_B' or 'production'
    cohortField?: 'site' | 'split';
  } = {}
): VisionCohortDriftReport {
  const field = options.cohortField ?? 'site';
  const nameA = options.cohortAIdentifier ?? (field === 'site' ? 'site_A' : 'train');
  const nameB = options.cohortBIdentifier ?? (field === 'site' ? 'site_B' : 'production');

  const cohortARecords = records.filter(
    (r) => (field === 'site' ? r.site : r.split)?.toLowerCase() === nameA.toLowerCase()
  );
  const cohortBRecords = records.filter(
    (r) => (field === 'site' ? r.site : r.split)?.toLowerCase() === nameB.toLowerCase()
  );

  const sharpnessA = cohortARecords
    .map((r) => r.qualityProfile?.sharpness)
    .filter((v): v is number => v !== undefined);
  const sharpnessB = cohortBRecords
    .map((r) => r.qualityProfile?.sharpness)
    .filter((v): v is number => v !== undefined);

  const luminanceA = cohortARecords
    .map((r) => r.qualityProfile?.meanLuminance)
    .filter((v): v is number => v !== undefined);
  const luminanceB = cohortBRecords
    .map((r) => r.qualityProfile?.meanLuminance)
    .filter((v): v is number => v !== undefined);

  const contrastA = cohortARecords
    .map((r) => r.qualityProfile?.rmsContrast)
    .filter((v): v is number => v !== undefined);
  const contrastB = cohortBRecords
    .map((r) => r.qualityProfile?.rmsContrast)
    .filter((v): v is number => v !== undefined);

  const sharpnessShift = compareQualityFeatureShift(sharpnessA, sharpnessB, 'sharpness');
  const luminanceShift = compareQualityFeatureShift(luminanceA, luminanceB, 'luminance');
  const contrastShift = compareQualityFeatureShift(contrastA, contrastB, 'rms_contrast');

  const hasSevere =
    sharpnessShift.shiftLevel === 'SEVERE' ||
    luminanceShift.shiftLevel === 'SEVERE' ||
    contrastShift.shiftLevel === 'SEVERE';

  const recommendations: string[] = [];
  if (sharpnessShift.shiftLevel === 'SEVERE') {
    recommendations.push(
      `Severe optical blur drift detected between ${nameA} (mean: ${sharpnessShift.meanA.toFixed(0)}) and ${nameB} (mean: ${sharpnessShift.meanB.toFixed(0)}). Enforce a minimum Laplacian sharpness threshold filter (>= 150) or add synthetic motion blur to training augmentations.`
    );
  }
  if (luminanceShift.shiftLevel === 'SEVERE') {
    recommendations.push(
      `Significant illumination shift (KS: ${luminanceShift.ksStatistic.toFixed(3)}) between cohorts. Apply histogram equalization or color constancy normalization.`
    );
  }

  return {
    cohortAName: nameA,
    cohortBName: nameB,
    metrics: {
      sharpness: sharpnessShift,
      luminance: luminanceShift,
      rms_contrast: contrastShift,
    },
    hasSevereQualityShift: hasSevere,
    recommendations,
  };
}
