/**
 * Universal Dataset Intelligence & Capability Contracts.
 * Defines typed manifests, column role classifications, and
 * tool prerequisite declarations for adaptive multi-modal investigations.
 */

export type DatasetFormat =
  | 'csv'
  | 'tsv'
  | 'json'
  | 'jsonl'
  | 'parquet'
  | 'archive'
  | 'zip'
  | 'unknown';

export type DatasetModality = 'tabular' | 'llm' | 'vision' | 'llm_rag' | 'computer_vision';

export type DatasetPurpose =
  | 'evaluation'
  | 'training'
  | 'validation'
  | 'production'
  | 'reference'
  | 'exploration'
  | 'supervised_evaluation'
  | 'labeled_unpredicted'
  | 'prediction_only'
  | 'unlabeled_features';

export type CandidateTaskType =
  | 'binary_classification'
  | 'multiclass_classification'
  | 'regression'
  | 'unsupervised_profiling'
  | 'prediction_audit'
  | 'raw_features_no_predictions'
  | 'data_profiling'
  | 'threshold_optimization'
  | 'rag_evaluation'
  | 'rag_hallucination_audit'
  | 'retrieval_benchmarking'
  | 'vision_classification'
  | 'visual_defect_detection'
  | 'image_quality_audit'
  | 'unknown';

export interface DatasetColumnRoles {
  targetColumn: string | null;
  predictionColumn: string | null;
  probabilityColumn: string | null;
  idColumn: string | null;
  timestampColumn: string | null;
  sliceColumns: string[];
  featureColumns: string[];
}

export type RequiredFieldKey =
  | 'target'
  | 'prediction'
  | 'probability'
  | 'features'
  | 'slices'
  | 'referenceDataset'
  | 'images'
  | 'prompts';

export interface CapabilityEvaluationContext {
  datasetId?: string;
  sourceName?: string;
  modality?: DatasetModality;
  task?: CandidateTaskType;
  purpose?: DatasetPurpose;
  format?: DatasetFormat;
  rowCount: number;
  columns: readonly string[];
  roles: DatasetColumnRoles | (Partial<DatasetColumnRoles> & {
    target?: string | null;
    prediction?: string | null;
    probability?: string | null;
    id?: string | null;
    timestamp?: string | null;
    slices?: string[];
    features?: string[];
    textFields?: string[];
    imageFields?: string[];
  });
  hasReferenceDataset?: boolean;
  hasModelArtifacts?: boolean;
  isBinaryLabels?: boolean;
  hasValidProbabilities?: boolean;
  numericRanges?: Record<string, { min: number; max: number }>;
}

export interface NormalizedCapabilityContext {
  datasetId?: string;
  sourceName?: string;
  modality: DatasetModality;
  task: CandidateTaskType;
  purpose?: DatasetPurpose;
  format?: DatasetFormat;
  rowCount: number;
  columns: readonly string[];
  roles: DatasetColumnRoles;
  hasReferenceDataset?: boolean;
  hasModelArtifacts?: boolean;
  isBinaryLabels?: boolean;
  hasValidProbabilities?: boolean;
  numericRanges?: Record<string, { min: number; max: number }>;
}

export interface ToolPrerequisiteDeclaration {
  tool: string;
  displayName: string;
  category: 'profiling' | 'quality' | 'metrics' | 'calibration' | 'drift' | 'leakage' | 'fairness' | 'repair' | 'llm' | 'vision';
  description: string;
  supportedModalities: DatasetModality[];
  supportedTaskTypes: CandidateTaskType[];
  requiredFields: RequiredFieldKey[];
  optionalFields: RequiredFieldKey[];
  minimumRows: number;
  checkPrerequisites: (context: NormalizedCapabilityContext) => {
    satisfied: boolean;
    reason: string;
    missingPrerequisites?: string[];
    validationErrors?: string[];
    howToEnable?: string;
  };
}

export interface AvailableToolCapability {
  tool: string;
  toolId?: string;
  displayName: string;
  category: string;
  reason: string;
}

export interface UnavailableToolCapability {
  tool: string;
  toolId?: string;
  displayName: string;
  category: string;
  reason: string;
  status?: 'missing_prerequisites' | 'unsupported_modality' | 'validation_failed';
  missingPrerequisites: string[];
  missingRequirements?: string[];
  howToEnable?: string;
  validationErrors?: string[];
}

