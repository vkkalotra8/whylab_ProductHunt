/**
 * LLM and RAG Diagnostic Tool Dispatcher.
 * Executes allowlisted deterministic tools, enforces typed contracts,
 * and produces immutable Evidence artifacts with evidence IDs.
 */

import { evaluateTextMetrics } from '../../core/diagnostics/llm/text-metrics.ts';
import { evaluateRetrievalMetrics } from '../../core/diagnostics/llm/retrieval-metrics.ts';
import { evaluateDatasetAttribution } from '../../core/diagnostics/llm/attribution-checker.ts';
import { evaluateWithRubric } from '../../core/diagnostics/llm/structured-judge.ts';
import { comparePromptVersions } from '../../core/diagnostics/llm/prompt-comparison.ts';
import { createId, type Id, type Measurement } from '../../core/domain/primitives.ts';
import type { Evidence } from '../../core/domain/types.ts';
import type {
  LlmToolName,
  LlmToolCall,
  LlmToolResult,
  LlmToolInputMap,
  LlmToolOutputMap,
} from '../../core/domain/llm-tool-contracts.ts';

export interface DispatchLlmToolOptions {
  investigationId?: string;
  callId?: string;
  resultId?: string;
}

export interface DispatchedLlmOutput<N extends LlmToolName = LlmToolName> {
  call: LlmToolCall<N>;
  result: LlmToolResult<N>;
  evidence?: Evidence[];
}

