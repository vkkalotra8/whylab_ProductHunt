/**
 * WhyLab 2.0 — Computer Vision Domain Types & Contracts.
 * Defines typed records, quality profiles, classification metrics, and dataset contracts.
 */

export type VisionSplit = 'train' | 'val' | 'test' | 'production' | 'unspecified';
export type ImageFormat = 'jpeg' | 'png' | 'webp' | 'unknown';

export interface ImageQualityProfile {
  imageId: string;
  width: number;
  height: number;
  aspectRatio: number;
  meanLuminance: number;       // [0, 255]
  stdLuminance: number;
  rmsContrast: number;         // Normalized RMS contrast [0, 1]
  meanSaturation?: number;
  colorfulness?: number;
  sharpness: number;           // Discrete Laplacian variance indicator
  edgeDensity?: number;
  noiseEstimate?: number;
  clippedHighlights: number;   // Fraction of pixels with Y > 250 [0, 1]
  crushedBlacks: number;       // Fraction of pixels with Y < 5 [0, 1]
  dominantHue?: number;
  jpegQualityEstimate?: number;
  dHash?: string;              // 64-bit difference hash hex
  aHash?: string;              // 64-bit average hash hex
  format?: ImageFormat;
  fileSizeBytes?: number;
  sha256Digest?: string;
}

export type VisionClassificationOutcome =
  | 'TRUE_POSITIVE'
  | 'TRUE_NEGATIVE'
  | 'FALSE_POSITIVE'
  | 'FALSE_NEGATIVE'
  | 'CORRECT'
  | 'INCORRECT';

export type VisionFailureCategory =
  | 'CORRECT_HIGH_CONF'
  | 'CORRECT_LOW_CONF'
  | 'INCORRECT_HIGH_CONF'
  | 'INCORRECT_LOW_CONF';

export interface VisionRecord {
  imageId: string;
  filename?: string;
  yTrue: string | number;
  yPred: string | number;
  confidence?: number | null;
  yProbability?: number | null;
  split?: VisionSplit;
  site?: string;
  device?: string;
  captureTime?: string;
  metadata?: Record<string, unknown>;
  qualityProfile?: ImageQualityProfile;
  thumbnailDataUrl?: string;
  outcome?: VisionClassificationOutcome;
  failureCategory?: VisionFailureCategory;
}

export interface VisionDataset {
  id: string;
  name: string;
  recordCount: number;
  classes: string[];
  records: VisionRecord[];
  splits: Record<string, number>;
  contentDigest: string;
  uploadedAt: string;
  hasThumbnails: boolean;
  hasQualityProfiles: boolean;
}

export interface ArchiveFileEntry {
  path: string;
  filename: string;
  sizeBytes: number;
  data: Buffer;
  format: ImageFormat;
  sha256: string;
}

export interface ArchiveExtractionResult {
  success: boolean;
  files: ArchiveFileEntry[];
  manifestCsv?: string;
  totalExtractedBytes: number;
  errors: string[];
  warnings: string[];
}

export interface MulticlassPerClassMetric {
  className: string;
  support: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  trueNegatives: number;
  precision: number | null;
  recall: number | null;
  f1Score: number | null;
  specificity: number | null;
  prevalence: number;
}

export interface MulticlassSummaryMetrics {
  totalSamples: number;
  classes: string[];
  overallAccuracy: number;
  macroPrecision: number;
  macroRecall: number;
  macroF1: number;
  microF1: number;
  weightedF1: number;
  confusionMatrix: {
    classes: string[];
    matrix: number[][]; // matrix[trueIdx][predIdx]
  };
  perClass: Record<string, MulticlassPerClassMetric>;
  highConfidenceErrorCount: number; // Silent catastrophic failures
  lowConfidenceCorrectCount: number;
}

export interface DuplicateCluster {
  digest: string;
  imageIds: string[];
  filenames: string[];
  splits: string[];
  isCrossSplitContamination: boolean;
}

export interface ExactDuplicateReport {
  totalImagesScanned: number;
  uniqueImageCount: number;
  duplicateGroupCount: number;
  totalDuplicateInstances: number;
  crossSplitContaminationCount: number;
  clusters: DuplicateCluster[];
}
