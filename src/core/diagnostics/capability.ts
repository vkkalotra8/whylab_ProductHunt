import type { EvaluationDataset } from './evaluation-ingestion.ts';
import {
  type DatasetCapabilityManifest,
  type CandidateTaskType,
  computeDatasetCapabilityManifest,
} from '../domain/capability-contracts.ts';

export type TaskType =
  | 'binary_classification'
  | 'multiclass_classification'
  | 'regression'
  | 'raw_features_no_predictions'
  | 'unsupervised_profiling'
  | 'prediction_audit'
  | 'unknown';

export type CapabilityStatus =
  | 'available'
  | 'running'
  | 'completed'
  | 'unavailable'
  | 'missing_evidence'
  | 'unsupported'
  | 'failed'
  | 'inconclusive';

export type CapabilityId =
  | 'binary_metrics'
  | 'probability_metrics'
  | 'regression_metrics'
  | 'threshold_sweep'
  | 'probability_calibration'
  | 'counterfactual_paradox'
  | 'slice_evaluation'
  | 'feature_leakage'
  | 'distribution_drift'
  | 'training_diagnostics'
  | 'split_drift'
  | 'split_contamination'
  | 'data_quality'
  | 'repair_lab';

export interface CapabilityItem {
  id: CapabilityId;
  title: string;
  category: 'metrics' | 'calibration' | 'drift' | 'fairness' | 'leakage' | 'repair' | 'training' | 'quality';
  status: CapabilityStatus;
  reason: string;
  howToEnable?: string;
  requiredColumns: string[];
}

export interface DatasetCapabilities {
  taskType: TaskType;
  taskTypeExplanation: string;
  isSupportedForInvestigation: boolean;
  unsupportedReason?: string;
  items: CapabilityItem[];
  summary: {
    total: number;
    availableCount: number;
    unavailableCount: number;
    unsupportedCount: number;
  };
  manifest?: DatasetCapabilityManifest;
}

export interface ColumnSummaryStats {
  name: string;
  detectedType: 'numeric' | 'categorical' | 'boolean' | 'timestamp' | 'empty';
  sampleValues: string[];
  distinctCount: number;
  missingCount: number;
  isNumeric: boolean;
  min?: number | null;
  max?: number | null;
}

export interface InferredColumnMapping {
  targetColumn: string | null;
  predictionColumn: string | null;
  probabilityColumn: string | null;
  sliceColumns: string[];
  idColumn: string | null;
}

export interface DatasetPreview {
  fileName: string;
  totalRows: number;
  previewRows: Record<string, string>[];
  columns: ColumnSummaryStats[];
  inferredMapping: InferredColumnMapping;
  detectedLabels: {
    positive: string;
    negative: string;
    candidates: string[];
  } | null;
  capabilities: DatasetCapabilities;
  validationIssues: string[];
  manifest?: DatasetCapabilityManifest;
}

/**
 * Heuristics for auto-detecting likely column mappings with user-confirmed overrides
 */