export interface DatasetCapabilityManifest {
  schemaVersion: 1;
  format: DatasetFormat;
  modality: DatasetModality;
  purpose: DatasetPurpose;
  task: CandidateTaskType;
  candidateTasks: CandidateTaskType[];
  taskExplanation: string;
  isSupportedForInvestigation: boolean;
  unsupportedReason?: string;
  columns: {
    total: number;
    target: string | null;
    prediction: string | null;
    probability: string | null;
    id: string | null;
    timestamp: string | null;
    slices: string[];
    features: string[];
  };
  rowCount: number;
  columnCount?: number;
  hasReferenceDataset: boolean;
  hasModelArtifacts: boolean;
  available: AvailableToolCapability[];
  unavailable: UnavailableToolCapability[];
  summary: {
    totalTools: number;
    availableCount: number;
    unavailableCount: number;
  };
}

/**
 * Master Registry of Tool Prerequisite Declarations.
 * Each tool formally declares its requirements across modalities, data roles, and sample floors.
 */
export const TOOL_PREREQUISITES: readonly ToolPrerequisiteDeclaration[] = [
  // ── Tabular Profiling & Data Quality Tools (Available without predictions) ──
  {
    tool: 'profile_dataset',
    displayName: 'Dataset Profiling & Schema Summary',
    category: 'profiling',
    description: 'Profiles numerical distributions, categorical frequencies, missingness, and cardinality.',
    supportedModalities: ['tabular'],
    supportedTaskTypes: [
      'binary_classification',
      'multiclass_classification',
      'regression',
      'unsupervised_profiling',
      'prediction_audit',
      'unknown',
    ],
    requiredFields: [],
    optionalFields: ['target', 'prediction', 'probability', 'features', 'slices'],
    minimumRows: 1,
    checkPrerequisites: (ctx) => {
      if (ctx.rowCount < 1) {
        return {
          satisfied: false,
          reason: 'Dataset must contain at least 1 record for profiling.',
          missingPrerequisites: ['nonempty_data'],
          howToEnable: 'Upload a dataset with at least 1 row of data.',
        };
      }
      return {
        satisfied: true,
        reason: `${ctx.rowCount.toLocaleString()} rows and ${ctx.columns.length} columns available for structural profiling.`,
      };
    },
  },
  {
    tool: 'missingness_analysis',
    displayName: 'Missing Value & Sparsity Analysis',
    category: 'quality',
    description: 'Calculates missingness rates per column, identifies missing-completely-at-random (MCAR) patterns, and flags completely empty attributes.',
    supportedModalities: ['tabular'],
    supportedTaskTypes: [
      'binary_classification',
      'multiclass_classification',
      'regression',
      'unsupervised_profiling',
      'prediction_audit',
      'unknown',
    ],
    requiredFields: [],
    optionalFields: ['features', 'target'],
    minimumRows: 1,
    checkPrerequisites: (ctx) => {
      if (ctx.rowCount < 1) {
        return {
          satisfied: false,
          reason: 'Missingness analysis requires at least 1 row.',
          missingPrerequisites: ['nonempty_data'],
        };
      }
      return {
        satisfied: true,
        reason: 'Sparsity and null distribution can be evaluated across all columns.',
      };
    },
  },
  {
    tool: 'duplicate_detection',
    displayName: 'Exact & Key Duplicate Detection',
    category: 'quality',
    description: 'Identifies identical duplicate records and repeated identifier keys across the dataset.',
    supportedModalities: ['tabular'],
    supportedTaskTypes: [
      'binary_classification',
      'multiclass_classification',
      'regression',
      'unsupervised_profiling',
      'prediction_audit',
      'unknown',
    ],
    requiredFields: [],
    optionalFields: [],
    minimumRows: 2,
    checkPrerequisites: (ctx) => {
      if (ctx.rowCount < 2) {
        return {
          satisfied: false,
          reason: 'Duplicate detection requires at least 2 rows.',
          missingPrerequisites: ['minimum_rows_2'],
        };
      }
      return {
        satisfied: true,
        reason: 'Duplicate detection active across all dataset rows.',
      };
    },
  },
  {
    tool: 'target_distribution',
    displayName: 'Target Class / Outcome Distribution Analysis',
    category: 'profiling',
    description: 'Quantifies class balance, prevalence, and label dispersion for confirmed ground truth targets.',
    supportedModalities: ['tabular'],
    supportedTaskTypes: ['binary_classification', 'multiclass_classification', 'regression'],
    requiredFields: ['target'],
    optionalFields: [],
    minimumRows: 2,
    checkPrerequisites: (ctx) => {
      if (!ctx.roles.targetColumn) {
        return {
          satisfied: false,
          reason: 'No confirmed target label column mapped.',
          missingPrerequisites: ['target_column'],
          howToEnable: 'Confirm or select your ground-truth target column in Column Mapping.',
        };
      }
      return {
        satisfied: true,
        reason: `Confirmed target column "${ctx.roles.targetColumn}" is available for outcome distribution analysis.`,
      };
    },
  },
  {
    tool: 'feature_target_association',
    displayName: 'Feature-Target Association & Correlation Screening',
    category: 'profiling',
    description: 'Evaluates statistical association (Cramer\'s V, Pearson r, Mutual Information) between input features and target labels without implying causality.',
    supportedModalities: ['tabular'],
    supportedTaskTypes: ['binary_classification', 'multiclass_classification', 'regression'],
    requiredFields: ['target', 'features'],
    optionalFields: [],
    minimumRows: 5,
    checkPrerequisites: (ctx) => {
      if (!ctx.roles.targetColumn) {
        return {
          satisfied: false,
          reason: 'Requires a confirmed ground-truth target column.',
          missingPrerequisites: ['target_column'],
          howToEnable: 'Map your target column in the column mapping step.',
        };
      }
      if (ctx.roles.featureColumns.length === 0) {
        return {
          satisfied: false,
          reason: 'No input feature columns detected alongside the target column.',
          missingPrerequisites: ['feature_columns'],
          howToEnable: 'Include at least one independent input feature in your dataset.',
        };
      }
      if (ctx.rowCount < 5) {
        return {
          satisfied: false,
          reason: 'Requires at least 5 rows for statistical correlation screening.',
          missingPrerequisites: ['sample_size_floor'],
        };
      }
      return {
        satisfied: true,
        reason: `Target "${ctx.roles.targetColumn}" and ${ctx.roles.featureColumns.length} feature(s) available for association screening.`,
      };
    },
  },
  {
    tool: 'scan_feature_leakage',
    displayName: 'Feature Leakage & Proxy Target Audit',
    category: 'leakage',
    description: 'Detects suspicious near-perfect correlation (>= 0.999), post-hoc timestamps, or identifier proxies.',
    supportedModalities: ['tabular'],
    supportedTaskTypes: ['binary_classification', 'multiclass_classification', 'regression'],
    requiredFields: ['target', 'features'],
    optionalFields: [],
    minimumRows: 10,
    checkPrerequisites: (ctx) => {
      if (!ctx.roles.targetColumn) {
        return {
          satisfied: false,
          reason: 'Feature leakage scanning requires a target column to detect proxy correlations.',
          missingPrerequisites: ['target_column'],
          howToEnable: 'Select a target column to screen features against.',
        };
      }
      if (ctx.roles.featureColumns.length === 0) {
        return {
          satisfied: false,
          reason: 'No input feature columns available for leakage screening.',
          missingPrerequisites: ['feature_columns'],
          howToEnable: 'Include input features in your dataset.',
        };
      }
      return {
        satisfied: true,
        reason: `${ctx.roles.featureColumns.length} feature column(s) available to screen against target "${ctx.roles.targetColumn}".`,
      };
    },
  },
  {
    tool: 'run_drift_tests',
    displayName: 'Distribution Shift & Drift Detection (KS / PSI / Wasserstein)',
    category: 'drift',
    description: 'Detects covariate shift across metadata partitions (e.g., site, device) or against a reference baseline.',
    supportedModalities: ['tabular'],
    supportedTaskTypes: [
      'binary_classification',
      'multiclass_classification',
      'regression',
      'unsupervised_profiling',
      'prediction_audit',
      'unknown',
    ],
    requiredFields: [],
    optionalFields: ['slices', 'referenceDataset'],
    minimumRows: 10,
    checkPrerequisites: (ctx) => {
      const hasSlices = ctx.roles.sliceColumns.length > 0;
      const hasRef = Boolean(ctx.hasReferenceDataset);
      if (!hasSlices && !hasRef) {
        return {
          satisfied: false,
          reason: 'Distribution drift requires categorical slice partitions (e.g., site, split) or a separate reference dataset.',
          missingPrerequisites: ['slice_columns_or_reference_dataset'],
          howToEnable: 'Map a slice column (e.g. site, facility, environment) or upload a reference baseline artifact.',
        };
      }
      return {
        satisfied: true,
        reason: hasSlices
          ? `Detected ${ctx.roles.sliceColumns.length} slice column(s): [${ctx.roles.sliceColumns.join(', ')}].`
          : 'Reference baseline dataset available for cross-dataset shift testing.',
      };
    },
  },

  // ── Supervised Model Evaluation Tools (Require Model Predictions) ──
  {
    tool: 'compute_classification_metrics',
    displayName: 'Classification Performance Metrics (Accuracy, Recall, Precision, F1)',
    category: 'metrics',
    description: 'Computes confusion matrix, false omission rates, balanced accuracy, and F1 scores.',
    supportedModalities: ['tabular'],
    supportedTaskTypes: ['binary_classification', 'multiclass_classification'],
    requiredFields: ['target', 'prediction'],
    optionalFields: [],
    minimumRows: 2,
    checkPrerequisites: (ctx) => {
      if (!ctx.roles.targetColumn) {
        return {
          satisfied: false,
          reason: 'Requires a ground-truth target label column.',
          missingPrerequisites: ['target_column'],
          howToEnable: 'Map your actual ground-truth label column.',
        };
      }
      if (!ctx.roles.predictionColumn) {
        return {
          satisfied: false,
          reason: 'No model prediction column mapped. Classification metrics cannot be computed without model outputs.',
          missingPrerequisites: ['prediction_column'],
          howToEnable: 'Map your predicted label column (y_pred, prediction) or upload model inference outputs.',
        };
      }
      return {
        satisfied: true,
        reason: `Target "${ctx.roles.targetColumn}" and predictions "${ctx.roles.predictionColumn}" mapped.`,
      };
    },
  },
  {
    tool: 'threshold_sweep',
    displayName: '101-Point Threshold Sensitivity & Sweeping',
    category: 'repair',
    description: 'Sweeps continuous cutoffs from 0.00 to 1.00 to evaluate sensitivity, specificity, and cost-benefit trade-offs.',
    supportedModalities: ['tabular'],
    supportedTaskTypes: ['binary_classification'],
    requiredFields: ['target', 'probability'],
    optionalFields: [],
    minimumRows: 5,
    checkPrerequisites: (ctx) => {
      if (!ctx.roles.targetColumn) {
        return {
          satisfied: false,
          reason: 'Requires ground-truth target column to construct confusion matrices across cutoffs.',
          missingPrerequisites: ['target_column'],
        };
      }
      if (!ctx.roles.probabilityColumn) {
        return {
          satisfied: false,
          reason: 'Threshold sweeping requires continuous prediction probabilities.',
          missingPrerequisites: ['probability_column'],
          howToEnable: 'Map a continuous positive-class probability column (e.g., y_probability, confidence in [0, 1]).',
        };
      }
      if (ctx.hasValidProbabilities === false) {
        return {
          satisfied: false,
          reason: `Column "${ctx.roles.probabilityColumn}" contains invalid values outside [0.0, 1.0] (e.g., logits or percentages).`,
          missingPrerequisites: ['calibrated_probability_range'],
          validationErrors: ['Probabilities must be finite decimals in [0.0, 1.0].'],
          howToEnable: 'Normalize confidence scores to decimal range [0.0, 1.0].',
        };
      }
      return {
        satisfied: true,
        reason: `Continuous probabilities in "${ctx.roles.probabilityColumn}" allow sweeping cutoffs from 0.00 to 1.00.`,
      };
    },
  },
  {
    tool: 'check_calibration',
    displayName: 'Probability Calibration & Brier Reliability Score',
    category: 'calibration',
    description: 'Assesses whether confidence scores reflect empirical accuracy across binned probability deciles.',
    supportedModalities: ['tabular'],
    supportedTaskTypes: ['binary_classification'],
    requiredFields: ['target', 'probability'],
    optionalFields: [],
    minimumRows: 10,
    checkPrerequisites: (ctx) => {
      if (!ctx.roles.targetColumn || !ctx.roles.probabilityColumn) {
        return {
          satisfied: false,
          reason: 'Probability calibration requires both target labels and continuous probability scores.',
          missingPrerequisites: ['target_column', 'probability_column'],
          howToEnable: 'Map ground-truth target and predicted probability columns.',
        };
      }
      if (ctx.hasValidProbabilities === false) {
        return {
          satisfied: false,
          reason: `Values in "${ctx.roles.probabilityColumn}" are outside [0.0, 1.0].`,
          missingPrerequisites: ['calibrated_probability_range'],
          validationErrors: ['Probabilities must be decimals in [0.0, 1.0].'],
        };
      }
      if (ctx.rowCount < 10) {
        return {
          satisfied: false,
          reason: 'Calibration curves require at least 10 rows for meaningful binning.',
          missingPrerequisites: ['sample_size_floor_10'],
        };
      }
      return {
        satisfied: true,
        reason: 'Continuous probabilities and target labels enable empirical calibration analysis.',
      };
    },
  },
  {
    tool: 'slice_evaluation',
    displayName: 'Subgroup Slice Performance Disparity Analysis',
    category: 'fairness',
    description: 'Evaluates classification metrics separated by categorical slice columns (e.g. site, age group, device).',
    supportedModalities: ['tabular'],
    supportedTaskTypes: ['binary_classification', 'multiclass_classification'],
    requiredFields: ['target', 'prediction', 'slices'],
    optionalFields: [],
    minimumRows: 10,
    checkPrerequisites: (ctx) => {
      if (!ctx.roles.targetColumn || !ctx.roles.predictionColumn) {
        return {
          satisfied: false,
          reason: 'Slice performance disparity requires both target labels and model predictions.',
          missingPrerequisites: ['target_column', 'prediction_column'],
          howToEnable: 'Map target and prediction columns.',
        };
      }
      if (ctx.roles.sliceColumns.length === 0) {
        return {
          satisfied: false,
          reason: 'No categorical slice columns detected in dataset.',
          missingPrerequisites: ['slice_columns'],
          howToEnable: 'Map categorical metadata (e.g., site, region, group) in Column Mapping.',
        };
      }
      return {
        satisfied: true,
        reason: `Evaluating performance across ${ctx.roles.sliceColumns.length} slice column(s).`,
      };
    },
  },
  {
    tool: 'run_counterfactual_test',
    displayName: 'Accuracy Paradox Falsification',
    category: 'metrics',
    description: 'Tests whether high overall accuracy conceals severe minority omission under class imbalance.',
    supportedModalities: ['tabular'],
    supportedTaskTypes: ['binary_classification'],
    requiredFields: ['target', 'prediction'],
    optionalFields: ['probability'],
    minimumRows: 10,
    checkPrerequisites: (ctx) => {
      if (!ctx.roles.targetColumn || !ctx.roles.predictionColumn) {
        return {
          satisfied: false,
          reason: 'Accuracy paradox testing requires target labels and model predictions.',
          missingPrerequisites: ['target_column', 'prediction_column'],
        };
      }
      return {
        satisfied: true,
        reason: 'Binary classification evaluation enabled for Accuracy Paradox falsification.',
      };
    },
  },
  {
    tool: 'generate_repair_candidate',
    displayName: 'Deterministic Repair Lab Policy Optimization',
    category: 'repair',
    description: 'Optimizes decision cutoffs under target recall or domain cost matrix constraints.',
    supportedModalities: ['tabular'],
    supportedTaskTypes: ['binary_classification'],
    requiredFields: ['target', 'probability'],
    optionalFields: [],
    minimumRows: 10,
    checkPrerequisites: (ctx) => {
      if (!ctx.roles.targetColumn || !ctx.roles.probabilityColumn) {
        return {
          satisfied: false,
          reason: 'Decision cutoff repair requires target labels and continuous prediction probabilities.',
          missingPrerequisites: ['target_column', 'probability_column'],
          howToEnable: 'Provide prediction probabilities to tune decision thresholds in the Repair Lab.',
        };
      }
      return {
        satisfied: true,
        reason: 'Continuous probabilities allow deterministic cutoff optimization.',
      };
    },
  },
  {
    tool: 're_evaluate_repair',
    displayName: 'Repair Verification & Before-vs-After Comparison',
    category: 'repair',
    description: 'Re-evaluates proposed repair policies against baseline performance on identical rows.',
    supportedModalities: ['tabular'],
    supportedTaskTypes: ['binary_classification'],
    requiredFields: ['target', 'probability'],
    optionalFields: [],
    minimumRows: 10,
    checkPrerequisites: (ctx) => {
      if (!ctx.roles.targetColumn || !ctx.roles.probabilityColumn) {
        return {
          satisfied: false,
          reason: 'Repair re-evaluation requires target labels and prediction probabilities.',
          missingPrerequisites: ['target_column', 'probability_column'],
        };
      }
      return {
        satisfied: true,
        reason: 'Evaluation rows ready for comparative verification.',
      };
    },
  },

  // ── Multi-Modal LLM & RAG Diagnostics ──
  {
    tool: 'evaluate_text_metrics',
    displayName: 'Deterministic NLP Metrics (Exact Match & Token F1)',
    category: 'llm',
    description: 'Evaluates exact match accuracy and harmonic mean token overlap between model responses and references.',
    supportedModalities: ['llm'],
    supportedTaskTypes: ['rag_evaluation'],
    requiredFields: ['prompts'],
    optionalFields: [],
    minimumRows: 1,
    checkPrerequisites: (ctx) => {
      if (ctx.modality !== 'llm') {
        return {
          satisfied: false,
          reason: 'Tool is designed for LLM text prompt/response evaluation.',
          missingPrerequisites: ['llm_modality'],
        };
      }
      return { satisfied: true, reason: 'LLM prompt records available for text metric calculation.' };
    },
  },
  {
    tool: 'evaluate_retrieval_metrics',
    displayName: 'RAG Retrieval Ranking Metrics (MRR & Recall@k)',
    category: 'llm',
    description: 'Calculates Mean Reciprocal Rank and Recall across top-k retrieved knowledge passages.',
    supportedModalities: ['llm'],
    supportedTaskTypes: ['rag_evaluation'],
    requiredFields: ['prompts'],
    optionalFields: [],
    minimumRows: 1,
    checkPrerequisites: (ctx) => {
      if (ctx.modality !== 'llm') {
        return { satisfied: false, reason: 'Requires LLM/RAG evaluation records with retrieved contexts.', missingPrerequisites: ['llm_modality'] };
      }
      return { satisfied: true, reason: 'Retrieval contexts and relevant doc IDs available.' };
    },
  },
  {
    tool: 'evaluate_rag_attribution',
    displayName: 'RAG Context Attribution & Hallucination Screening',
    category: 'llm',
    description: 'Validates citation identifiers, sentence-level attribution, and flags ungrounded claims.',
    supportedModalities: ['llm'],
    supportedTaskTypes: ['rag_evaluation'],
    requiredFields: ['prompts'],
    optionalFields: [],
    minimumRows: 1,
    checkPrerequisites: (ctx) => {
      if (ctx.modality !== 'llm') {
        return { satisfied: false, reason: 'Requires LLM prompt and response records with context citations.', missingPrerequisites: ['llm_modality'] };
      }
      return { satisfied: true, reason: 'Attribution checker ready to analyze citations.' };
    },
  },

  // ── Multi-Modal Computer Vision Diagnostics ──
  {
    tool: 'audit_image_quality',
    displayName: 'Image Quality & Laplacian Sharpness Floor',
    category: 'vision',
    description: 'Calculates Laplacian blur variance, contrast, brightness, and exposure clipping.',
    supportedModalities: ['vision'],
    supportedTaskTypes: ['vision_classification'],
    requiredFields: ['images'],
    optionalFields: [],
    minimumRows: 1,
    checkPrerequisites: (ctx) => {
      if (ctx.modality !== 'vision') {
        return { satisfied: false, reason: 'Requires Computer Vision image archive.', missingPrerequisites: ['vision_modality'] };
      }
      return { satisfied: true, reason: 'Image assets available for pixel-level quality diagnostics.' };
    },
  },
  {
    tool: 'detect_exact_duplicates',
    displayName: 'Cryptographic SHA-256 Duplicate & Cross-Split Leakage',
    category: 'vision',
    description: 'Finds identical image clusters and detects train/test contamination.',
    supportedModalities: ['vision'],
    supportedTaskTypes: ['vision_classification'],
    requiredFields: ['images'],
    optionalFields: [],
    minimumRows: 2,
    checkPrerequisites: (ctx) => {
      if (ctx.modality !== 'vision') {
        return { satisfied: false, reason: 'Requires Computer Vision image archive.', missingPrerequisites: ['vision_modality'] };
      }
      return { satisfied: true, reason: 'Image archive available for duplicate clustering.' };
    },
  },
  {
    tool: 'detect_perceptual_leakage',
    displayName: 'Perceptual dHash Leakage & Near-Duplicate Auditing',
    category: 'vision',
    description: 'Discovers resized, recompressed, or augmented copies leaking across splits.',
    supportedModalities: ['vision'],
    supportedTaskTypes: ['vision_classification'],
    requiredFields: ['images'],
    optionalFields: [],
    minimumRows: 2,
    checkPrerequisites: (ctx) => {
      if (ctx.modality !== 'vision') {
        return { satisfied: false, reason: 'Requires Computer Vision image archive.', missingPrerequisites: ['vision_modality'] };
      }
      return { satisfied: true, reason: 'Perceptual dHash analyzer ready.' };
    },
  },
];

