/**
 * Deterministic Computer Vision Image Quality & Statistical Profile Extractor.
 * Computes:
 * - Luminance distribution (Mean Y, Std Y)
 * - RMS Contrast
 * - Discrete Laplacian Sharpness Variance (Textbook OpenCV cv2.Laplacian(img).var() equivalent)
 * - Highlights and crushed black clipping rates
 * - Edge density and noise estimates
 * Pure TypeScript mathematics, deterministic, 0 native dependencies.
 */

import type { ImageQualityProfile } from '../../domain/vision-types.ts';

export interface GrayscaleQualityMetrics {
  meanLuminance: number;       // [0, 255]
  stdLuminance: number;
  rmsContrast: number;         // Normalized [0, 1]
  sharpness: number;           // Discrete Laplacian variance
  edgeDensity: number;         // Fraction of edge pixels [0, 1]
  clippedHighlights: number;   // Fraction with Y > 250 [0, 1]
  crushedBlacks: number;       // Fraction with Y < 5 [0, 1]
  noiseEstimate: number;
}

/**
 * Computes exact deterministic image quality metrics from a 2D grayscale pixel array
 */
export function computeGrayscaleQualityMetrics(
  pixels: ArrayLike<number>,
  width: number,
  height: number
): GrayscaleQualityMetrics {
  const n = width * height;
  if (n <= 0 || pixels.length < n) {
    throw new Error(`Pixel array size (${pixels.length}) is smaller than width * height (${n})`);
  }

  // 1. Luminance and clipping pass
  let sumY = 0;
  let clippedHigh = 0;
  let crushedLow = 0;

  for (let i = 0; i < n; i++) {
    const y = pixels[i];
    sumY += y;
    if (y > 250) clippedHigh++;
    if (y < 5) crushedLow++;
  }

  const meanLuminance = sumY / n;

  let sumSqDiff = 0;
  for (let i = 0; i < n; i++) {
    const diff = pixels[i] - meanLuminance;
    sumSqDiff += diff * diff;
  }

  const stdLuminance = Math.sqrt(sumSqDiff / n);
  const rmsContrast = Math.min(1.0, stdLuminance / 255.0);
  const clippedHighlights = clippedHigh / n;
  const crushedBlacks = crushedLow / n;

  // 2. Discrete Laplacian kernel pass: [0 1 0; 1 -4 1; 0 1 0]
  if (width < 3 || height < 3) {
    return {
      meanLuminance,
      stdLuminance,
      rmsContrast,
      sharpness: 0,
      edgeDensity: 0,
      clippedHighlights,
      crushedBlacks,
      noiseEstimate: 0,
    };
  }

  const interiorCount = (width - 2) * (height - 2);
  let sumLap = 0;
  const lapValues = new Float64Array(interiorCount);
  let lapIdx = 0;
  let edgeCount = 0;

  for (let y = 1; y < height - 1; y++) {
    const rowOffset = y * width;
    for (let x = 1; x < width - 1; x++) {
      const idx = rowOffset + x;
      // Discrete 4-neighbor Laplacian: L = P(x+1,y) + P(x-1,y) + P(x,y+1) + P(x,y-1) - 4*P(x,y)
      const lap =
        pixels[idx + 1] +
        pixels[idx - 1] +
        pixels[idx + width] +
        pixels[idx - width] -
        4 * pixels[idx];

      lapValues[lapIdx++] = lap;
      sumLap += lap;

      if (Math.abs(lap) > 25) {
        edgeCount++;
      }
    }
  }

  const meanLap = sumLap / interiorCount;
  let sumLapSqDiff = 0;
  for (let i = 0; i < interiorCount; i++) {
    const diff = lapValues[i] - meanLap;
    sumLapSqDiff += diff * diff;
  }

  // Sharpness is the sample/population variance of Laplacian
  const sharpness = sumLapSqDiff / interiorCount;
  const edgeDensity = edgeCount / interiorCount;
  const noiseEstimate = Math.sqrt(sharpness) * 0.1;

  return {
    meanLuminance,
    stdLuminance,
    rmsContrast,
    sharpness,
    edgeDensity,
    clippedHighlights,
    crushedBlacks,
    noiseEstimate,
  };
}