export function inferColumnMapping(
  columns: readonly string[],
  columnStats?: readonly ColumnSummaryStats[],
  confirmedMapping?: Partial<InferredColumnMapping>
): InferredColumnMapping {
  const statsMap = new Map(columnStats?.map((s) => [s.name, s]) ?? []);

  let targetColumn: string | null =
    confirmedMapping?.targetColumn !== undefined ? confirmedMapping.targetColumn : null;
  let predictionColumn: string | null =
    confirmedMapping?.predictionColumn !== undefined ? confirmedMapping.predictionColumn : null;
  let probabilityColumn: string | null =
    confirmedMapping?.probabilityColumn !== undefined ? confirmedMapping.probabilityColumn : null;
  let idColumn: string | null =
    confirmedMapping?.idColumn !== undefined ? confirmedMapping.idColumn : null;
  const sliceColumns: string[] =
    confirmedMapping?.sliceColumns !== undefined ? [...confirmedMapping.sliceColumns] : [];

  const hasUserConfirmedTarget = confirmedMapping?.targetColumn !== undefined;
  const hasUserConfirmedPred = confirmedMapping?.predictionColumn !== undefined;
  const hasUserConfirmedProb = confirmedMapping?.probabilityColumn !== undefined;
  const hasUserConfirmedId = confirmedMapping?.idColumn !== undefined;

  // Patterns
  const exactTargetPatterns = [/^(y_true|actual|ground_truth|truth)$/i];
  const candidateTargetNames = [/^(target|label|class)$/i];
  const predPatterns = [/^(y_pred|predicted|prediction|pred|y_hat|model_output|model_pred|model_prediction)$/i];
  const probPatterns = [/^(y_probability|y_prob|probability|prob|pos_score|confidence)$/i];
  const idPatterns = [/^(id|record_id|sample_id|patient_id|uuid|index)$/i];
  const slicePatterns = [/^(site|hospital|center|facility|region|country|device|slice|group|gender|sex|age_group|split)$/i];

  // 1. Target Column Detection
  if (!hasUserConfirmedTarget) {
    for (const pattern of exactTargetPatterns) {
      const match = columns.find((c) => pattern.test(c));
      if (match) {
        targetColumn = match;
        break;
      }
    }

    // Secondary heuristic: candidate names (target, label, class) verified against data cardinality
    if (!targetColumn) {
      for (const pattern of candidateTargetNames) {
        const match = columns.find((c) => pattern.test(c));
        if (match) {
          const stats = statsMap.get(match);
          if (stats) {
            // Do not infer target solely because named 'target' if it is unbounded or continuous
            if (
              stats.detectedType === 'boolean' ||
              stats.detectedType === 'categorical' ||
              (stats.distinctCount >= 1 && stats.distinctCount <= 10)
            ) {
              targetColumn = match;
              break;
            }
          } else {
            targetColumn = match;
            break;
          }
        }
      }
    }
  }

  // 2. Prediction Column Detection
  if (!hasUserConfirmedPred) {
    for (const pattern of predPatterns) {
      const match = columns.find((c) => c !== targetColumn && pattern.test(c));
      if (match) {
        predictionColumn = match;
        break;
      }
    }
  }

  // 3. Probability Column Detection
  // Do not silently interpret arbitrary numeric columns as prediction probabilities
  if (!hasUserConfirmedProb) {
    for (const pattern of probPatterns) {
      const match = columns.find((c) => c !== targetColumn && c !== predictionColumn && pattern.test(c));
      if (match) {
        const stats = statsMap.get(match);
        if (stats) {
          // Strict verification: numeric and range bounded in [0.0, 1.0]
          if (
            stats.isNumeric &&
            stats.min !== undefined &&
            stats.min !== null &&
            stats.min >= -0.001 &&
            stats.max !== undefined &&
            stats.max !== null &&
            stats.max <= 1.001 &&
            stats.distinctCount > 2
          ) {
            probabilityColumn = match;
            break;
          }
        } else if (/^(y_probability|y_prob|probability|prob|confidence|pos_score)$/i.test(match)) {
          // If no stats available, accept explicit standardized probability column names
          probabilityColumn = match;
          break;
        }
      }
    }
  }

  // 4. ID Column Detection
  if (!hasUserConfirmedId) {
    for (const pattern of idPatterns) {
      const match = columns.find(
        (c) => c !== targetColumn && c !== predictionColumn && c !== probabilityColumn && pattern.test(c)
      );
      if (match) {
        idColumn = match;
        break;
      }
    }
  }

  // 5. Slice Columns Detection
  if (confirmedMapping?.sliceColumns === undefined) {
    for (const col of columns) {
      if (col === targetColumn || col === predictionColumn || col === probabilityColumn || col === idColumn) {
        continue;
      }
      if (slicePatterns.some((p) => p.test(col))) {
        sliceColumns.push(col);
      } else {
        const stats = statsMap.get(col);
        if (stats && stats.detectedType === 'categorical' && stats.distinctCount >= 2 && stats.distinctCount <= 20) {
          sliceColumns.push(col);
        }
      }
    }
  }

  return {
    targetColumn,
    predictionColumn,
    probabilityColumn,
    sliceColumns,
    idColumn,
  };
}

/**
 * Detect task type based on target and prediction column characteristics
 */
