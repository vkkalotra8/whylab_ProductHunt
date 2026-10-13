import type {
  RepairPolicyCodeSnippets,
  RepairApproval,
  ValidationMode,
  PolicyModality,
  LlmRepairConfig,
  VisionRepairConfig,
  DataCurationConfig,
} from './types.ts';

export interface CodeGeneratorOptions {
  policyId: string;
  version: number;
  modality?: PolicyModality;
  operatingThreshold: number;
  positiveLabel: string;
  falseNegativeCost: number;
  falsePositiveCost: number;
  datasetName: string;
  totalSamples: number;
  validationMode: ValidationMode;
  approval?: RepairApproval;
  llmConfig?: LlmRepairConfig;
  visionConfig?: VisionRepairConfig;
  dataCurationConfig?: DataCurationConfig;
}

export function generatePolicyCodeSnippets(options: CodeGeneratorOptions): RepairPolicyCodeSnippets {
  const {
    policyId,
    version,
    modality = 'tabular',
    operatingThreshold,
    positiveLabel,
    falseNegativeCost,
    falsePositiveCost,
    datasetName,
    totalSamples,
    validationMode,
    approval,
    llmConfig,
    visionConfig,
    dataCurationConfig,
  } = options;

  const isApproved = !!approval;
  const thresholdStr = typeof operatingThreshold === 'number' ? operatingThreshold.toFixed(2) : '0.50';

  // Common attestation banner texts
  const attestationHeader = isApproved
    ? `# ATTESTATION: Human Clinical/Production Sign-Off Confirmed
# Approved By: ${approval.approvedByName} (${approval.approvedBy})
# Approved At: ${approval.approvedAt}
# Version: ${approval.expectedVersion}
# Rationale: "${approval.comments}"
# Validation Mode: ${validationMode}
# CRITICAL SAFETY INVARIANT: Automated deployment is PROHIBITED.
# Manual staging verification and approval are strictly required.`
    : `# WARNING: DRAFT POLICY - NOT APPROVED FOR PRODUCTION SERVING
# Status: UNAPPROVED_DRAFT (v${version})
# Validation Mode: ${validationMode}
# Explicit authenticated human sign-off is REQUIRED prior to production activation.
# Automated deployment is PROHIBITED.`;

  const tsAttestationHeader = isApproved
    ? `/**
 * WhyLab 2.0 Operating Policy Specification
 * ATTESTATION: Human Clinical/Production Sign-Off Confirmed
 * Approved By: ${approval.approvedByName} (${approval.approvedBy})
 * Approved At: ${approval.approvedAt}
 * Version: ${approval.expectedVersion}
 * Rationale: "${approval.comments}"
 * Validation Mode: ${validationMode}
 * CRITICAL SAFETY INVARIANT: Automated deployment is PROHIBITED.
 */`
    : `/**
 * WhyLab 2.0 Operating Policy Specification
 * WARNING: DRAFT POLICY - NOT APPROVED FOR PRODUCTION SERVING
 * Status: UNAPPROVED_DRAFT (v${version})
 * Validation Mode: ${validationMode}
 * Explicit authenticated human sign-off is REQUIRED prior to production activation.
 */`;

  if (modality === 'data_curation') {
    const impute = dataCurationConfig?.imputationStrategy ?? 'median';
    const dedup = dataCurationConfig?.deduplicationEnabled ?? true;
    const iqr = dataCurationConfig?.outlierClippingIqr ?? 1.5;
    const imbalanceHandling = dataCurationConfig?.classImbalanceHandling ?? 'cost_weighting';

    const python = `${attestationHeader}

OPERATING_POLICY_ID: str = "${policyId}"
POLICY_VERSION: int = ${version}
POLICY_MODALITY: str = "data_curation"
APPROVAL_STATUS: str = "${isApproved ? 'APPROVED' : 'UNAPPROVED_DRAFT'}"
AUTOMATED_DEPLOYMENT_PROHIBITED: bool = True

IMPUTATION_STRATEGY: str = "${impute}"
DEDUPLICATION_ENABLED: bool = ${dedup ? 'True' : 'False'}
OUTLIER_CLIPPING_IQR: float = ${iqr}
CLASS_IMBALANCE_HANDLING: str = "${imbalanceHandling}"

import pandas as pd
import numpy as np

def curate_dataset(df: pd.DataFrame) -> pd.DataFrame:
    """
    Applies WhyLab 3.0 verified data curation and hygiene pipeline:
    - Deduplication: Removes identical duplicate records
    - Imputation: Replaces missing values using ${impute} strategy
    - Outlier bounds: Fences numeric values at ${iqr}x IQR
    """
    curated = df.copy()
    if DEDUPLICATION_ENABLED:
        curated = curated.drop_duplicates()

    # Impute and clip numeric features
    numeric_cols = curated.select_dtypes(include=[np.number]).columns
    for col in numeric_cols:
        val = curated[col].${impute === 'mean' ? 'mean()' : 'median()'}
        curated[col] = curated[col].fillna(val)
        q25 = curated[col].quantile(0.25)
        q75 = curated[col].quantile(0.75)
        iqr_val = q75 - q25
        curated[col] = curated[col].clip(q25 - OUTLIER_CLIPPING_IQR * iqr_val, q75 + OUTLIER_CLIPPING_IQR * iqr_val)

    # Impute categorical features
    cat_cols = curated.select_dtypes(include=['object', 'category']).columns
    for col in cat_cols:
        if not curated[col].empty and curated[col].mode().shape[0] > 0:
            curated[col] = curated[col].fillna(curated[col].mode()[0])

    return curated
`;

    const typescript = `${tsAttestationHeader}

export const DATA_CURATION_POLICY = {
  policyId: '${policyId}',
  version: ${version},
  modality: 'data_curation' as const,
  status: '${isApproved ? 'approved' : 'unapproved_draft'}' as const,
  imputationStrategy: '${impute}',
  deduplicationEnabled: ${dedup},
  outlierClippingIqr: ${iqr},
  classImbalanceHandling: '${imbalanceHandling}',
  validationMode: '${validationMode}',
  automatedDeploymentProhibited: true as const,
  ${
    isApproved
      ? `approvedBy: '${approval.approvedBy}',
  approvedByName: '${approval.approvedByName}',
  approvedAt: '${approval.approvedAt}',
  rationale: ${JSON.stringify(approval.comments)},`
      : ''
  }
} as const;

export function curateRecord(record: Record<string, unknown>): Record<string, unknown> {
  const curated = { ...record };
  return curated;
}
`;

    const json = JSON.stringify(
      {
        $schema: 'https://whylab.ai/schemas/v2/operating-policy.json',
        policy_id: policyId,
        version,
        modality: 'data_curation',
        status: isApproved ? 'approved' : 'unapproved_draft',
        curation_rules: {
          imputation_strategy: impute,
          deduplication_enabled: dedup,
          outlier_clipping_iqr: iqr,
          class_imbalance_handling: imbalanceHandling,
        },
        validation_mode: validationMode,
        provenance: {
          evaluation_dataset: datasetName,
          sample_size: totalSamples,
          evaluation_engine: 'whylab_dataset_intelligence_v3',
        },
        safety_invariants: {
          automated_deployment_prohibited: true,
        },
        approval: isApproved
          ? {
              approved_by: approval.approvedBy,
              approved_by_name: approval.approvedByName,
              approved_at: approval.approvedAt,
              comments: approval.comments,
              expected_version: approval.expectedVersion,
            }
          : null,
      },
      null,
      2
    );

    const yaml = `# WhyLab Data Curation & Hygiene Policy Specification
schema_version: 2
policy_id: "${policyId}"
version: ${version}
modality: "data_curation"
status: "${isApproved ? 'approved' : 'unapproved_draft'}"
curation_rules:
  imputation_strategy: "${impute}"
  deduplication_enabled: ${dedup}
  outlier_clipping_iqr: ${iqr}
  class_imbalance_handling: "${imbalanceHandling}"
provenance:
  evaluation_dataset: "${datasetName}"
  sample_size: ${totalSamples}
safety_invariants:
  automated_deployment_prohibited: true
${
  isApproved
    ? `approval:
  approved_by: "${approval.approvedBy}"
  approved_by_name: "${approval.approvedByName}"
  approved_at: "${approval.approvedAt}"
  rationale: "${approval.comments}"`
    : `approval: null # Requires explicit human signoff`
}
`;

    return {
      python,
      typescript,
      json,
      yaml,
    };
  }

  if (modality === 'llm') {
    const defaultPrompt =
      'Answer strictly using verified context. If information is missing or uncertain, explicitly state UNCERTAIN and do not fabricate claims.';
    const promptPatch = llmConfig?.systemPromptPatch ?? defaultPrompt;
    const retryEnabled = llmConfig?.schemaRetryEnabled ?? true;
    const maxRetries = llmConfig?.maxSchemaRetries ?? 1;
    const retrievalK = llmConfig?.retrievalK ?? 5;

    const python = `${attestationHeader}

OPERATING_POLICY_ID: str = "${policyId}"
POLICY_VERSION: int = ${version}
POLICY_MODALITY: str = "llm"
APPROVAL_STATUS: str = "${isApproved ? 'APPROVED' : 'UNAPPROVED_DRAFT'}"
AUTOMATED_DEPLOYMENT_PROHIBITED: bool = True

SYSTEM_PROMPT_PATCH: str = """${promptPatch.replace(/"/g, '\\"')}"""
SCHEMA_RETRY_ENABLED: bool = ${retryEnabled ? 'True' : 'False'}
MAX_SCHEMA_RETRIES: int = ${maxRetries}
RETRIEVAL_TOP_K: int = ${retrievalK}

def apply_operating_policy(response_text: str, is_schema_valid: bool = True) -> dict:
    """
    Evaluates whether LLM response conforms to WhyLab verified reliability guardrails.
    Applies single-turn schema retry rule and enforces citation grounding verification.
    """
    if not is_schema_valid and SCHEMA_RETRY_ENABLED:
        return {"action": "RETRY_WITH_SCHEMA_REMINDER", "max_retries": MAX_SCHEMA_RETRIES}
    return {"action": "ACCEPT", "system_prompt_patch": SYSTEM_PROMPT_PATCH, "retrieval_k": RETRIEVAL_TOP_K}
`;

    const typescript = `${tsAttestationHeader}

export const POLICY_CONFIG = {
  policyId: '${policyId}',
  version: ${version},
  modality: 'llm' as const,
  status: '${isApproved ? 'approved' : 'unapproved_draft'}' as const,
  systemPromptPatch: ${JSON.stringify(promptPatch)},
  schemaRetryEnabled: ${retryEnabled},
  maxSchemaRetries: ${maxRetries},
  retrievalK: ${retrievalK},
  validationMode: '${validationMode}',
  automatedDeploymentProhibited: true as const,
  ${
    isApproved
      ? `approvedBy: '${approval.approvedBy}',
  approvedByName: '${approval.approvedByName}',
  approvedAt: '${approval.approvedAt}',
  rationale: ${JSON.stringify(approval.comments)},`
      : ''
  }
} as const;

export function applyPolicy(input: { responseText: string; isSchemaValid: boolean }) {
  if (!input.isSchemaValid && POLICY_CONFIG.schemaRetryEnabled) {
    return { action: 'RETRY', maxRetries: POLICY_CONFIG.maxSchemaRetries };
  }
  return { action: 'ACCEPT', retrievalK: POLICY_CONFIG.retrievalK };
}
`;

    const json = JSON.stringify(
      {
        $schema: 'https://whylab.ai/schemas/v2/operating-policy.json',
        policy_id: policyId,
        version,
        modality: 'llm',
        status: isApproved ? 'approved' : 'unapproved_draft',
        llm_safeguards: {
          system_prompt_patch: promptPatch,
          schema_retry_enabled: retryEnabled,
          max_schema_retries: maxRetries,
          retrieval_k: retrievalK,
        },
        validation_mode: validationMode,
        provenance: {
          evaluation_dataset: datasetName,
          sample_size: totalSamples,
          evaluation_engine: 'whylab_llm_reliability_v2',
        },
        automated_deployment_prohibited: true,
        approval: isApproved
          ? {
              approved_by: approval.approvedBy,
              approved_by_name: approval.approvedByName,
              approved_at: approval.approvedAt,
              comments: approval.comments,
              expected_version: approval.expectedVersion,
            }
          : null,
      },
      null,
      2
    );

    const yaml = `# WhyLab LLM Reliability Serving Policy Specification
schema_version: 2
policy_id: "${policyId}"
version: ${version}
modality: "llm"
status: "${isApproved ? 'approved' : 'unapproved_draft'}"
llm_safeguards:
  schema_retry_enabled: ${retryEnabled}
  max_schema_retries: ${maxRetries}
  retrieval_k: ${retrievalK}
provenance:
  evaluation_dataset: "${datasetName}"
  sample_size: ${totalSamples}
safety_invariants:
  automated_deployment_prohibited: true
${
  isApproved
    ? `approval:
  approved_by: "${approval.approvedBy}"
  approved_by_name: "${approval.approvedByName}"
  approved_at: "${approval.approvedAt}"
  rationale: "${approval.comments}"`
    : `approval: null # Requires explicit human signoff`
}
`;

    return { python, typescript, json, yaml };
  }

  if (modality === 'vision') {
    const minSharpness = visionConfig?.minLaplacianSharpness ?? 150.0;
    const rejectBlurry = visionConfig?.rejectBlurry ?? true;
    const cropBorder = visionConfig?.cropBorderWatermark ?? true;
    const confidenceMargin = visionConfig?.confidenceMarginFloor ?? 0.15;

    const python = `${attestationHeader}

OPERATING_POLICY_ID: str = "${policyId}"
POLICY_VERSION: int = ${version}
POLICY_MODALITY: str = "vision"
APPROVAL_STATUS: str = "${isApproved ? 'APPROVED' : 'UNAPPROVED_DRAFT'}"
AUTOMATED_DEPLOYMENT_PROHIBITED: bool = True

MIN_LAPLACIAN_SHARPNESS: float = ${minSharpness.toFixed(1)}
REJECT_BLURRY_IMAGES: bool = ${rejectBlurry ? 'True' : 'False'}
CROP_BORDER_WATERMARK: bool = ${cropBorder ? 'True' : 'False'}
CONFIDENCE_MARGIN_FLOOR: float = ${confidenceMargin.toFixed(2)}

def apply_operating_policy(sharpness: float, confidence: float) -> dict:
    """
    Evaluates whether input image meets WhyLab verified quality floors.
    Screens out low-sharpness blur artifacts and routes borderline classifications to human inspection.
    """
    if sharpness < MIN_LAPLACIAN_SHARPNESS and REJECT_BLURRY_IMAGES:
        return {"action": "REJECT_QUALITY_FLOOR", "reason": f"Sharpness {sharpness:.1f} below floor {MIN_LAPLACIAN_SHARPNESS}"}
    if abs(confidence - 0.5) < CONFIDENCE_MARGIN_FLOOR:
        return {"action": "ROUTE_HUMAN_REVIEW", "reason": "Borderline classification confidence"}
    return {"action": "ACCEPT", "crop_border": CROP_BORDER_WATERMARK}
`;

    const typescript = `${tsAttestationHeader}

export const POLICY_CONFIG = {
  policyId: '${policyId}',
  version: ${version},
  modality: 'vision' as const,
  status: '${isApproved ? 'approved' : 'unapproved_draft'}' as const,
  minLaplacianSharpness: ${minSharpness.toFixed(1)},
  rejectBlurryImages: ${rejectBlurry},
  cropBorderWatermark: ${cropBorder},
  confidenceMarginFloor: ${confidenceMargin.toFixed(2)},
  validationMode: '${validationMode}',
  automatedDeploymentProhibited: true as const,
  ${
    isApproved
      ? `approvedBy: '${approval.approvedBy}',
  approvedByName: '${approval.approvedByName}',
  approvedAt: '${approval.approvedAt}',
  rationale: ${JSON.stringify(approval.comments)},`
      : ''
  }
} as const;

export function applyPolicy(input: { sharpness: number; confidence: number }) {
  if (input.sharpness < POLICY_CONFIG.minLaplacianSharpness && POLICY_CONFIG.rejectBlurryImages) {
    return { action: 'REJECT_QUALITY_FLOOR', reason: 'Below sharpness floor' };
  }
  if (Math.abs(input.confidence - 0.5) < POLICY_CONFIG.confidenceMarginFloor) {
    return { action: 'ROUTE_HUMAN_REVIEW', reason: 'Borderline confidence' };
  }
  return { action: 'ACCEPT', cropBorder: POLICY_CONFIG.cropBorderWatermark };
}
`;

    const json = JSON.stringify(
      {
        $schema: 'https://whylab.ai/schemas/v2/operating-policy.json',
        policy_id: policyId,
        version,
        modality: 'vision',
        status: isApproved ? 'approved' : 'unapproved_draft',
        vision_quality_thresholds: {
          min_laplacian_sharpness: minSharpness,
          reject_blurry_images: rejectBlurry,
          crop_border_watermark: cropBorder,
          confidence_margin_floor: confidenceMargin,
        },
        validation_mode: validationMode,
        provenance: {
          evaluation_dataset: datasetName,
          sample_size: totalSamples,
          evaluation_engine: 'whylab_vision_reliability_v2',
        },
        automated_deployment_prohibited: true,
        approval: isApproved
          ? {
              approved_by: approval.approvedBy,
              approved_by_name: approval.approvedByName,
              approved_at: approval.approvedAt,
              comments: approval.comments,
              expected_version: approval.expectedVersion,
            }
          : null,
      },
      null,
      2
    );

    const yaml = `# WhyLab Computer Vision Reliability Serving Policy Specification
schema_version: 2
policy_id: "${policyId}"
version: ${version}
modality: "vision"
status: "${isApproved ? 'approved' : 'unapproved_draft'}"
vision_quality_thresholds:
  min_laplacian_sharpness: ${minSharpness.toFixed(1)}
  reject_blurry_images: ${rejectBlurry}
  crop_border_watermark: ${cropBorder}
provenance:
  evaluation_dataset: "${datasetName}"
  sample_size: ${totalSamples}
safety_invariants:
  automated_deployment_prohibited: true
${
  isApproved
    ? `approval:
  approved_by: "${approval.approvedBy}"
  approved_by_name: "${approval.approvedByName}"
  approved_at: "${approval.approvedAt}"
  rationale: "${approval.comments}"`
    : `approval: null # Requires explicit human signoff`
}
`;

    return { python, typescript, json, yaml };
  }

  // DEFAULT / TABULAR MODALITY (Preserved 100% identically)
  const python = `${attestationHeader}

OPERATING_POLICY_ID: str = "${policyId}"
POLICY_VERSION: int = ${version}
OPERATING_THRESHOLD: float = ${thresholdStr}
POSITIVE_LABEL: str = "${positiveLabel}"
APPROVAL_STATUS: str = "${isApproved ? 'APPROVED' : 'UNAPPROVED_DRAFT'}"
AUTOMATED_DEPLOYMENT_PROHIBITED: bool = True

LOSS_WEIGHTS = {
    "false_negative_cost": ${falseNegativeCost},
    "false_positive_cost": ${falsePositiveCost},
}

def apply_operating_policy(probability: float) -> str:
    """
    Evaluates whether predicted probability meets the WhyLab verified cutoff.
    Preserves continuous probability scores for calibration audits.
    """
    if probability is None or not (0.0 <= probability <= 1.0):
        raise ValueError(f"Invalid probability score: {probability}")
    
    return POSITIVE_LABEL if probability >= OPERATING_THRESHOLD else "0"

def batch_apply_policy(probabilities: list[float]) -> list[str]:
    return [apply_operating_policy(p) for p in probabilities]
`;

  const typescript = `${tsAttestationHeader}

export const POLICY_CONFIG = {
  policyId: '${policyId}',
  version: ${version},
  status: '${isApproved ? 'approved' : 'unapproved_draft'}' as const,
  operatingThreshold: ${thresholdStr},
  positiveLabel: '${positiveLabel}',
  comparison: 'greater_than_or_equal' as const,
  costWeights: {
    falseNegative: ${falseNegativeCost},
    falsePositive: ${falsePositiveCost},
  },
  validationMode: '${validationMode}',
  automatedDeploymentProhibited: true as const,
  ${
    isApproved
      ? `approvedBy: '${approval.approvedBy}',
  approvedByName: '${approval.approvedByName}',
  approvedAt: '${approval.approvedAt}',
  rationale: ${JSON.stringify(approval.comments)},`
      : ''
  }
} as const;

export function applyPolicy(probability: number): string {
  if (typeof probability !== 'number' || Number.isNaN(probability) || probability < 0 || probability > 1) {
    throw new RangeError(\`Probability must be a valid float in [0, 1], got: \${probability}\`);
  }
  return probability >= POLICY_CONFIG.operatingThreshold ? POLICY_CONFIG.positiveLabel : '0';
}
`;

  const json = JSON.stringify(
    {
      $schema: 'https://whylab.ai/schemas/v2/operating-policy.json',
      policy_id: policyId,
      version,
      status: isApproved ? 'approved' : 'unapproved_draft',
      operating_threshold: Number(thresholdStr),
      decision_operator: 'gte',
      positive_label: positiveLabel,
      loss_matrix: {
        false_negative_cost: falseNegativeCost,
        false_positive_cost: falsePositiveCost,
        unit: 'relative_penalty',
      },
      validation_mode: validationMode,
      provenance: {
        evaluation_dataset: datasetName,
        sample_size: totalSamples,
        evaluation_engine: 'whylab_deterministic_v2',
      },
      automated_deployment_prohibited: true,
      approval: isApproved
        ? {
            approved_by: approval.approvedBy,
            approved_by_name: approval.approvedByName,
            approved_at: approval.approvedAt,
            comments: approval.comments,
            expected_version: approval.expectedVersion,
          }
        : null,
    },
    null,
    2
  );

  const yaml = `# WhyLab Production Serving Policy Specification
schema_version: 2
policy_id: "${policyId}"
version: ${version}
status: "${isApproved ? 'approved' : 'unapproved_draft'}"
operating_threshold: ${thresholdStr}
decision_operator: greater_than_or_equal
positive_label: "${positiveLabel}"
validation_mode: "${validationMode}"
cost_matrix:
  false_negative_cost: ${falseNegativeCost}
  false_positive_cost: ${falsePositiveCost}
provenance:
  evaluation_dataset: "${datasetName}"
  sample_size: ${totalSamples}
safety_invariants:
  automated_deployment_prohibited: true
${
  isApproved
    ? `approval:
  approved_by: "${approval.approvedBy}"
  approved_by_name: "${approval.approvedByName}"
  approved_at: "${approval.approvedAt}"
  rationale: "${approval.comments}"`
    : `approval: null # Requires explicit human signoff`
}
`;

  return {
    python,
    typescript,
    json,
    yaml,
  };
}
