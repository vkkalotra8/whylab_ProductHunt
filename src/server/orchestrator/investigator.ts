import {
  createDraftInvestigation,
  addSourceAndDataset,
  transitionToRunning,
  recordToolCall,
  recordToolResult,
  recordHypothesis,
  recordExperiment,
  recordRepairCandidate,
  recordComparison,
  finalizeInvestigationWithDiagnosis,
  deriveInvestigationStage,
} from '../../core/investigation/state-machine.ts';
import { saveInvestigation } from '../../core/investigation/store.ts';
import { createId, type Id } from '../../core/domain/primitives.ts';
import type {
  Investigation,
  Evidence,
  Hypothesis,
  VerificationExperiment,
  RepairCandidate,
  BeforeAfterComparison,
  Diagnosis,
  Source,
} from '../../core/domain/types.ts';
import { toolNames, type DiagnosticToolCall, type DiagnosticToolResult } from '../../core/domain/tool-contracts.ts';
import type { EvaluationDataset } from '../../core/diagnostics/evaluation-ingestion.ts';
import { runThresholdSweep } from '../../core/diagnostics/threshold-sweep.ts';
import { dispatchDiagnosticTool } from './dispatcher.ts';
import type { InvestigatorProvider, InvestigatorHistoryEntry, TokenUsage } from './provider.ts';
import { OfflineInvestigatorProvider } from './provider-offline.ts';
import { OpenAIInvestigatorProvider } from './provider-openai.ts';
import { resolveInvestigatorProvider } from './provider-factory.ts';

export interface InvestigatorOptions {
  investigationId?: Id<'investigation'>;
  provider?: InvestigatorProvider;
  offlineOnly?: boolean;
  objective?: string;
  maxRounds?: number;
  maxToolCalls?: number;
  maxConsecutiveErrors?: number;
  timeoutMs?: number;
  userDirectives?: string[];
  signal?: AbortSignal;
}

export type InvestigationEventMessage =
  | { type: 'started'; investigationId: string; objective: string; provider?: string; model?: string }
  | { type: 'progress'; round: number; maxRounds: number; stage: string; message: string; usage?: TokenUsage }
  | { type: 'directive_injected'; directive: string }
  | { type: 'tool_call'; call: DiagnosticToolCall; rationale: string }
  | { type: 'tool_result'; result: DiagnosticToolResult }
  | { type: 'evidence_added'; evidence: Evidence }
  | { type: 'hypothesis_added'; hypothesis: Hypothesis }
  | { type: 'experiment_added'; experiment: VerificationExperiment }
  | { type: 'repair_added'; repair: RepairCandidate }
  | { type: 'comparison_added'; comparison: BeforeAfterComparison }
  | { type: 'diagnosis_finalized'; diagnosis: Diagnosis }
  | { type: 'completed'; investigation: Investigation; provider?: string; model?: string; usage?: TokenUsage }
  | { type: 'stopped'; reason: string; investigation: Investigation }
  | { type: 'error'; code: string; message: string; fatal: boolean };

/**
 * Executes an autonomous, multi-turn investigation driven by Astra with strict boundaries.
 * Yields real-time events as an asynchronous generator.
 */
