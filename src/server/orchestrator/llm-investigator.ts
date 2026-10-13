/**
 * Autonomous LLM Reliability and Failure Investigation Orchestrator.
 * Executes multi-turn reasoning loops across LLM & RAG failures,
 * strictly backing all formulated hypotheses and diagnoses with immutable Evidence IDs.
 */

import { dispatchLlmDiagnosticTool } from './llm-dispatcher.ts';
import type { LlmEvaluationDataset, LlmRecord } from '../../core/domain/llm-types.ts';
import { createId, type Id } from '../../core/domain/primitives.ts';
import type {
  Evidence,
  Hypothesis,
  Diagnosis,
  VerificationExperiment,
  RepairCandidate,
} from '../../core/domain/types.ts';
import type { LlmToolCall, LlmToolResult } from '../../core/domain/llm-tool-contracts.ts';

export interface LlmInvestigationState {
  id: Id<'investigation'>;
  dataset: LlmEvaluationDataset;
  evidence: Evidence[];
  hypotheses: Hypothesis[];
  experiments: VerificationExperiment[];
  repairs: RepairCandidate[];
  diagnosis: Diagnosis | null;
  toolCalls: LlmToolCall[];
  toolResults: LlmToolResult[];
  roundsCompleted: number;
  status: 'running' | 'completed' | 'stopped';
}

/**
 * Runs a complete autonomous LLM failure investigation
 */
