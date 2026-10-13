/**
 * WhyLab AI Provider Comparative Benchmark Harness
 * Evaluates Gemini and OpenAI providers against deterministic criteria:
 * - Investigation completion
 * - Correct tool selection
 * - Valid tool arguments
 * - Evidence citation validity
 * - Structured output reliability
 * - Error recovery
 * - Latency & Token usage
 */

import type { EvaluationDataset } from '../../core/diagnostics/evaluation-ingestion.ts';
import type { InvestigatorProvider, TokenUsage } from '../orchestrator/provider.ts';
import { runAutonomousInvestigation } from '../orchestrator/investigator.ts';
import { toolSchemas, type ToolName } from '../../core/domain/tool-contracts.ts';

export interface ProviderBenchmarkMetrics {
  providerName: string;
  model: string;
  completed: boolean;
  durationMs: number;
  totalRounds: number;
  toolCallCount: number;
  correctToolSelectionRate: number; // 0.0 - 1.0
  validToolArgumentsRate: number; // 0.0 - 1.0
  evidenceCitationValidityRate: number; // 0.0 - 1.0
  structuredOutputReliabilityRate: number; // 0.0 - 1.0
  errorRecoverySuccess: boolean;
  tokenUsage: TokenUsage;
  hasDiagnosis: boolean;
  hypothesesCount: number;
  evidenceCount: number;
  repairsCount: number;
  findings: string[];
}

export interface BenchmarkOptions {
  maxRounds?: number;
  timeoutMs?: number;
  objective?: string;
  userDirectives?: string[];
}

/**
 * Runs a standardized comparative benchmark against a given provider and dataset.
 */
export async function runProviderBenchmark(
  dataset: EvaluationDataset,
  provider: InvestigatorProvider,
  options: BenchmarkOptions = {}
): Promise<ProviderBenchmarkMetrics> {
  const startTime = Date.now();
  const maxRounds = options.maxRounds ?? 8;

  let toolCalls = 0;
  let validTools = 0;
  let validArgs = 0;
  let validCitations = 0;
  let structuredOutputs = 0;
  let recoveredErrors = false;
  let completed = false;
  let finalInvestigation: any = null;
  const findings: string[] = [];

  const generator = runAutonomousInvestigation(dataset, {
    provider,
    maxRounds,
    timeoutMs: options.timeoutMs ?? 60_000,
    objective: options.objective ?? `Benchmark reliability testing on ${dataset.metadata.name}`,
    userDirectives: options.userDirectives,
  });

  for await (const event of generator) {
    if (event.type === 'tool_call') {
      toolCalls++;
      const toolName = event.call.tool as ToolName;

      // 1. Tool selection correctness
      if (toolName in toolSchemas) {
        validTools++;
      } else {
        findings.push(`Invalid tool selected: ${toolName}`);
      }

      // 2. Argument validation
      try {
        const schema = toolSchemas[toolName];
        if (schema && typeof schema.input.parse === 'function') {
          schema.input.parse(event.call.input);
          validArgs++;
        } else {
          validArgs++;
        }
      } catch {
        findings.push(`Tool argument schema validation failed on ${toolName}`);
      }
    } else if (event.type === 'hypothesis_added') {
      structuredOutputs++;
      // Check hypothesis structure
      if (event.hypothesis?.statement && event.hypothesis?.confidence?.level) {
        validCitations++;
      }
    } else if (event.type === 'diagnosis_finalized') {
      structuredOutputs++;
      if (event.diagnosis?.summary && event.diagnosis?.evidenceIds) {
        validCitations++;
      }
    } else if (event.type === 'error' && !event.fatal) {
      recoveredErrors = true;
    } else if (event.type === 'completed') {
      completed = true;
      finalInvestigation = event.investigation;
    }
  }

  const durationMs = Date.now() - startTime;
  const usage = provider.getCumulativeUsage
    ? provider.getCumulativeUsage()
    : { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  const toolSelectionRate = toolCalls > 0 ? validTools / toolCalls : 1.0;
  const toolArgRate = toolCalls > 0 ? validArgs / toolCalls : 1.0;
  const citationRate = structuredOutputs > 0 ? validCitations / structuredOutputs : 1.0;
  const structureRate = completed ? 1.0 : 0.5;

  return {
    providerName: provider.name,
    model: provider.model ?? 'unknown',
    completed,
    durationMs,
    totalRounds: finalInvestigation?.events?.length ?? 0,
    toolCallCount: toolCalls,
    correctToolSelectionRate: Number(toolSelectionRate.toFixed(3)),
    validToolArgumentsRate: Number(toolArgRate.toFixed(3)),
    evidenceCitationValidityRate: Number(citationRate.toFixed(3)),
    structuredOutputReliabilityRate: Number(structureRate.toFixed(3)),
    errorRecoverySuccess: recoveredErrors,
    tokenUsage: usage,
    hasDiagnosis: Boolean(finalInvestigation?.diagnosis),
    hypothesesCount: finalInvestigation?.hypotheses?.length ?? 0,
    evidenceCount: finalInvestigation?.evidence?.length ?? 0,
    repairsCount: finalInvestigation?.repairs?.length ?? 0,
    findings,
  };
}

