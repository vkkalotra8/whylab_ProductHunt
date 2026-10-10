import type { EvaluationDataset } from './evaluation-ingestion.ts';

export type TaskType =
  | 'binary_classification'
  | 'multiclass_classification'
  | 'regression'
  | 'raw_features_no_predictions'
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
}

/**
 * Heuristics for auto-detecting likely column mappings
 */
export function inferColumnMapping(
  columns: readonly string[],
  columnStats?: readonly ColumnSummaryStats[]
): InferredColumnMapping {
  const statsMap = new Map(columnStats?.map((s) => [s.name, s]) ?? []);

  let targetColumn: string | null = null;
  let predictionColumn: string | null = null;
  let probabilityColumn: string | null = null;
  let idColumn: string | null = null;
  const sliceColumns: string[] = [];

  // Patterns
  const targetPatterns = [/^(y_true|actual|target|label|ground_truth|truth|class)$/i, /target/i, /label/i, /actual/i];
  const predPatterns = [/^(y_pred|predicted|prediction|pred|y_hat|model_output)$/i, /pred/i, /prediction/i];
  const probPatterns = [/^(y_probability|y_prob|probability|prob|score|pos_score|confidence)$/i, /prob/i, /score/i];
  const idPatterns = [/^(id|record_id|sample_id|patient_id|uuid|index)$/i];
  const slicePatterns = [/^(site|hospital|center|facility|region|country|device|slice|group|gender|sex|age_group|split)$/i];

  for (const pattern of targetPatterns) {
    const match = columns.find((c) => pattern.test(c));
    if (match) {
      targetColumn = match;
      break;
    }
  }

  for (const pattern of predPatterns) {
    const match = columns.find((c) => c !== targetColumn && pattern.test(c));
    if (match) {
      predictionColumn = match;
      break;
    }
  }

  for (const pattern of probPatterns) {
    const match = columns.find((c) => c !== targetColumn && c !== predictionColumn && pattern.test(c));
    if (match) {
      // If we have stats, verify it's numeric in [0, 1]
      const stats = statsMap.get(match);
      if (!stats || (stats.isNumeric && stats.min !== null && stats.min! >= -0.01 && stats.max !== null && stats.max! <= 1.01)) {
        probabilityColumn = match;
        break;
      }
    }
  }

  for (const pattern of idPatterns) {
    const match = columns.find((c) => c !== targetColumn && c !== predictionColumn && c !== probabilityColumn && pattern.test(c));
    if (match) {
      idColumn = match;
      break;
    }
  }

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
  if (!targetStats) {
    return {
      taskType: 'unknown',
      explanation: 'Ground-truth target column is missing or unspecified.',
      isSupported: false,
      unsupportedReason: 'A ground-truth target column is required to evaluate model reliability.',
    };
  }

  if (!predStats) {
    return {
      taskType: 'raw_features_no_predictions',
      explanation: 'Dataset contains target labels and features, but no model predictions were mapped.',
      isSupported: false,
      unsupportedReason:
        'WhyLab investigates model reliability and requires model predictions (y_pred or probability scores) alongside ground-truth labels. WhyLab does not silently train models.',
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
  columns: readonly ColumnSummaryStats[],
  mapping: InferredColumnMapping
): DatasetCapabilities {
  const statsMap = new Map(columns.map((c) => [c.name, c]));
  const targetStats = mapping.targetColumn ? statsMap.get(mapping.targetColumn) : undefined;
  const predStats = mapping.predictionColumn ? statsMap.get(mapping.predictionColumn) : undefined;
  const probStats = mapping.probabilityColumn ? statsMap.get(mapping.probabilityColumn) : undefined;

  const taskDetection = detectTaskType(targetStats, predStats);
  const isBinary = taskDetection.taskType === 'binary_classification';
  const hasProb = Boolean(probStats && probStats.isNumeric);
  const hasSlices = mapping.sliceColumns.length > 0;
  const featureColumns = columns.filter(
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
      status: isBinary && mapping.targetColumn && mapping.predictionColumn ? 'available' : 'unsupported',
      reason:
        isBinary && mapping.targetColumn && mapping.predictionColumn
          ? 'Ground-truth and model prediction columns are mapped.'
          : taskDetection.unsupportedReason ?? 'Requires binary target and prediction columns.',
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
      status: isBinary && hasFeatures ? 'available' : 'unavailable',
      reason:
        isBinary && hasFeatures
          ? `${featureColumns.length} input feature column(s) available for correlation and proxy leakage scanning.`
          : 'Dataset only contains labels and predictions without input features.',
      howToEnable: 'Include model input features in the CSV to test for proxy leakage or target correlation anomalies.',
      requiredColumns: featureColumns.map((f) => f.name),
    },
    {
      id: 'distribution_drift',
      title: 'Distribution Shift & Drift Detection (KS / PSI / Wasserstein)',
      category: 'drift',
      status: isBinary && hasSlices ? 'available' : 'unavailable',
      reason:
        isBinary && hasSlices
          ? `Can evaluate distribution shift across subgroup partitions: ${mapping.sliceColumns.join(', ')}.`
          : 'Requires a partitioning column (e.g., site, split, environment) or a reference baseline to compare distributions.',
      howToEnable: 'Include a partition column (e.g., site, batch, environment) or provide a reference dataset.',
      requiredColumns: mapping.sliceColumns,
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

  return {
    taskType: taskDetection.taskType,
    taskTypeExplanation: taskDetection.explanation,
    isSupportedForInvestigation: taskDetection.isSupported,
    unsupportedReason: taskDetection.unsupportedReason,
    items,
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
  const targetCol = dataset.metadata.targetColumn ?? 'y_true';
  const predCol = dataset.metadata.predictionColumn ?? 'y_pred';
  const probCol = dataset.metadata.probabilityColumn;

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
    const nonMissing = values.filter((v) => v !== '' && v !== null);
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
    probabilityColumn: probCol ?? null,
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