export function detectTaskType(
  targetStats: ColumnSummaryStats | undefined,
  predStats: ColumnSummaryStats | undefined
): { taskType: TaskType; explanation: string; isSupported: boolean; unsupportedReason?: string } {
  if (!targetStats && !predStats) {
    return {
      taskType: 'unsupervised_profiling',
      explanation: 'Unsupervised dataset ready for structural distribution, duplicate detection, and data hygiene audits.',
      isSupported: true,
    };
  }

  if (!targetStats) {
    return {
      taskType: 'prediction_audit',
      explanation: 'Prediction-only dataset ready for inference confidence and output calibration audits.',
      isSupported: true,
    };
  }

  if (!predStats) {
    return {
      taskType: 'raw_features_no_predictions',
      explanation:
        'Dataset contains ground-truth targets and features, but no model predictions were found. Supervised model evaluation requires prediction columns (y_pred, prediction).',
      isSupported: false,
      unsupportedReason:
        'The current investigation engine is designed for binary classification evaluation. Model predictions (y_pred) are required to compute metrics and run automated investigation.',
    };
  }

  // Check unique values in target
  const targetDistinct = targetStats.distinctCount;

  // Single class edge case
  if (targetDistinct <= 1) {
    return {
      taskType: 'binary_classification',
      explanation: 'Single-class evaluation dataset detected (all true labels are identical). Metrics like ROC-AUC will be undefined.',
      isSupported: true,
    };
  }

  // Exactly 2 distinct values -> binary classification
  if (targetDistinct === 2) {
    return {
      taskType: 'binary_classification',
      explanation: 'Binary classification dataset with 2 distinct ground-truth classes.',
      isSupported: true,
    };
  }

  // More than 2 distinct values
  if (targetStats.isNumeric && targetDistinct > 15) {
    return {
      taskType: 'regression',
      explanation: `Target column has ${targetDistinct} continuous numeric values, typical of regression tasks.`,
      isSupported: false,
      unsupportedReason:
        'The current investigation engine is designed for binary classification evaluation. Continuous regression metrics (MAE, RMSE, R²) are not currently supported.',
    };
  }

  return {
    taskType: 'multiclass_classification',
    explanation: `Target column contains ${targetDistinct} discrete classes (${targetStats.sampleValues.slice(0, 5).join(', ')}).`,
    isSupported: false,
    unsupportedReason: `Multiclass classification (${targetDistinct} classes) is not currently supported. WhyLab 2.0 specialized investigation currently supports binary classification.`,
  };
}

/**
 * Evaluates available capabilities based on column stats and mapping
 */