export async function* runAutonomousInvestigation(
  dataset: EvaluationDataset,
  options: InvestigatorOptions = {}
): AsyncGenerator<InvestigationEventMessage, Investigation, void> {
  const maxRounds = options.maxRounds ?? 16;
  const maxToolCalls = options.maxToolCalls ?? 10;
  const maxConsecutiveErrors = options.maxConsecutiveErrors ?? 3;
  const timeoutMs = options.timeoutMs ?? 120_000;

  // Select provider: options.provider -> options.offlineOnly -> factory resolution (gemini -> openai -> offline)
  const provider = resolveInvestigatorProvider(options);

  // Initialize draft investigation
  const objective =
    options.objective ??
    `Investigate reliability risks and performance degradation on ${dataset.metadata.name}.`;

  let investigation = createDraftInvestigation(objective);
  if (options.investigationId) {
    investigation = { ...investigation, id: options.investigationId };
  }

  const source: Source = {
    id: dataset.metadata.sourceId,
    kind: 'uploaded_file',
    name: dataset.metadata.name,
    capturedAt: new Date().toISOString(),
    contentDigest: null,
  };

  investigation = addSourceAndDataset(investigation, source, dataset.metadata);
  investigation = transitionToRunning(investigation);

  yield {
    type: 'started',
    investigationId: investigation.id,
    objective: investigation.objective,
    provider: provider.name,
    model: provider.model,
  };

  const history: InvestigatorHistoryEntry[] = [];
  const userDirectives: string[] = options.userDirectives ? [...options.userDirectives] : [];
  let toolCallCount = 0;
  let consecutiveErrors = 0;

  const startTime = Date.now();

  for (let round = 1; round <= maxRounds; round++) {
    // Check timeout boundary
    if (Date.now() - startTime > timeoutMs) {
      investigation = {
        ...investigation,
        status: 'stopped',
        stopReason: `Execution timeout exceeded (${timeoutMs}ms).`,
        updatedAt: new Date().toISOString(),
      };
      saveInvestigation(investigation);
      yield {
        type: 'stopped',
        reason: 'Investigation timed out.',
        investigation,
      };
      return investigation;
    }

    // Check external abort signal
    if (options.signal?.aborted) {
      investigation = {
        ...investigation,
        status: 'stopped',
        stopReason: 'Investigation aborted by user.',
        updatedAt: new Date().toISOString(),
      };
      saveInvestigation(investigation);
      yield {
        type: 'stopped',
        reason: 'User aborted investigation.',
        investigation,
      };
      return investigation;
    }

    const currentStage = deriveInvestigationStage(investigation);

    yield {
      type: 'progress',
      round,
      maxRounds,
      stage: currentStage,
      message: `Round ${round}/${maxRounds} (Stage: ${currentStage.toUpperCase()}) - Astra reasoning...`,
    };

    // Ask provider for next step
    const response = await provider.nextStep({
      investigation,
      dataset,
      currentRound: round,
      maxRounds,
      userDirectives,
      history,
      availableTools: toolNames,
    });

    if (response.action === 'propose_hypothesis') {
      const hypothesis: Hypothesis = {
        id: createId('hypothesis'),
        statement: response.statement,
        status: 'proposed',
        confidence: {
          kind: 'evidence_strength',
          level: response.confidenceLevel,
          rationale: response.confidenceRationale,
        },
        evidence: investigation.evidence.map((e) => ({
          evidenceId: e.id,
          relationship: 'supports' as const,
          rationale: response.confidenceRationale,
        })),
        unresolvedQuestions: [],
      };

      investigation = recordHypothesis(investigation, hypothesis);
      history.push({
        round,
        timestamp: new Date().toISOString(),
        kind: 'hypothesis',
        data: { hypothesis },
      });

      yield {
        type: 'hypothesis_added',
        hypothesis,
      };
    } else if (response.action === 'call_tool') {
      if (toolCallCount >= maxToolCalls) {
        yield {
          type: 'error',
          code: 'TOOL_LIMIT_REACHED',
          message: `Reached maximum permitted tool invocations (${maxToolCalls}).`,
          fatal: false,
        };
        break;
      }

      toolCallCount++;

      yield {
        type: 'progress',
        round,
        maxRounds,
        stage: currentStage,
        message: `Executing diagnostic tool '${response.tool}'...`,
      };

      const dispatchResult = await dispatchDiagnosticTool(dataset, response.tool, response.input, {
        investigationId: investigation.id,
        hypothesisId: investigation.hypotheses[0]?.id,
        evidenceIds: investigation.evidence.map((e) => e.id),
      });

      const { call, result, artifacts } = dispatchResult;

      investigation = recordToolCall(investigation, call);

      const toolEvidence = (artifacts?.evidence ?? []).filter(
        (e) => e.provenance.kind === 'tool_result'
      );
      investigation = recordToolResult(investigation, result, toolEvidence);

      history.push({
        round,
        timestamp: new Date().toISOString(),
        kind: 'tool_call',
        data: { call },
      });

      yield {
        type: 'tool_call',
        call,
        rationale: response.rationale,
      };

      history.push({
        round,
        timestamp: new Date().toISOString(),
        kind: 'tool_result',
        data: { result },
      });

      yield {
        type: 'tool_result',
        result,
      };

      if (artifacts?.evidence) {
        for (const ev of artifacts.evidence) {
          yield {
            type: 'evidence_added',
            evidence: ev,
          };
        }
      }

      if (artifacts?.experiment) {
        const expEvidence = (artifacts?.evidence ?? []).find(
          (e) => e.provenance.kind === 'experiment'
        );
        investigation = recordExperiment(investigation, artifacts.experiment, expEvidence);
        history.push({
          round,
          timestamp: new Date().toISOString(),
          kind: 'experiment',
          data: { experiment: artifacts.experiment },
        });
        yield {
          type: 'experiment_added',
          experiment: artifacts.experiment,
        };

        const matchingHyp = investigation.hypotheses.find((h) => h.id === artifacts.experiment!.hypothesisId);
        if (matchingHyp && expEvidence) {
          const outcomeRel = artifacts.experiment.outcome === 'supports' ? 'supports' as const : artifacts.experiment.outcome === 'rejects' ? 'rejects' as const : 'weakens' as const;
          const updatedHyp: Hypothesis = {
            ...matchingHyp,
            status: artifacts.experiment.outcome === 'supports' ? 'supported' : artifacts.experiment.outcome === 'rejects' ? 'rejected' : matchingHyp.status,
            confidence: {
              kind: 'evidence_strength',
              level: artifacts.experiment.outcome === 'supports' ? 'strong' : 'limited',
              rationale: artifacts.experiment.prediction,
            },
            evidence: [
              ...matchingHyp.evidence,
              {
                evidenceId: expEvidence.id,
                relationship: outcomeRel,
                rationale: artifacts.experiment.prediction,
              },
            ],
          };
          investigation = recordHypothesis(investigation, updatedHyp);
        }
      }

      if (artifacts?.repair) {
        investigation = recordRepairCandidate(investigation, artifacts.repair);

        // Guarantee dataset-derived threshold sweep curves exist for this investigation
        if (
          dataset.metadata.probabilityColumn !== null &&
          !investigation.toolResults.some((r) => r.tool === 'threshold_sweep' && r.status === 'completed')
        ) {
          try {
            const thresholds101 = Array.from({ length: 101 }, (_, i) => Math.round(i) / 100);
            const sweepReport = runThresholdSweep(dataset, {
              datasetId: dataset.metadata.id,
              positiveLabel: dataset.labels?.positive ?? '1',
              thresholds: thresholds101,
              costs: null,
            });
            const sweepCallId = createId('call');
            const sweepResId = createId('result');
            const sweepNow = new Date().toISOString();
            const sweepCall: DiagnosticToolCall = {
              id: sweepCallId,
              investigationId: investigation.id,
              tool: 'threshold_sweep',
              toolVersion: 1,
              requestedAt: sweepNow,
              input: {
                datasetId: dataset.metadata.id,
                positiveLabel: dataset.labels?.positive ?? '1',
                thresholds: thresholds101,
                costs: null,
              },
            };
            const sweepResult: DiagnosticToolResult = {
              id: sweepResId,
              callId: sweepCallId,
              tool: 'threshold_sweep',
              toolVersion: 1,
              completedAt: sweepNow,
              datasetIds: [dataset.metadata.id],
              evidenceIds: [],
              limitations: sweepReport.limitations,
              status: 'completed',
              output: sweepReport.output,
            };
            investigation = recordToolCall(investigation, sweepCall);
            investigation = recordToolResult(investigation, sweepResult, []);
          } catch (sweepErr) {
            console.warn('Dataset threshold sweep auto-recording deferred:', sweepErr);
          }
        }

        history.push({
          round,
          timestamp: new Date().toISOString(),
          kind: 'repair',
          data: { repair: artifacts.repair },
        });
        yield {
          type: 'repair_added',
          repair: artifacts.repair,
        };
      }

      if (artifacts?.comparison) {
        investigation = recordComparison(investigation, artifacts.comparison);
        history.push({
          round,
          timestamp: new Date().toISOString(),
          kind: 'comparison',
          data: { comparison: artifacts.comparison },
        });
        yield {
          type: 'comparison_added',
          comparison: artifacts.comparison,
        };
      }

      if (result.status === 'error') {
        consecutiveErrors++;
        yield {
          type: 'error',
          code: result.error.code,
          message: result.error.message,
          fatal: consecutiveErrors >= maxConsecutiveErrors,
        };

        if (consecutiveErrors >= maxConsecutiveErrors) {
          investigation = {
            ...investigation,
            status: 'failed',
            stopReason: `Aborted due to ${consecutiveErrors} consecutive tool execution errors.`,
            updatedAt: new Date().toISOString(),
          };
          saveInvestigation(investigation);
          yield {
            type: 'stopped',
            reason: `Aborted: exceeded maximum consecutive tool errors (${maxConsecutiveErrors}).`,
            investigation,
          };
          return investigation;
        }
      } else {
        consecutiveErrors = 0;
      }
    } else if (response.action === 'conclude') {
      const primaryHypId = response.primaryHypothesisId ?? investigation.hypotheses[0]?.id ?? null;

      const diagnosis: Diagnosis = {
        id: createId('diagnosis'),
        investigationId: investigation.id,
        status: 'completed',
        summary: response.summary,
        evidenceIds: investigation.evidence.map((e) => e.id),
        hypothesisIds: investigation.hypotheses.map((h) => h.id),
        primaryHypothesisId: primaryHypId,
        confidence: {
          kind: 'evidence_strength',
          level: response.confidenceLevel ?? 'moderate',
          rationale: response.confidenceRationale ?? 'Diagnosis formulated from verified diagnostic findings.',
        },
        experimentIds: investigation.experiments.map((e) => e.id),
        repairIds: investigation.repairs.map((r) => r.id),
        comparisonIds: investigation.comparisons.map((c) => c.id),
        unresolvedQuestions: [],
        limitations: response.limitations ?? [],
      };

      investigation = finalizeInvestigationWithDiagnosis(investigation, diagnosis);
      saveInvestigation(investigation);

      yield {
        type: 'diagnosis_finalized',
        diagnosis,
      };

      yield {
        type: 'completed',
        investigation,
        provider: provider.name,
        model: provider.model,
        usage: provider.getCumulativeUsage ? provider.getCumulativeUsage() : undefined,
      };

      return investigation;
    }
  }

  // If loop exited without explicit conclusion, finalize with inconclusive diagnosis
  const fallbackDiagnosis: Diagnosis = {
    id: createId('diagnosis'),
    investigationId: investigation.id,
    status: 'inconclusive',
    summary: 'Autonomous investigation reached round limit before confirming final diagnosis.',
    evidenceIds: investigation.evidence.map((e) => e.id),
    hypothesisIds: investigation.hypotheses.map((h) => h.id),
    primaryHypothesisId: investigation.hypotheses[0]?.id ?? null,
    confidence: {
      kind: 'evidence_strength',
      level: 'limited',
      rationale: 'Investigation stopped at round limit.',
    },
    experimentIds: investigation.experiments.map((e) => e.id),
    repairIds: investigation.repairs.map((r) => r.id),
    comparisonIds: investigation.comparisons.map((c) => c.id),
    unresolvedQuestions: ['Additional diagnostic runs required.'],
    limitations: ['Incomplete investigation cycle.'],
  };

  investigation = finalizeInvestigationWithDiagnosis(investigation, fallbackDiagnosis);
  saveInvestigation(investigation);

  yield {
    type: 'diagnosis_finalized',
    diagnosis: fallbackDiagnosis,
  };

  yield {
    type: 'completed',
    investigation,
    provider: provider.name,
    model: provider.model,
    usage: provider.getCumulativeUsage ? provider.getCumulativeUsage() : undefined,
  };

  return investigation;
}
