import type { ModelMetadataExtraction } from '../domain/artifacts.ts';

/**
 * Parses and normalizes structured model metadata from JSON or YAML-like configurations
 */
export function parseModelMetadata(rawContent: string): ModelMetadataExtraction {
  if (typeof rawContent !== 'string' || !rawContent.trim()) {
    return {
      taskType: 'unknown',
    };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    return {
      taskType: 'unknown',
      rawJson: { error: 'Failed to parse JSON config' },
    };
  }

  // Model Name / Version
  const modelName =
    (parsed.model_name ?? parsed.modelName ?? parsed.name ?? parsed.model) as string | undefined;
  const modelVersion =
    (parsed.model_version ?? parsed.modelVersion ?? parsed.version) as string | undefined;

  // Framework
  const framework =
    (parsed.framework ?? parsed.library ?? parsed.platform) as string | undefined;

  // Task type
  let taskType: ModelMetadataExtraction['taskType'] = 'unknown';
  const rawTask = String(
    parsed.task_type ?? parsed.taskType ?? parsed.task ?? parsed.objective ?? ''
  ).toLowerCase();

  if (rawTask.includes('binary') || rawTask.includes('logistic') || rawTask === 'classification') {
    taskType = 'binary_classification';
  } else if (rawTask.includes('multiclass') || rawTask.includes('multi_class')) {
    taskType = 'multiclass_classification';
  } else if (rawTask.includes('regression') || rawTask.includes('regressor') || rawTask.includes('mse')) {
    taskType = 'regression';
  }

  // Target and Feature columns
  const targetColumn = (parsed.target_column ??
    parsed.targetColumn ??
    parsed.target ??
    parsed.label_column ??
    parsed.labelColumn) as string | undefined;

  let featureColumns: string[] | undefined;
  if (Array.isArray(parsed.feature_columns ?? parsed.featureColumns ?? parsed.features)) {
    featureColumns = (parsed.feature_columns ?? parsed.featureColumns ?? parsed.features) as string[];
  }

  // Hyperparameters
  const hyperparameters = (parsed.hyperparameters ??
    parsed.hyperparams ??
    parsed.params ??
    parsed.parameters) as Record<string, unknown> | undefined;

  // Random seed
  let randomSeed: number | undefined;
  const rawSeed = parsed.random_seed ?? parsed.randomSeed ?? parsed.seed ?? parsed.random_state;
  if (typeof rawSeed === 'number') {
    randomSeed = rawSeed;
  } else if (typeof rawSeed === 'string' && !isNaN(parseInt(rawSeed, 10))) {
    randomSeed = parseInt(rawSeed, 10);
  }

  const datasetVersion = (parsed.dataset_version ?? parsed.datasetVersion) as string | undefined;
  const environment = (parsed.environment ?? parsed.env) as string | undefined;

  return {
    modelName: typeof modelName === 'string' ? modelName : undefined,
    modelVersion: typeof modelVersion === 'string' ? modelVersion : undefined,
    framework: typeof framework === 'string' ? framework : undefined,
    taskType,
    targetColumn: typeof targetColumn === 'string' ? targetColumn : undefined,
    featureColumns,
    hyperparameters: typeof hyperparameters === 'object' && hyperparameters !== null ? hyperparameters : undefined,
    randomSeed,
    datasetVersion: typeof datasetVersion === 'string' ? datasetVersion : undefined,
    environment: typeof environment === 'string' ? environment : undefined,
    rawJson: parsed,
  };
}

/**
 * Safely checks whether an uploaded file is an unsafe model binary that should not be deserialized
 */
export function checkUnsafeModelBinary(filename: string): { isUnsafeBinary: boolean; reason?: string } {
  const lower = filename.toLowerCase();
  const unsafeExtensions = ['.pkl', '.pickle', '.joblib', '.pt', '.pth', '.bin', '.h5', '.keras', '.mar'];

  for (const ext of unsafeExtensions) {
    if (lower.endsWith(ext)) {
      return {
        isUnsafeBinary: true,
        reason: `Model binary format "${ext}" cannot be safely executed or deserialized in the web environment. Deserializing arbitrary Python objects risks remote code execution (CWE-502). Please upload evaluation predictions (CSV), training logs (.log), or a model_config.json export instead.`,
      };
    }
  }

  return { isUnsafeBinary: false };
}