export function evaluateCapabilities(
  columns: readonly (ColumnSummaryStats | string)[],
  mapping: InferredColumnMapping
): DatasetCapabilities {
  const normalizedColumns: ColumnSummaryStats[] = columns.map((c: any) =>
    typeof c === 'string'
      ? {
          name: c,
          detectedType: 'categorical',
          sampleValues: [],
          distinctCount: 0,
          missingCount: 0,
          isNumeric: false,
          min: null,
          max: null,
        }
      : c
  );
  const statsMap = new Map(normalizedColumns.map((c) => [c.name, c]));
  const targetStats = mapping.targetColumn ? statsMap.get(mapping.targetColumn) : undefined;
  const predStats = mapping.predictionColumn ? statsMap.get(mapping.predictionColumn) : undefined;
  const probStats = mapping.probabilityColumn ? statsMap.get(mapping.probabilityColumn) : undefined;

  const taskDetection = detectTaskType(targetStats, predStats);
  const isBinary = taskDetection.taskType === 'binary_classification';
  const hasProb = Boolean(probStats && probStats.isNumeric);
  const hasSlices = (mapping.sliceColumns?.length ?? 0) > 0;
  const featureColumns = normalizedColumns.filter(
    (c) =>
      c.name !== mapping.targetColumn &&
      c.name !== mapping.predictionColumn &&
      c.name !== mapping.probabilityColumn &&
      c.name !== mapping.idColumn
  );
  const hasFeatures = featureColumns.length > 0;

  const items: CapabilityItem[] = [
    {
      id: 'binary_metrics',
      title: 'Classification Core Metrics (Accuracy, Precision, Recall, F1)',
      category: 'metrics',
      status:
        isBinary && mapping.targetColumn && mapping.predictionColumn
          ? 'available'
          : mapping.targetColumn && !mapping.predictionColumn
          ? 'missing_evidence'
          : 'unsupported',
      reason:
        isBinary && mapping.targetColumn && mapping.predictionColumn
          ? 'Ground-truth and model prediction columns are mapped.'
          : mapping.targetColumn && !mapping.predictionColumn
          ? 'Ground-truth target mapped, but model predictions are absent. Core classification metrics require model predictions.'
          : taskDetection.unsupportedReason ?? 'Requires binary target and prediction columns.',
      howToEnable:
        mapping.targetColumn && !mapping.predictionColumn
          ? 'Map a model prediction column (y_pred, prediction) or upload model inference outputs.'
          : undefined,
      requiredColumns: [mapping.targetColumn ?? 'y_true', mapping.predictionColumn ?? 'y_pred'],
    },
    {
      id: 'probability_metrics',
      title: 'Threshold-Free Discriminative Metrics (ROC-AUC, PR-AUC)',
      category: 'metrics',
      status: isBinary && hasProb ? 'available' : 'unavailable',
      reason:
        isBinary && hasProb
          ? 'Continuous positive-class probability scores are present.'
          : 'ROC-AUC and PR-AUC require continuous probability scores in [0, 1].',
      howToEnable: 'Include a probability score column (e.g., y_probability, confidence) in your CSV.',
      requiredColumns: [mapping.probabilityColumn ?? 'y_probability'],
    },
    {
      id: 'threshold_sweep',
      title: '101-Point Threshold Sensitivity & Sweeping',
      category: 'repair',
      status: isBinary && hasProb ? 'available' : 'unavailable',
      reason:
        isBinary && hasProb
          ? 'Continuous probability scores allow sweeping decision thresholds from 0.00 to 1.00.'
          : 'Threshold sensitivity curves require continuous prediction probabilities.',
      howToEnable: 'Include positive-class prediction probabilities to enable threshold sweeping and cost-benefit trade-offs.',
      requiredColumns: [mapping.probabilityColumn ?? 'y_probability'],
    },
    {
      id: 'probability_calibration',
      title: 'Probability Calibration & Reliability Curve',
      category: 'calibration',
      status: isBinary && hasProb ? 'available' : 'unavailable',
      reason:
        isBinary && hasProb
          ? 'Predicted probabilities can be binned and evaluated against empirical frequencies (Brier score & calibration curves).'
          : 'Calibration curves require continuous predicted probabilities.',
      howToEnable: 'Include prediction probability scores to assess whether model confidence matches empirical accuracy.',
      requiredColumns: [mapping.probabilityColumn ?? 'y_probability'],
    },
    {
      id: 'counterfactual_paradox',
      title: 'Accuracy Paradox Falsification',
      category: 'metrics',
      status: isBinary ? 'available' : 'unsupported',
      reason: isBinary
        ? 'Tests whether aggregate accuracy masks poor minority class recall under class imbalance.'
        : 'Accuracy Paradox evaluation is defined for binary classification.',
      requiredColumns: [mapping.targetColumn ?? 'y_true', mapping.predictionColumn ?? 'y_pred'],
    },
    {
      id: 'slice_evaluation',
      title: 'Subgroup Slice Disparity Analysis',
      category: 'fairness',
      status: isBinary && hasSlices ? 'available' : 'unavailable',
      reason:
        isBinary && hasSlices
          ? `Identified ${mapping.sliceColumns.length} categorical slice column(s): ${mapping.sliceColumns.join(', ')}.`
          : 'No categorical subgroup or metadata slice columns detected in dataset.',
      howToEnable: 'Include metadata columns (e.g. site, device_type, region, demographic) to evaluate performance disparities across sub-populations.',
      requiredColumns: mapping.sliceColumns,
    },
    {
      id: 'feature_leakage',
      title: 'Feature Leakage & Proxy Target Audit',
      category: 'leakage',
      status: mapping.targetColumn && hasFeatures ? 'available' : 'unavailable',
      reason:
        mapping.targetColumn && hasFeatures
          ? `${featureColumns.length} input feature column(s) available for correlation and proxy leakage scanning against ${mapping.targetColumn}.`
          : 'Dataset requires both a target column and input features for correlation scanning.',
      howToEnable: 'Include model input features and a target column in the CSV to test for proxy leakage or target correlation anomalies.',
      requiredColumns: featureColumns.map((f) => f.name),
    },
    {
      id: 'distribution_drift',
      title: 'Distribution Shift & Drift Detection (KS / PSI / Wasserstein)',
      category: 'drift',
      status: hasSlices && hasFeatures ? 'available' : 'unavailable',
      reason:
        hasSlices && hasFeatures
          ? `Can evaluate distribution shift across subgroup partitions: ${mapping.sliceColumns.join(', ')}.`
          : 'Requires a partitioning column (e.g., site, split, environment) and features to compare distributions.',
      howToEnable: 'Include a partition column (e.g., site, batch, environment) and features or provide a reference dataset.',
      requiredColumns: mapping.sliceColumns,
    },
    {
      id: 'data_quality',
      title: 'Data Quality & Hygiene Audit (Missingness, Cardinality, Bounds)',
      category: 'quality',
      status: 'available',
      reason: `${normalizedColumns.length} columns available for structural profiling, missing value audits, and candidate key analysis.`,
      requiredColumns: normalizedColumns.map((c) => c.name),
    },
    {
      id: 'regression_metrics',
      title: 'Continuous Regression Metrics (MAE, MSE, RMSE, R²)',
      category: 'metrics',
      status: taskDetection.taskType === 'regression' && mapping.targetColumn && mapping.predictionColumn ? 'available' : 'unavailable',
      reason:
        taskDetection.taskType === 'regression' && mapping.targetColumn && mapping.predictionColumn
          ? 'Continuous target and prediction columns available for error evaluation.'
          : 'Requires continuous numeric target and prediction columns.',
      howToEnable: 'Map continuous numeric target and prediction columns.',
      requiredColumns: [mapping.targetColumn ?? 'y_true', mapping.predictionColumn ?? 'y_pred'],
    },
    {
      id: 'repair_lab',
      title: 'Deterministic Repair Lab & Decision Cutoff Optimization',
      category: 'repair',
      status: isBinary && hasProb ? 'available' : 'unavailable',
      reason:
        isBinary && hasProb
          ? 'Operating thresholds can be re-optimized deterministically to restore minority recall without retraining.'
          : 'Threshold optimization in the Repair Lab requires continuous prediction probabilities.',
      howToEnable: 'Provide prediction probabilities to evaluate threshold tuning and calculate before/after confusion matrices.',
      requiredColumns: [mapping.probabilityColumn ?? 'y_probability'],
    },
  ];

  const availableCount = items.filter((i) => i.status === 'available').length;
  const unavailableCount = items.filter((i) => i.status === 'unavailable').length;
  const unsupportedCount = items.filter((i) => i.status === 'unsupported').length;

  const candidateTask: CandidateTaskType =
    mapping.targetColumn && mapping.predictionColumn
      ? isBinary
        ? 'binary_classification'
        : 'multiclass_classification'
      : mapping.targetColumn
      ? isBinary
        ? 'binary_classification'
        : 'multiclass_classification'
      : mapping.predictionColumn
      ? 'prediction_audit'
      : 'unsupervised_profiling';

  const manifest = computeDatasetCapabilityManifest({
    modality: 'tabular',
    task: candidateTask,
    rowCount: normalizedColumns.length > 0 ? Math.max(...normalizedColumns.map((c) => c.distinctCount + c.missingCount)) : 100,
    columns: normalizedColumns.map((c) => c.name),
    roles: {
      targetColumn: mapping.targetColumn,
      predictionColumn: mapping.predictionColumn,
      probabilityColumn: mapping.probabilityColumn,
      idColumn: mapping.idColumn,
      timestampColumn: normalizedColumns.find((c) => c.detectedType === 'timestamp')?.name ?? null,
      sliceColumns: [...(mapping.sliceColumns ?? [])],
      featureColumns: featureColumns.map((c) => c.name),
    },
    hasValidProbabilities: hasProb,
    isBinaryLabels: isBinary,
  });

  return {
    taskType: taskDetection.taskType,
    taskTypeExplanation: taskDetection.explanation,
    isSupportedForInvestigation: taskDetection.isSupported,
    unsupportedReason: taskDetection.unsupportedReason,
    items,
    manifest,
    summary: {
      total: items.length,
      availableCount,
      unavailableCount,
      unsupportedCount,
    },
  };
}

