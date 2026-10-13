/**
 * Controlled Vision Robustness Evaluator (Zero Code Execution Invariant).
 * Evaluates performance decay curves across precomputed image perturbations (e.g. noise, blur).
 * Strictly complies with the Zero Arbitrary Code Execution invariant by prohibiting server-side
 * execution of unverified Python / PyTorch / ONNX model weights.
 * Transparently reports evaluation as UNAVAILABLE when precomputed perturbations are omitted.
 */

import type { VisionRecord } from '../../domain/vision-types.ts';

export interface PerturbationDecayLevel {
  levelName: string;
  severity: number; // e.g. 1 to 5
  sampleCount: number;
  accuracy: number;
  accuracyDropFromClean: number;
}

export interface VisionRobustnessReport {
  status: 'EVALUATED' | 'UNAVAILABLE';
  perturbationType?: string;
  cleanAccuracy?: number;
  decayCurve?: PerturbationDecayLevel[];
  maxAccuracyDrop?: number;
  isVulnerableToPerturbation?: boolean;
  unavailabilityNotice?: string;
  offlineGenerationGuide?: string;
}

/**
 * Evaluates vision model robustness over precomputed perturbation fields
 */
export function evaluateVisionRobustness(
  records: VisionRecord[],
  options: {
    cleanPredictionField?: string;
    perturbationPrefix?: string; // e.g. 'pred_noise_' or 'pred_blur_'
  } = {}
): VisionRobustnessReport {
  if (records.length === 0) {
    return {
      status: 'UNAVAILABLE',
      unavailabilityNotice: 'No records provided for robustness evaluation.',
    };
  }

  // Scan metadata of first record to discover any precomputed perturbation fields
  const firstRec = records[0];
  const metaKeys = Object.keys(firstRec.metadata ?? {});
  const prefix = options.perturbationPrefix ?? 'pred_perturb_';

  const perturbationKeys = metaKeys
    .filter((k) => k.startsWith(prefix) || k.includes('_noise_') || k.includes('_blur_'))
    .sort();

  // If no perturbation columns are present, enforce honest UNAVAILABLE reporting
  if (perturbationKeys.length === 0) {
    return {
      status: 'UNAVAILABLE',
      unavailabilityNotice:
        'ROBUSTNESS_EVALUATION_UNAVAILABLE: No precomputed perturbation predictions were found in dataset manifest.',
      offlineGenerationGuide:
        'Security Invariant: WhyLab strictly prohibits arbitrary server-side execution of uploaded Python / PyTorch model weights. To assess corruption robustness: 1) Apply offline perturbations (e.g., albumentations GaussianBlur, GaussianNoise) in your local secure training pipeline; 2) Infer labels with your local model; 3) Export companion prediction columns (e.g. "pred_blur_severity_1", "pred_blur_severity_2") into your CSV manifest.',
    };
  }

  // Compute clean accuracy
  let cleanCorrect = 0;
  for (const r of records) {
    if (String(r.yTrue) === String(r.yPred)) cleanCorrect++;
  }
  const cleanAccuracy = cleanCorrect / records.length;

  const decayCurve: PerturbationDecayLevel[] = [];
  let maxDrop = 0;

  for (let idx = 0; idx < perturbationKeys.length; idx++) {
    const key = perturbationKeys[idx];
    let correct = 0;

    for (const r of records) {
      const pred = r.metadata?.[key];
      if (String(r.yTrue) === String(pred)) correct++;
    }

    const acc = correct / records.length;
    const drop = cleanAccuracy - acc;
    if (drop > maxDrop) maxDrop = drop;

    decayCurve.push({
      levelName: key,
      severity: idx + 1,
      sampleCount: records.length,
      accuracy: acc,
      accuracyDropFromClean: drop,
    });
  }

  return {
    status: 'EVALUATED',
    perturbationType: perturbationKeys[0].split('_')[1] || 'generic_perturbation',
    cleanAccuracy,
    decayCurve,
    maxAccuracyDrop: maxDrop,
    isVulnerableToPerturbation: maxDrop > 0.2, // Drop of > 20 pp flags vulnerability
  };
}
