export type RepairPolicyStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'archived';

export type ValidationMode = 'independent_holdout_validated' | 'single_cohort_optimization';

export interface RepairApproval {
  approvedBy: string;
  approvedByName: string;
  approvedAt: string;
  comments: string;
  expectedVersion: number;
  automatedDeploymentProhibited: true;
  signature?: string;
}

export interface RepairRejection {
  rejectedBy: string;
  rejectedByName: string;
  rejectedAt: string;
  reason: string;
}

export interface RepairPolicyCodeSnippets {
  python: string;
  typescript: string;
  json: string;
  yaml: string;
}

export type PolicyModality = 'tabular' | 'llm' | 'vision' | 'data_curation';

export interface LlmRepairConfig {
  systemPromptPatch?: string;
  schemaRetryEnabled?: boolean;
  maxSchemaRetries?: number;
  retrievalK?: number;
}

export interface VisionRepairConfig {
  minLaplacianSharpness?: number;
  rejectBlurry?: boolean;
  cropBorderWatermark?: boolean;
  confidenceMarginFloor?: number;
}

export interface DataCurationConfig {
  imputationStrategy?: 'median' | 'mean' | 'mode' | 'zero';
  deduplicationEnabled?: boolean;
  outlierClippingIqr?: number;
  classImbalanceHandling?: 'cost_weighting' | 'stratified_sampling' | 'none';
}

export interface RepairPolicy {
  id: string;
  organizationId: string;
  projectId: string;
  investigationId?: string;
  modality?: PolicyModality;
  version: number;
  status: RepairPolicyStatus;
  operatingThreshold: number;
  positiveLabel: string;
  costWeights: {
    falseNegative: number;
    falsePositive: number;
  };
  targetRecall: number;
  validationMode: ValidationMode;
  datasetName: string;
  totalSamples: number;
  llmConfig?: LlmRepairConfig;
  visionConfig?: VisionRepairConfig;
  baselineMetrics?: {
    recall: number;
    precision: number;
    cost: number;
  };
  projectedMetrics?: {
    recall: number;
    precision: number;
    cost: number;
    recallDelta: number;
    costReduction: number;
  };
  codeSnippets: RepairPolicyCodeSnippets;
  approval?: RepairApproval;
  rejection?: RepairRejection;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRepairPolicyParams {
  organizationId: string;
  projectId: string;
  investigationId?: string;
  modality?: PolicyModality;
  operatingThreshold: number;
  positiveLabel: string;
  costWeights: {
    falseNegative: number;
    falsePositive: number;
  };
  targetRecall: number;
  validationMode?: ValidationMode;
  datasetName?: string;
  totalSamples?: number;
  llmConfig?: LlmRepairConfig;
  visionConfig?: VisionRepairConfig;
  baselineMetrics?: {
    recall: number;
    precision: number;
    cost: number;
  };
  projectedMetrics?: {
    recall: number;
    precision: number;
    cost: number;
    recallDelta: number;
    costReduction: number;
  };
  createdBy: string;
}

export interface ApproveRepairPolicyParams {
  approvedBy: string;
  approvedByName: string;
  comments: string;
  expectedVersion: number;
  signature?: string;
}

export interface RejectRepairPolicyParams {
  rejectedBy: string;
  rejectedByName: string;
  reason: string;
  expectedVersion?: number;
}
