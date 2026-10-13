/**
 * Domain contracts for Large Language Model (LLM) and RAG evaluation in WhyLab 2.0.
 * Adheres to modality-specific contracts: preserves dataset provenance without
 * forcing LLM records into tabular classification columns.
 */

export interface LlmTokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface LlmContextChunk {
  id?: string;
  text: string;
  title?: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

export interface LlmRecord {
  caseId: string;
  prompt: string;
  response: string;
  referenceAnswer?: string | null;
  modelVersion?: string;
  retrievedContext?: string[] | LlmContextChunk[] | null;
  latencyMs?: number | null;
  tokenUsage?: LlmTokenUsage | null;
  metadata?: Record<string, unknown>;
}

export interface LlmEvaluationCapabilities {
  hasReferenceAnswers: boolean;
  referenceAnswerCoverageRatio: number;
  hasRetrievedContext: boolean;
  hasLatency: boolean;
  hasTokenUsage: boolean;
  hasStructuredJsonResponses: boolean;
  modelVersions: string[];
}

export interface LlmEvaluationDataset {
  id: string;
  sourceId: string;
  name: string;
  format: 'jsonl' | 'csv' | 'json';
  recordCount: number;
  records: LlmRecord[];
  contentDigest: string; // sha256:hash
  capturedAt: string;
  capabilities: LlmEvaluationCapabilities;
}

export interface LlmIngestionError {
  line?: number;
  row?: number;
  field?: string;
  message: string;
  rawSnippet?: string;
}

export interface LlmIngestionResult {
  success: boolean;
  dataset?: LlmEvaluationDataset;
  errors: LlmIngestionError[];
  warnings: string[];
}

export interface LlmPricingConfig {
  promptCostPerMillion: number;
  completionCostPerMillion: number;
  currency?: string;
}

export interface LlmCostSummary {
  status: 'calculated' | 'unconfigured';
  estimatedCostUsd?: number;
  promptCostUsd?: number;
  completionCostUsd?: number;
  pricingUsed?: LlmPricingConfig;
  reason?: string;
}