/**
 * Infer binary class labels from sample values
 */
export function inferBinaryLabels(sampleValues: readonly string[]): {
  positive: string;
  negative: string;
  candidates: string[];
} | null {
  const unique = Array.from(new Set(sampleValues.filter((v) => v && v.trim()))).slice(0, 10);
  if (unique.length === 0) return null;
  if (unique.length > 2) {
    return {
      positive: unique[0],
      negative: unique[1],
      candidates: unique,
    };
  }
  if (unique.length === 1) {
    const single = unique[0];
    return {
      positive: single,
      negative: single === '1' ? '0' : single === 'true' ? 'false' : `${single}_neg`,
      candidates: [single],
    };
  }

  const [a, b] = unique;
  const positivePatterns = [/^(1|true|yes|positive|pos|malignant|sepsis|fraud|defect|failure|churn|high)$/i];

  if (positivePatterns.some((p) => p.test(a))) {
    return { positive: a, negative: b, candidates: [a, b] };
  }
  if (positivePatterns.some((p) => p.test(b))) {
    return { positive: b, negative: a, candidates: [b, a] };
  }

  // Fallback: second value or minority
  return { positive: a, negative: b, candidates: [a, b] };
}

/**
 * Builds capability report from an already ingested EvaluationDataset
 */
export function getCapabilitiesFromDataset(dataset: EvaluationDataset): DatasetCapabilities {
  const cols = dataset.metadata.columns;
  const targetCol = dataset.metadata.targetColumn ?? null;
  const predCol = dataset.metadata.predictionColumn ?? null;
  const probCol = dataset.metadata.probabilityColumn ?? null;

  const sliceCols = cols.filter(
    (c) => c !== targetCol && c !== predCol && c !== probCol && c !== 'timestamp' && c !== 'id'
  );

  const stats: ColumnSummaryStats[] = cols.map((name) => {
    const isTarget = name === targetCol;
    const isPred = name === predCol;
    const isProb = name === probCol;
    const values = dataset.rows.map((r) =>
      isTarget ? r.actual : isPred ? r.predicted : isProb ? (r.positiveProbability !== null ? String(r.positiveProbability) : '') : r.attributes[name] ?? ''
    );
    const nonMissing = values.filter((v): v is string => v !== '' && v !== null);
    const distinct = new Set(nonMissing).size;
    const isNum = isProb || (!isTarget && !isPred && nonMissing.length > 0 && nonMissing.every((v) => !isNaN(Number(v))));

    return {
      name,
      detectedType: isNum ? 'numeric' : 'categorical',
      sampleValues: Array.from(new Set(nonMissing)).slice(0, 5),
      distinctCount: distinct,
      missingCount: values.length - nonMissing.length,
      isNumeric: isNum,
      min: isProb ? (dataset.rows.length ? Math.min(...dataset.rows.map((r) => r.positiveProbability ?? 1)) : 0) : null,
      max: isProb ? (dataset.rows.length ? Math.max(...dataset.rows.map((r) => r.positiveProbability ?? 0)) : 1) : null,
    };
  });

  const mapping: InferredColumnMapping = {
    targetColumn: targetCol,
    predictionColumn: predCol,
    probabilityColumn: probCol,
    sliceColumns: sliceCols,
    idColumn: null,
  };

  return evaluateCapabilities(stats, mapping);
}