export function dispatchLlmDiagnosticTool<N extends LlmToolName>(
  tool: N,
  input: LlmToolInputMap[N],
  options: DispatchLlmToolOptions = {}
): DispatchedLlmOutput<N> {
  const investigationId = options.investigationId ?? createId('investigation');
  const callId = options.callId ?? createId('call');
  const resultId = options.resultId ?? createId('result');
  const now = new Date().toISOString();

  const call: LlmToolCall<N> = {
    id: callId,
    investigationId,
    tool,
    toolVersion: 1,
    requestedAt: now,
    input,
  };

  try {
    let output: LlmToolOutputMap[N];
    const evidenceList: Evidence[] = [];
    const evidenceId = createId('evidence');

    switch (tool) {
      case 'compute_llm_text_metrics': {
        const inp = input as LlmToolInputMap['compute_llm_text_metrics'];
        const res = evaluateTextMetrics(inp.records);
        output = res as LlmToolOutputMap[N];

        const measurements: Measurement[] = [
          {
            name: 'exact_match_rate',
            status: 'measured',
            value: res.exactMatchRate,
            unit: 'ratio',
            sampleSize: res.recordsWithReferenceCount,
          },
          {
            name: 'normalized_exact_match_rate',
            status: 'measured',
            value: res.normalizedExactMatchRate,
            unit: 'ratio',
            sampleSize: res.recordsWithReferenceCount,
          },
          {
            name: 'token_f1',
            status: 'measured',
            value: res.meanTokenF1,
            unit: 'ratio',
            sampleSize: res.recordsWithReferenceCount,
          },
        ];

        evidenceList.push({
          id: evidenceId,
          kind: 'measurement',
          description: `Baseline text metrics: EM ${(res.exactMatchRate * 100).toFixed(1)}%, Token F1 ${(res.meanTokenF1 * 100).toFixed(1)}% across ${res.recordsWithReferenceCount} reference cases.`,
          measurements,
          provenance: {
            kind: 'tool_result',
            resultId: resultId as Id<'result'>,
          },
        });
        break;
      }

      case 'evaluate_rag_retrieval': {
        const inp = input as LlmToolInputMap['evaluate_rag_retrieval'];
        const res = evaluateRetrievalMetrics(inp.records, inp.kList);
        output = res as LlmToolOutputMap[N];

        const measurements: Measurement[] = [
          {
            name: 'mean_reciprocal_rank',
            status: 'measured',
            value: res.meanReciprocalRank,
            unit: 'ratio',
            sampleSize: res.queriesWithGroundTruthCount,
          },
          {
            name: 'recall_at_1',
            status: 'measured',
            value: res.recallAtK[1] ?? 0,
            unit: 'ratio',
            sampleSize: res.queriesWithGroundTruthCount,
          },
          {
            name: 'recall_at_3',
            status: 'measured',
            value: res.recallAtK[3] ?? 0,
            unit: 'ratio',
            sampleSize: res.queriesWithGroundTruthCount,
          },
        ];

        evidenceList.push({
          id: evidenceId,
          kind: 'measurement',
          description: `RAG retrieval performance: MRR ${res.meanReciprocalRank.toFixed(3)}, Recall@3 ${((res.recallAtK[3] ?? 0) * 100).toFixed(1)}% over ${res.queriesWithGroundTruthCount} queries.`,
          measurements,
          provenance: {
            kind: 'tool_result',
            resultId: resultId as Id<'result'>,
          },
        });
        break;
      }

      case 'check_context_attribution': {
        const inp = input as LlmToolInputMap['check_context_attribution'];
        const res = evaluateDatasetAttribution(inp.records);
        output = res as LlmToolOutputMap[N];

        const measurements: Measurement[] = [
          {
            name: 'attribution_score',
            status: 'measured',
            value: res.meanAttributionScore,
            unit: 'ratio',
            sampleSize: res.totalClaimsEvaluated,
          },
          {
            name: 'unsupported_claim_rate',
            status: 'measured',
            value: res.unsupportedClaimRate,
            unit: 'ratio',
            sampleSize: res.totalClaimsEvaluated,
          },
        ];

        evidenceList.push({
          id: evidenceId,
          kind: 'measurement',
          description: `Context attribution analysis: Mean score ${(res.meanAttributionScore * 100).toFixed(1)}%, ${res.totalUnsupportedClaims} unsupported claims detected (${(res.unsupportedClaimRate * 100).toFixed(1)}% rate).`,
          measurements,
          provenance: {
            kind: 'tool_result',
            resultId: resultId as Id<'result'>,
          },
        });
        break;
      }

      case 'evaluate_rubric_judge': {
        const inp = input as LlmToolInputMap['evaluate_rubric_judge'];
        const res = evaluateWithRubric(
          inp.caseId,
          inp.prompt,
          inp.response,
          inp.rubricId,
          {
            tokenF1: inp.tokenF1,
            unsupportedClaimsRatio: inp.unsupportedClaimsRatio,
          }
        );
        output = res as LlmToolOutputMap[N];

        evidenceList.push({
          id: evidenceId,
          kind: 'observation',
          description: `Rubric judge evaluated case ${res.caseId}: Score ${res.score}/5 (${res.rubricTitle}), Confidence ${(res.confidence * 100).toFixed(0)}%. Epistemic status: ${res.epistemicStatus}.`,
          measurements: [
            {
              name: 'judge_score',
              status: 'measured',
              value: res.score,
              unit: 'unitless',
              sampleSize: 1,
            },
          ],
          provenance: {
            kind: 'tool_result',
            resultId: resultId as Id<'result'>,
          },
        });
        break;
      }

      case 'compare_prompt_versions': {
        const inp = input as LlmToolInputMap['compare_prompt_versions'];
        const res = comparePromptVersions(inp.baselineRecords, inp.candidateRecords);
        output = res as LlmToolOutputMap[N];

        evidenceList.push({
          id: evidenceId,
          kind: 'measurement',
          description: `Prompt comparison: Candidate wins on ${res.candidateWinsCount} cases, regresses on ${res.candidateRegressionsCount} cases. McNemar p = ${res.mcnemarPValue}.`,
          measurements: [
            {
              name: 'net_win_rate',
              status: 'measured',
              value: res.netWinRate,
              unit: 'ratio',
              sampleSize: res.pairedCasesCount,
            },
            {
              name: 'em_delta',
              status: 'measured',
              value: res.emDelta,
              unit: 'percentage_points',
              sampleSize: res.pairedCasesCount,
            },
          ],
          provenance: {
            kind: 'tool_result',
            resultId: resultId as Id<'result'>,
          },
        });
        break;
      }

      default:
        throw new Error(`Unsupported tool: ${tool}`);
    }

    const result: LlmToolResult<N> = {
      id: resultId,
      callId,
      tool,
      toolVersion: 1,
      completedAt: new Date().toISOString(),
      evidenceIds: evidenceList.map((e) => e.id),
      status: 'completed',
      output,
    };

    return {
      call,
      result,
      evidence: evidenceList,
    };
  } catch (err) {
    const errorMsg = (err as Error).message ?? 'Execution error';
    const result: LlmToolResult<N> = {
      id: resultId,
      callId,
      tool,
      toolVersion: 1,
      completedAt: new Date().toISOString(),
      evidenceIds: [],
      status: 'error',
      error: {
        code: 'EXECUTION_FAILED',
        message: errorMsg,
        retryable: false,
      },
    };

    return {
      call,
      result,
      evidence: [],
    };
  }
}