export async function runAutonomousLlmInvestigation(
  dataset: LlmEvaluationDataset,
  options: {
    maxRounds?: number;
    candidatePromptRecords?: LlmRecord[];
  } = {}
): Promise<LlmInvestigationState> {
  const investigationId = createId('investigation');
  const maxRounds = options.maxRounds ?? 5;

  const state: LlmInvestigationState = {
    id: investigationId,
    dataset,
    evidence: [],
    hypotheses: [],
    experiments: [],
    repairs: [],
    diagnosis: null,
    toolCalls: [],
    toolResults: [],
    roundsCompleted: 0,
    status: 'running',
  };

  // Turn 1: Compute Baseline Text Metrics
  const turn1 = dispatchLlmDiagnosticTool(
    'compute_llm_text_metrics',
    {
      records: dataset.records.map((r) => ({
        caseId: r.caseId,
        response: r.response,
        referenceAnswer: r.referenceAnswer,
      })),
    },
    { investigationId }
  );

  state.toolCalls.push(turn1.call);
  state.toolResults.push(turn1.result);
  if (turn1.evidence) state.evidence.push(...turn1.evidence);
  state.roundsCompleted++;

  const textOutput = turn1.result.output;
  const emRate = textOutput?.exactMatchRate ?? 1.0;
  const tokenF1 = textOutput?.meanTokenF1 ?? 1.0;

  // Turn 2: Formulate Failure Hypothesis based on Baseline Evidence
  const baselineEvidenceId = turn1.evidence?.[0]?.id;
  const hypId = createId('hypothesis');

  let hypothesisStatement = 'Model responses exhibit high accuracy with minimal defect rate.';
  let rootCauseType: 'RETRIEVAL_FAILURE' | 'HALLUCINATION' | 'SCHEMA_CORRUPTION' | 'ACCURATE' = 'ACCURATE';

  if (dataset.capabilities.hasRetrievedContext && emRate < 0.8) {
    hypothesisStatement = 'Low response fidelity is driven by context retrieval failure and ungrounded claims.';
    rootCauseType = 'RETRIEVAL_FAILURE';
  } else if (!dataset.capabilities.hasReferenceAnswers && dataset.capabilities.hasRetrievedContext) {
    hypothesisStatement = 'Generative responses contain unsupported factual claims not present in retrieved context.';
    rootCauseType = 'HALLUCINATION';
  } else if (dataset.capabilities.hasStructuredJsonResponses && emRate < 0.7) {
    hypothesisStatement = 'Model responses frequently violate structured JSON syntax constraints.';
    rootCauseType = 'SCHEMA_CORRUPTION';
  }

  let hypothesis: Hypothesis = {
    id: hypId,
    statement: hypothesisStatement,
    status: 'proposed',
    confidence: {
      kind: 'evidence_strength',
      level: 'moderate',
      rationale: 'Initial hypothesis formulated from baseline text evaluation metrics.',
    },
    evidence: baselineEvidenceId
      ? [
          {
            evidenceId: baselineEvidenceId,
            relationship: 'supports',
            rationale: `Baseline exact match rate (${(emRate * 100).toFixed(1)}%) indicates systematic deviation.`,
          },
        ]
      : [],
    unresolvedQuestions: ['Does retrieval failure or hallucination drive the observed drop?'],
  };
  state.hypotheses.push(hypothesis);
  state.roundsCompleted++;

  // Turn 3: Dispatched Targeted Falsification Experiment
  if (dataset.capabilities.hasRetrievedContext) {
    const turn3 = dispatchLlmDiagnosticTool(
      'check_context_attribution',
      {
        records: dataset.records.map((r) => ({
          caseId: r.caseId,
          response: r.response,
          retrievedContext: r.retrievedContext,
        })),
      },
      { investigationId }
    );

    state.toolCalls.push(turn3.call);
    state.toolResults.push(turn3.result);
    if (turn3.evidence) state.evidence.push(...turn3.evidence);

    const attrOutput = turn3.result.output;
    const unsupportedRate = attrOutput?.unsupportedClaimRate ?? 0;

    // Update hypothesis status based on experiment outcome
    if (unsupportedRate > 0.2) {
      const updatedEvidence = [...hypothesis.evidence];
      if (turn3.evidence?.[0]) {
        updatedEvidence.push({
          evidenceId: turn3.evidence[0].id,
          relationship: 'supports',
          rationale: `Detected ${attrOutput?.totalUnsupportedClaims} unsupported claims (${(unsupportedRate * 100).toFixed(1)}% rate) confirming grounding degradation.`,
        });
      }
      hypothesis = {
        ...hypothesis,
        status: 'supported',
        confidence: {
          kind: 'evidence_strength',
          level: 'strong',
          rationale: `Falsification experiment confirmed high rate of unsupported claims (${(unsupportedRate * 100).toFixed(1)}%).`,
        },
        evidence: updatedEvidence,
      };
    } else {
      hypothesis = {
        ...hypothesis,
        status: 'weakened',
        confidence: {
          kind: 'evidence_strength',
          level: 'limited',
          rationale: `Attribution analysis revealed low unsupported claim rate (${(unsupportedRate * 100).toFixed(1)}%).`,
        },
      };
    }
    state.hypotheses = [hypothesis];
    state.roundsCompleted++;
  }

  // Turn 4: Comparative Prompt Evaluation if candidate records provided
  if (options.candidatePromptRecords && options.candidatePromptRecords.length > 0) {
    const turn4 = dispatchLlmDiagnosticTool(
      'compare_prompt_versions',
      {
        baselineRecords: dataset.records,
        candidateRecords: options.candidatePromptRecords,
      },
      { investigationId }
    );

    state.toolCalls.push(turn4.call);
    state.toolResults.push(turn4.result);
    if (turn4.evidence) state.evidence.push(...turn4.evidence);
    state.roundsCompleted++;
  }

  // Turn 5: Finalize Diagnosis with Evidence IDs
  const supportedHypothesis = state.hypotheses.find((h) => h.status === 'supported') ?? state.hypotheses[0];

  state.diagnosis = {
    id: createId('diagnosis'),
    investigationId,
    status: 'completed',
    summary: `Autonomous investigation diagnosed root cause: ${supportedHypothesis.statement}`,
    confidence: supportedHypothesis.confidence,
    primaryHypothesisId: supportedHypothesis.id,
    hypothesisIds: state.hypotheses.map((h) => h.id),
    evidenceIds: state.evidence.map((e) => e.id),
    experimentIds: [],
    repairIds: [],
    comparisonIds: [],
    unresolvedQuestions: supportedHypothesis.unresolvedQuestions,
    limitations: ['Evaluation based on deterministic text and attribution heuristics.'],
  };

  state.status = 'completed';
  return state;
}
