import { createId, id, type Id } from './primitives.ts';
import {
  array,
  count,
  enumeration,
  literal,
  nullable,
  number,
  object,
  refine,
  text,
  timestamp,
  union,
  unique,
  type Infer,
} from './schema.ts';

export const artifactRoles = [
  'training',
  'validation',
  'evaluation',
  'production',
  'reference',
  'predictions',
  'ground_truth',
  'training_log',
  'model_metadata',
] as const;

export type ArtifactRole = (typeof artifactRoles)[number];

export const artifactFormats = [
  'csv',
  'tsv',
  'json',
  'jsonl',
  'text_log',
] as const;

export type ArtifactFormat = (typeof artifactFormats)[number];

export const artifactValidationStatuses = [
  'valid',
  'warning',
  'invalid',
] as const;

export type ArtifactValidationStatus = (typeof artifactValidationStatuses)[number];

export const columnTypeEnum = enumeration(['numeric', 'categorical', 'boolean', 'timestamp', 'empty']);
export type DetectedColumnType = Infer<typeof columnTypeEnum>;

export interface TabularColumnSummary {
  name: string;
  detectedType: DetectedColumnType;
  distinctCount: number;
  missingCount: number;
  min?: number | null;
  max?: number | null;
  sampleValues: string[];
}

export interface TabularSchema {
  columns: string[];
  columnTypes: Record<string, DetectedColumnType>;
  rowCount: number;
  sampleRows: Record<string, string>[];
  columnSummaries?: TabularColumnSummary[];
}

export interface MetricHistoryPoint {
  epoch: number;
  trainLoss?: number;
  valLoss?: number;
  accuracy?: number;
  valAccuracy?: number;
  precision?: number;
  valPrecision?: number;
  recall?: number;
  valRecall?: number;
  f1?: number;
  valF1?: number;
  learningRate?: number;
  customMetrics?: Record<string, number>;
}

export interface TrainingLogExtraction {
  framework: 'pytorch' | 'keras' | 'sklearn' | 'xgboost' | 'lightgbm' | 'generic';
  totalEpochs: number;
  metricHistory: MetricHistoryPoint[];
  finalTrainLoss?: number;
  finalValLoss?: number;
  learningRate?: number;
  earlyStoppingEpoch?: number | null;
  trainingDurationSeconds?: number | null;
  warnings: string[];
  unrecognizedLinesCount: number;
}

export interface ModelMetadataExtraction {
  modelName?: string;
  modelVersion?: string;
  framework?: string;
  taskType?: 'binary_classification' | 'multiclass_classification' | 'regression' | 'unknown';
  targetColumn?: string;
  featureColumns?: string[];
  hyperparameters?: Record<string, unknown>;
  randomSeed?: number;
  trainingConfig?: Record<string, unknown>;
  datasetVersion?: string;
  environment?: string;
  rawJson?: Record<string, unknown>;
}

export interface InvestigationArtifact {
  id: Id<'artifact'>;
  investigationId?: Id<'investigation'>;
  name: string;
  role: ArtifactRole;
  format: ArtifactFormat;
  sizeBytes: number;
  contentDigest: string | null;
  validationStatus: ArtifactValidationStatus;
  validationIssues: string[];
  schema?: TabularSchema;
  trainingLog?: TrainingLogExtraction;
  modelMetadata?: ModelMetadataExtraction;
  rawContent?: string;
}

/**
 * Validates relationship invariants between multiple artifacts in an investigation.
 */
export interface MultiArtifactValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
  alignedArtifactPairs: Array<{
    sourceArtifactId: Id<'artifact'>;
    targetArtifactId: Id<'artifact'>;
    relationship: 'split_pair' | 'reference_production' | 'features_predictions' | 'predictions_ground_truth';
    overlapColumns: string[];
    missingInTarget: string[];
  }>;
}