export function evaluateMultiArtifactCapabilities(
  artifacts: readonly import('../domain/artifacts.ts').InvestigationArtifact[],
  baseCapabilities?: DatasetCapabilities
): DatasetCapabilities {
  const items: CapabilityItem[] = baseCapabilities ? [...baseCapabilities.items] : [];

  const trainArtifact = artifacts.find((a) => a.role === 'training');
  const valArtifact = artifacts.find((a) => a.role === 'validation');
  const testArtifact = artifacts.find((a) => a.role === 'evaluation');
  const refArtifact = artifacts.find((a) => a.role === 'reference');
  const prodArtifact = artifacts.find((a) => a.role === 'production');
  const logArtifact = artifacts.find((a) => a.role === 'training_log');
  const tabularArtifacts = artifacts.filter((a) => a.schema && a.schema.columns.length > 0);

  // 1. Training Diagnostics (from training logs)
  if (!items.some((i) => i.id === 'training_diagnostics')) {
    items.push({
      id: 'training_diagnostics',
      title: 'Training & Generalization Curve Diagnostics',
      category: 'training',
      status: logArtifact?.trainingLog?.metricHistory.length ? 'available' : 'missing_evidence',
      reason: logArtifact?.trainingLog?.metricHistory.length
        ? `Training log extracted with ${logArtifact.trainingLog.totalEpochs} epochs across ${logArtifact.trainingLog.framework}.`
        : 'Requires training log (.log / text) containing epoch loss/accuracy histories.',
      howToEnable: 'Upload a training log file (e.g., train.log) from PyTorch, Keras, XGBoost, or Scikit-learn.',
      requiredColumns: [],
    });
  }

  // 2. Split Contamination (train vs validation or test)
  if (!items.some((i) => i.id === 'split_contamination')) {
    const hasSplits = Boolean(trainArtifact && (valArtifact || testArtifact));
    items.push({
      id: 'split_contamination',
      title: 'Train/Test Split Contamination & Leakage Audit',
      category: 'leakage',
      status: hasSplits ? 'available' : 'missing_evidence',
      reason: hasSplits
        ? `Both Training ("${trainArtifact?.name}") and Test/Val splits available for cross-split duplicate checks.`
        : 'Requires both Training and Validation/Test datasets to detect contamination and leakage.',
      howToEnable: 'Upload both training (train.csv) and validation/test (val.csv) datasets.',
      requiredColumns: [],
    });
  }

  // 3. Distribution Shift / Split Drift (ref vs prod)
  if (!items.some((i) => i.id === 'split_drift')) {
    const hasRefProd = Boolean(refArtifact && prodArtifact);
    items.push({
      id: 'split_drift',
      title: 'Reference vs Production Feature Drift (KS / PSI / Wasserstein)',
      category: 'drift',
      status: hasRefProd ? 'available' : 'missing_evidence',
      reason: hasRefProd
        ? `Reference ("${refArtifact?.name}") and Production ("${prodArtifact?.name}") datasets available for baseline drift auditing.`
        : 'Requires baseline Reference and Production datasets to quantify real-world drift.',
      howToEnable: 'Upload baseline reference features (reference.csv) and production inference data (production.csv).',
      requiredColumns: [],
    });
  }

  // 4. Data Quality Audit
  if (!items.some((i) => i.id === 'data_quality')) {
    items.push({
      id: 'data_quality',
      title: 'Data Quality & Distribution Health Audit',
      category: 'quality',
      status: tabularArtifacts.length > 0 ? 'available' : 'missing_evidence',
      reason: tabularArtifacts.length > 0
        ? `${tabularArtifacts.length} tabular artifact(s) available for missingness, outlier, and duplicate analysis.`
        : 'Requires at least one tabular CSV/TSV/JSON dataset.',
      howToEnable: 'Upload at least one tabular ML dataset.',
      requiredColumns: [],
    });
  }

  // Recalculate summary counts
  const availableCount = items.filter((i) => i.status === 'available').length;
  const unavailableCount = items.filter((i) => i.status === 'unavailable' || i.status === 'missing_evidence').length;
  const unsupportedCount = items.filter((i) => i.status === 'unsupported').length;

  return {
    taskType: baseCapabilities?.taskType ?? 'binary_classification',
    taskTypeExplanation: baseCapabilities?.taskTypeExplanation ?? 'Multi-artifact investigation workspace.',
    isSupportedForInvestigation: baseCapabilities?.isSupportedForInvestigation ?? true,
    unsupportedReason: baseCapabilities?.unsupportedReason,
    items,
    summary: {
      total: items.length,
      availableCount,
      unavailableCount,
      unsupportedCount,
    },
  };
}