/**
 * Builds a standardized ImageQualityProfile for an image
 */
export function buildImageQualityProfile(
  imageId: string,
  width: number,
  height: number,
  pixels?: ArrayLike<number>,
  defaults: Partial<ImageQualityProfile> = {}
): ImageQualityProfile {
  const aspectRatio = width / (height || 1);

  if (pixels && pixels.length >= width * height) {
    const metrics = computeGrayscaleQualityMetrics(pixels, width, height);
    return {
      imageId,
      width,
      height,
      aspectRatio,
      meanLuminance: metrics.meanLuminance,
      stdLuminance: metrics.stdLuminance,
      rmsContrast: metrics.rmsContrast,
      sharpness: metrics.sharpness,
      edgeDensity: metrics.edgeDensity,
      clippedHighlights: metrics.clippedHighlights,
      crushedBlacks: metrics.crushedBlacks,
      noiseEstimate: metrics.noiseEstimate,
      ...defaults,
    };
  }

  return {
    imageId,
    width,
    height,
    aspectRatio,
    meanLuminance: defaults.meanLuminance ?? 128,
    stdLuminance: defaults.stdLuminance ?? 40,
    rmsContrast: defaults.rmsContrast ?? 0.15,
    sharpness: defaults.sharpness ?? 150,
    clippedHighlights: defaults.clippedHighlights ?? 0,
    crushedBlacks: defaults.crushedBlacks ?? 0,
    ...defaults,
  };
}

export interface QualityDistributionSummary {
  sampleCount: number;
  meanSharpness: number;
  medianSharpness: number;
  minSharpness: number;
  maxSharpness: number;
  meanLuminance: number;
  meanRmsContrast: number;
  blurryImageCount: number;         // sharpness < 120
  overexposedImageCount: number;    // meanLuminance > 200 or clippedHighlights > 0.05
  underexposedImageCount: number;   // meanLuminance < 70 or crushedBlacks > 0.08
  blurryImageRate: number;
}

/**
 * Aggregates quality profiles across a vision dataset to expose global quality health
 */
export function summarizeQualityDistribution(
  profiles: ImageQualityProfile[],
  blurThreshold = 120
): QualityDistributionSummary {
  if (profiles.length === 0) {
    return {
      sampleCount: 0,
      meanSharpness: 0,
      medianSharpness: 0,
      minSharpness: 0,
      maxSharpness: 0,
      meanLuminance: 0,
      meanRmsContrast: 0,
      blurryImageCount: 0,
      overexposedImageCount: 0,
      underexposedImageCount: 0,
      blurryImageRate: 0,
    };
  }

  let totalSharpness = 0;
  let totalLuminance = 0;
  let totalContrast = 0;
  let blurryCount = 0;
  let overexposedCount = 0;
  let underexposedCount = 0;

  const sharpnessList = profiles.map((p) => p.sharpness).sort((a, b) => a - b);

  for (const p of profiles) {
    totalSharpness += p.sharpness;
    totalLuminance += p.meanLuminance;
    totalContrast += p.rmsContrast;

    if (p.sharpness < blurThreshold) blurryCount++;
    if (p.meanLuminance > 200 || p.clippedHighlights > 0.05) overexposedCount++;
    if (p.meanLuminance < 70 || p.crushedBlacks > 0.08) underexposedCount++;
  }

  const n = profiles.length;
  const mid = Math.floor(n / 2);
  const medianSharpness = n % 2 === 0 ? (sharpnessList[mid - 1] + sharpnessList[mid]) / 2 : sharpnessList[mid];

  return {
    sampleCount: n,
    meanSharpness: totalSharpness / n,
    medianSharpness,
    minSharpness: sharpnessList[0],
    maxSharpness: sharpnessList[n - 1],
    meanLuminance: totalLuminance / n,
    meanRmsContrast: totalContrast / n,
    blurryImageCount: blurryCount,
    overexposedImageCount: overexposedCount,
    underexposedImageCount: underexposedCount,
    blurryImageRate: blurryCount / n,
  };
}
