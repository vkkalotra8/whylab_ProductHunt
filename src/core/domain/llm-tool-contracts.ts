/**
 * Typed tool contracts for LLM and RAG diagnostic tools in WhyLab 2.0.
 * Defines input/output schemas for Astra autonomous orchestrator integration.
 */

import type { LlmRecord } from './llm-types.ts';
import type { TextMetricsSummary } from '../diagnostics/llm/text-metrics.ts';
import type { RetrievalSummaryMetrics, RetrievalQueryRecord } from '../diagnostics/llm/retrieval-metrics.ts';
import type { AttributionSummaryMetrics } from '../diagnostics/llm/attribution-checker.ts';
import type { StructuredJudgeResult, RubricCriterion } from '../diagnostics/llm/structured-judge.ts';
import type { PromptComparisonSummary } from '../diagnostics/llm/prompt-comparison.ts';

export type LlmToolName =
  | 'compute_llm_text_metrics'
  | 'evaluate_rag_retrieval'
  | 'check_context_attribution'
  | 'evaluate_rubric_judge'
  | 'compare_prompt_versions';

export interface LlmToolCall<N extends LlmToolName = LlmToolName> {
  id: string;
  investigationId: string;
  tool: N;
  toolVersion: 1;
  requestedAt: string;
  input: LlmToolInputMap[N];
}

export interface LlmToolResult<N extends LlmToolName = LlmToolName> {
  id: string;
  callId: string;
  tool: N;
  toolVersion: 1;
  completedAt: string;
  evidenceIds: string[];
  status: 'completed' | 'error' | 'unsupported';
  output?: LlmToolOutputMap[N];
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

export interface LlmToolInputMap {
  compute_llm_text_metrics: {
    records: Array<{ caseId: string; response: string; referenceAnswer?: string | null }>;
  };
  evaluate_rag_retrieval: {
    records: RetrievalQueryRecord[];
    kList?: number[];
  };
  check_context_attribution: {
    records: Array<{
      caseId: string;
      response: string;
      retrievedContext?: string[] | Array<{ id?: string; text: string }> | null;
    }>;
  };
  evaluate_rubric_judge: {
    caseId: string;
    prompt: string;
    response: string;
    rubricId?: RubricCriterion;
    tokenF1?: number;
    unsupportedClaimsRatio?: number;
  };
  compare_prompt_versions: {
    baselineRecords: LlmRecord[];
    candidateRecords: LlmRecord[];
  };
}

export interface LlmToolOutputMap {
  compute_llm_text_metrics: TextMetricsSummary;
  evaluate_rag_retrieval: RetrievalSummaryMetrics;
  check_context_attribution: AttributionSummaryMetrics;
  evaluate_rubric_judge: StructuredJudgeResult;
  compare_prompt_versions: PromptComparisonSummary;
}