export function validateArtifactRelationships(
  artifacts: readonly InvestigationArtifact[]
): MultiArtifactValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const alignedArtifactPairs: MultiArtifactValidationResult['alignedArtifactPairs'] = [];

  const tabularArtifacts = artifacts.filter((a) => a.schema && a.schema.columns.length > 0);
  const trainArtifact = tabularArtifacts.find((a) => a.role === 'training');
  const valArtifact = tabularArtifacts.find((a) => a.role === 'validation');
  const refArtifact = tabularArtifacts.find((a) => a.role === 'reference');
  const prodArtifact = tabularArtifacts.find((a) => a.role === 'production');
  const predArtifact = tabularArtifacts.find((a) => a.role === 'predictions');
  const truthArtifact = tabularArtifacts.find((a) => a.role === 'ground_truth');

  // 1. Train vs Validation Schema Check
  if (trainArtifact?.schema && valArtifact?.schema) {
    const trainCols = new Set(trainArtifact.schema.columns);
    const valCols = new Set(valArtifact.schema.columns);
    const overlap = trainArtifact.schema.columns.filter((c) => valCols.has(c));
    const missingInVal = trainArtifact.schema.columns.filter((c) => !valCols.has(c));
    const extraInVal = valArtifact.schema.columns.filter((c) => !trainCols.has(c));

    alignedArtifactPairs.push({
      sourceArtifactId: trainArtifact.id,
      targetArtifactId: valArtifact.id,
      relationship: 'split_pair',
      overlapColumns: overlap,
      missingInTarget: missingInVal,
    });

    if (missingInVal.length > 0) {
      warnings.push(
        `Validation dataset "${valArtifact.name}" is missing ${missingInVal.length} columns present in Training ("${trainArtifact.name}"): [${missingInVal.slice(0, 3).join(', ')}${missingInVal.length > 3 ? '...' : ''}].`
      );
    }
    if (extraInVal.length > 0) {
      warnings.push(
        `Validation dataset "${valArtifact.name}" has ${extraInVal.length} unexpected columns not present in Training: [${extraInVal.slice(0, 3).join(', ')}${extraInVal.length > 3 ? '...' : ''}].`
      );
    }
  }

  // 2. Reference vs Production Drift Check
  if (refArtifact?.schema && prodArtifact?.schema) {
    const refCols = new Set(refArtifact.schema.columns);
    const prodCols = new Set(prodArtifact.schema.columns);
    const overlap = refArtifact.schema.columns.filter((c) => prodCols.has(c));
    const missingInProd = refArtifact.schema.columns.filter((c) => !prodCols.has(c));

    alignedArtifactPairs.push({
      sourceArtifactId: refArtifact.id,
      targetArtifactId: prodArtifact.id,
      relationship: 'reference_production',
      overlapColumns: overlap,
      missingInTarget: missingInProd,
    });

    if (overlap.length === 0) {
      errors.push(
        `Reference "${refArtifact.name}" and Production "${prodArtifact.name}" have 0 overlapping columns. Distribution shift cannot be evaluated.`
      );
    } else if (missingInProd.length > 0) {
      warnings.push(
        `Production dataset "${prodArtifact.name}" is missing ${missingInProd.length} features present in Reference.`
      );
    }
  }

  // 3. Predictions vs Ground Truth Alignment Check
  if (predArtifact?.schema && truthArtifact?.schema) {
    if (predArtifact.schema.rowCount !== truthArtifact.schema.rowCount) {
      errors.push(
        `Row count mismatch: Predictions "${predArtifact.name}" has ${predArtifact.schema.rowCount} rows, but Ground Truth "${truthArtifact.name}" has ${truthArtifact.schema.rowCount} rows. Explicit join key or aligned row counts required.`
      );
    } else {
      alignedArtifactPairs.push({
        sourceArtifactId: predArtifact.id,
        targetArtifactId: truthArtifact.id,
        relationship: 'predictions_ground_truth',
        overlapColumns: [],
        missingInTarget: [],
      });
    }
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
    alignedArtifactPairs,
  };
}