/**
 * Computes a comprehensive DatasetCapabilityManifest for any uploaded dataset.
 */
export function computeDatasetCapabilityManifest(
  context: CapabilityEvaluationContext,
  format: DatasetFormat = 'csv',
  purpose: DatasetPurpose = 'evaluation'
): DatasetCapabilityManifest {
  // 1. Normalize modality
  let modality: DatasetModality = context.modality ?? 'tabular';
  if (modality === 'llm_rag') modality = 'llm';
  if (modality === 'computer_vision') modality = 'vision';
  if (!context.modality) {
    if (context.format === 'zip' || (context.roles as any)?.imageFields?.length > 0) {
      modality = 'vision';
    } else if (
      (context.roles as any)?.textFields?.length > 0 ||
      context.columns.some((c) => /^(prompt|response|query|context|retrieved_context)$/i.test(c))
    ) {
      modality = 'llm';
    }
  }

  // 2. Normalize roles
  const roles: DatasetColumnRoles = {
    targetColumn: context.roles?.targetColumn ?? (context.roles as any)?.target ?? null,
    predictionColumn: context.roles?.predictionColumn ?? (context.roles as any)?.prediction ?? null,
    probabilityColumn: context.roles?.probabilityColumn ?? (context.roles as any)?.probability ?? null,
    idColumn: context.roles?.idColumn ?? (context.roles as any)?.id ?? null,
    timestampColumn: context.roles?.timestampColumn ?? null,
    sliceColumns: Array.isArray(context.roles?.sliceColumns)
      ? [...context.roles.sliceColumns]
      : Array.isArray((context.roles as any)?.slices)
      ? [...(context.roles as any).slices]
      : [],
    featureColumns: Array.isArray(context.roles?.featureColumns)
      ? [...context.roles.featureColumns]
      : Array.isArray((context.roles as any)?.features)
      ? [...(context.roles as any).features]
      : [],
  };

  // 3. Normalize format
  const normFormat: DatasetFormat = context.format ?? format ?? 'csv';

  // 4. Normalize purpose
  let computedPurpose: DatasetPurpose = purpose !== 'evaluation' ? purpose : (context.purpose ?? 'evaluation');
  if (computedPurpose === 'evaluation') {
    if (modality === 'tabular') {
      if (roles.targetColumn && roles.predictionColumn) {
        computedPurpose = 'supervised_evaluation';
      } else if (roles.targetColumn && !roles.predictionColumn) {
        computedPurpose = 'labeled_unpredicted';
      } else if (!roles.targetColumn && roles.predictionColumn) {
        computedPurpose = 'prediction_only';
      } else {
        computedPurpose = 'unlabeled_features';
      }
    }
  }

  // 5. Normalize task
  let computedTask: CandidateTaskType = context.task ?? 'binary_classification';
  if (!context.task) {
    if (modality === 'tabular') {
      if (roles.targetColumn && roles.predictionColumn) {
        computedTask = 'binary_classification';
      } else if (roles.targetColumn && !roles.predictionColumn) {
        computedTask = 'raw_features_no_predictions';
      } else if (!roles.targetColumn && roles.predictionColumn) {
        computedTask = 'prediction_audit';
      } else {
        computedTask = 'unsupervised_profiling';
      }
    } else if (modality === 'llm') {
      computedTask = 'rag_evaluation';
    } else if (modality === 'vision') {
      computedTask = 'vision_classification';
    }
  }

  // 6. Candidate tasks
  const candidateTasks: CandidateTaskType[] = [];
  if (modality === 'tabular') {
    if (computedPurpose === 'supervised_evaluation') {
      candidateTasks.push('binary_classification', 'threshold_optimization', 'data_profiling');
    } else if (computedPurpose === 'labeled_unpredicted') {
      candidateTasks.push('data_profiling');
    } else if (computedPurpose === 'prediction_only') {
      candidateTasks.push('prediction_audit', 'data_profiling');
    } else {
      candidateTasks.push('unsupervised_profiling', 'data_profiling');
    }
  } else if (modality === 'llm') {
    candidateTasks.push('rag_evaluation', 'rag_hallucination_audit', 'retrieval_benchmarking');
  } else if (modality === 'vision') {
    candidateTasks.push('vision_classification', 'visual_defect_detection', 'image_quality_audit');
  }

  // 7. Numeric probability range check
  let hasValidProbabilities = context.hasValidProbabilities;
  if (hasValidProbabilities === undefined && roles.probabilityColumn && context.numericRanges) {
    const range = context.numericRanges[roles.probabilityColumn];
    if (range) {
      hasValidProbabilities = range.min >= -0.001 && range.max <= 1.001;
    }
  }

  const evalContext: NormalizedCapabilityContext = {
    ...context,
    modality,
    task: computedTask,
    roles,
    hasValidProbabilities,
  };

  const available: AvailableToolCapability[] = [];
  const unavailable: UnavailableToolCapability[] = [];

  for (const toolDecl of TOOL_PREREQUISITES) {
    // Check modality match
    if (!toolDecl.supportedModalities.includes(modality)) {
      const missing = [`modality:${toolDecl.supportedModalities.join('|')}`];
      unavailable.push({
        tool: toolDecl.tool,
        toolId: toolDecl.tool,
        displayName: toolDecl.displayName,
        category: toolDecl.category,
        status: 'unsupported_modality',
        reason: `Tool requires ${toolDecl.supportedModalities.join(' or ')} modality (current dataset modality is ${modality}).`,
        missingPrerequisites: missing,
        missingRequirements: missing,
        howToEnable: `Provide a dataset with modality ${toolDecl.supportedModalities.join(' or ')} to enable this diagnostic.`,
      });
      continue;
    }

    const check = toolDecl.checkPrerequisites(evalContext);
    if (check.satisfied) {
      available.push({
        tool: toolDecl.tool,
        toolId: toolDecl.tool,
        displayName: toolDecl.displayName,
        category: toolDecl.category,
        reason: check.reason,
      });
    } else {
      const missing = check.missingPrerequisites ?? [];
      unavailable.push({
        tool: toolDecl.tool,
        toolId: toolDecl.tool,
        displayName: toolDecl.displayName,
        category: toolDecl.category,
        status: 'missing_prerequisites',
        reason: check.reason,
        missingPrerequisites: missing,
        missingRequirements: missing,
        howToEnable: check.howToEnable,
        validationErrors: check.validationErrors,
      });
    }
  }

  // A dataset is supported for investigation if at least one valid tool is available!
  const isSupportedForInvestigation = available.length > 0;
  const unsupportedReason = isSupportedForInvestigation
    ? undefined
    : 'No diagnostic analyses or data intelligence tools are available for the current dataset configuration.';

  let taskExplanation: string;
  switch (computedTask) {
    case 'binary_classification':
      taskExplanation = roles.predictionColumn
        ? 'Binary classification model evaluation dataset (ground truth + model predictions mapped).'
        : 'Binary labeled tabular dataset (ground truth mapped; model predictions absent). Data profiling and quality analysis available.';
      break;
    case 'raw_features_no_predictions':
      taskExplanation = 'Labeled dataset without model predictions. Data profiling, quality checks, and label distribution are available.';
      break;
    case 'multiclass_classification':
      taskExplanation = roles.predictionColumn
        ? 'Multiclass classification model evaluation dataset.'
        : 'Multiclass labeled tabular dataset without model predictions.';
      break;
    case 'regression':
      taskExplanation = 'Continuous numeric outcome regression dataset.';
      break;
    case 'prediction_audit':
      taskExplanation = 'Model prediction audit dataset (predictions mapped without ground truth labels).';
      break;
    case 'unsupervised_profiling':
      taskExplanation = 'Unlabeled tabular dataset. Profiling, missingness, duplicate, and distribution health analysis available.';
      break;
    case 'rag_evaluation':
      taskExplanation = 'LLM and RAG prompt-response reliability evaluation dataset.';
      break;
    case 'vision_classification':
      taskExplanation = 'Computer vision image classification dataset.';
      break;
    default:
      taskExplanation = 'Tabular dataset structure detected.';
      break;
  }

  return {
    schemaVersion: 1,
    format: normFormat,
    modality,
    purpose: computedPurpose,
    task: computedTask,
    candidateTasks,
    taskExplanation,
    isSupportedForInvestigation,
    unsupportedReason,
    columns: {
      total: context.columns.length,
      target: roles.targetColumn,
      prediction: roles.predictionColumn,
      probability: roles.probabilityColumn,
      id: roles.idColumn,
      timestamp: roles.timestampColumn,
      slices: roles.sliceColumns,
      features: roles.featureColumns,
    },
    rowCount: context.rowCount,
    columnCount: context.columns.length,
    hasReferenceDataset: Boolean(context.hasReferenceDataset),
    hasModelArtifacts: Boolean(context.hasModelArtifacts),
    available,
    unavailable,
    summary: {
      totalTools: available.length + unavailable.length,
      availableCount: available.length,
      unavailableCount: unavailable.length,
    },
  };
}
