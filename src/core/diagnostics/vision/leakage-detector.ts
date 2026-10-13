/**
 * Cross-Split Near-Duplicate Leakage Detector & Performance Inflation Analyzer.
 * Identifies perceptual near-duplicate images across dataset partitions (e.g. Train vs Validation/Production)
 * using 64-bit dHash/aHash Hamming distances and quantifies the leakage-inflated performance gap
 * with 95% Wilson score confidence intervals.
 */

import { computeHammingDistance } from './perceptual-hash.ts';
import type { VisionRecord } from '../../domain/vision-types.ts';

export interface WilsonConfidenceInterval {
  center: number;
  lower: number;
  upper: number;
}

export function computeWilsonInterval(
  successes: number,
  total: number,
  z = 1.96
): WilsonConfidenceInterval {
  if (total <= 0) return { center: 0, lower: 0, upper: 0 };

  const p = successes / total;
  const z2 = z * z;
  const denom = 1 + z2 / total;
  const center = (p + z2 / (2 * total)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total))) / denom;

  return {
    center,
    lower: Math.max(0, center - margin),
    upper: Math.min(1, center + margin),
  };
}

export interface NearDuplicateLeakageMatch {
  evalImageId: string;
  evalSplit: string;
  trainImageId: string;
  hammingDistance: number;
  hashType: 'dHash' | 'aHash';
  evalOutcome: 'CORRECT' | 'INCORRECT';
  yTrue: string | number;
  yPred: string | number;
}

export interface CrossSplitLeakageReport {
  totalEvalImagesScanned: number;
  totalTrainImagesScanned: number;
  leakedImageCount: number;
  leakedImageRate: number;
  leakedAccuracy: number;
  leakedWilsonCi: WilsonConfidenceInterval;
  cleanAccuracy: number;
  cleanWilsonCi: WilsonConfidenceInterval;
  leakageInflationGap: number; // percentage points (leaked - clean)
  matches: NearDuplicateLeakageMatch[];
  hasSevereLeakageInflation: boolean;
}

export interface LeakageScanOptions {
  hammingThreshold?: number; // Maximum bit distance to consider near-duplicate (default: 1)
  trainSplitName?: string;   // Default: 'train'
  evalSplitNames?: string[]; // Default: ['val', 'test', 'production']
}

/**
 * Scans dataset records for cross-split perceptual near-duplicates and quantifies performance inflation
 */
export function scanCrossSplitLeakage(
  records: VisionRecord[],
  options: LeakageScanOptions = {}
): CrossSplitLeakageReport {
  const threshold = options.hammingThreshold ?? 1;
  const trainSplit = options.trainSplitName ?? 'train';
  const evalSplits = options.evalSplitNames ?? ['val', 'test', 'production'];

  // Separate records into training cohort and evaluation cohort
  const trainCohort: VisionRecord[] = [];
  const evalCohort: VisionRecord[] = [];

  for (const r of records) {
    const s = r.split?.toLowerCase() || '';
    if (s === trainSplit) {
      trainCohort.push(r);
    } else if (evalSplits.some((es) => s.includes(es))) {
      evalCohort.push(r);
    }
  }

  const matches: NearDuplicateLeakageMatch[] = [];
  const leakedEvalIds = new Set<string>();

  // Compare each evaluation image against training cohort
  for (const evalRec of evalCohort) {
    const evalHash = evalRec.qualityProfile?.dHash;
    if (!evalHash) continue;

    let closestTrainId: string | null = null;
    let minDistance = 65;

    for (const trainRec of trainCohort) {
      const trainHash = trainRec.qualityProfile?.dHash;
      if (!trainHash) continue;

      const dist = computeHammingDistance(evalHash, trainHash);
      if (dist < minDistance) {
        minDistance = dist;
        closestTrainId = trainRec.imageId;
      }

      if (dist === 0) break; // Exact perceptual match
    }

    if (closestTrainId !== null && minDistance <= threshold) {
      leakedEvalIds.add(evalRec.imageId);
      const isCorrect = String(evalRec.yTrue) === String(evalRec.yPred);

      matches.push({
        evalImageId: evalRec.imageId,
        evalSplit: evalRec.split || 'eval',
        trainImageId: closestTrainId,
        hammingDistance: minDistance,
        hashType: 'dHash',
        evalOutcome: isCorrect ? 'CORRECT' : 'INCORRECT',
        yTrue: evalRec.yTrue,
        yPred: evalRec.yPred,
      });
    }
  }

  // Calculate performance on leaked subset vs clean subset
  let leakedCorrect = 0;
  let cleanCorrect = 0;
  let cleanTotal = 0;

  for (const r of evalCohort) {
    const isCorrect = String(r.yTrue) === String(r.yPred);
    if (leakedEvalIds.has(r.imageId)) {
      if (isCorrect) leakedCorrect++;
    } else {
      cleanTotal++;
      if (isCorrect) cleanCorrect++;
    }
  }

  const leakedCount = leakedEvalIds.size;
  const leakedAccuracy = leakedCount > 0 ? leakedCorrect / leakedCount : 0;
  const cleanAccuracy = cleanTotal > 0 ? cleanCorrect / cleanTotal : 0;
  const leakageInflationGap = leakedAccuracy - cleanAccuracy;

  const leakedWilsonCi = computeWilsonInterval(leakedCorrect, leakedCount);
  const cleanWilsonCi = computeWilsonInterval(cleanCorrect, cleanTotal);

  // Severe leakage inflation if gap is > 15 percentage points
  const hasSevereLeakageInflation = leakedCount > 0 && leakageInflationGap >= 0.15;

  return {
    totalEvalImagesScanned: evalCohort.length,
    totalTrainImagesScanned: trainCohort.length,
    leakedImageCount: leakedCount,
    leakedImageRate: evalCohort.length > 0 ? leakedCount / evalCohort.length : 0,
    leakedAccuracy,
    leakedWilsonCi,
    cleanAccuracy,
    cleanWilsonCi,
    leakageInflationGap,
    matches,
    hasSevereLeakageInflation,
  };
}
