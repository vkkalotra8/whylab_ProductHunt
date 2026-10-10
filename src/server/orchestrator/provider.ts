import type { Investigation, Hypothesis, VerificationExperiment, RepairCandidate, BeforeAfterComparison } from '../../core/domain/types.ts';
import type { EvaluationDataset } from '../../core/diagnostics/evaluation-ingestion.ts';
import type { ToolName, DiagnosticToolCall, DiagnosticToolResult } from '../../core/domain/tool-contracts.ts';

export interface InvestigatorHistoryEntry {
  round: number;
  timestamp: string;
  kind: 'tool_call' | 'tool_result' | 'user_directive' | 'hypothesis' | 'experiment' | 'repair' | 'comparison';
  data:
    | { call: DiagnosticToolCall }
    | { result: DiagnosticToolResult }
    | { directive: string }
    | { hypothesis: Hypothesis }
    | { experiment: VerificationExperiment }
    | { repair: RepairCandidate }
    | { comparison: BeforeAfterComparison };
}

export interface ProviderTurnRequest {
  investigation: Investigation;
  dataset: EvaluationDataset;
  currentRound: number;
  maxRounds: number;
  userDirectives: readonly string[];
  history: readonly InvestigatorHistoryEntry[];
  availableTools: readonly ToolName[];
}

export type ProviderTurnResponse =
  | {
      action: 'propose_hypothesis';
      statement: string;
      confidenceLevel: 'unassessed' | 'limited' | 'moderate' | 'strong';
      confidenceRationale: string;
    }
  | {
      action: 'call_tool';
      tool: ToolName;
      input: Record<string, unknown>;
      rationale: string;
    }
  | {
      action: 'conclude';
      rootCause: string;
      summary: string;
      primaryHypothesisId?: import('../../core/domain/primitives.ts').Id<'hypothesis'>;
      confidenceLevel: 'unassessed' | 'limited' | 'moderate' | 'strong';
      confidenceRationale: string;
      limitations: string[];
    };

export interface InvestigatorProvider {
  readonly name: string;
  nextStep(request: ProviderTurnRequest): Promise<ProviderTurnResponse>;
}
