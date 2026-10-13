import { createId, type Id } from '../domain/primitives.ts';
import type {
  Investigation,
  Source,
  DatasetMetadata,
  Evidence,
  Hypothesis,
  VerificationExperiment,
  RepairCandidate,
  BeforeAfterComparison,
  Diagnosis,
  InvestigationEvent,
} from '../domain/types.ts';
import type { DiagnosticToolCall, DiagnosticToolResult } from '../domain/tool-contracts.ts';
import { validateInvestigation } from '../domain/validation.ts';

export class InvestigationInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvestigationInvariantError';
  }
}

export type InvestigationStage =
  | 'ingest'
  | 'profile'
  | 'investigate'
  | 'verify'
  | 'repair'
  | 'report';

export class InvalidStateTransitionError extends Error {
  readonly currentStatus: string;
  readonly attemptedAction: string;

  constructor(currentStatus: string, attemptedAction: string, reason: string) {
    super(`Cannot execute '${attemptedAction}' when investigation is in '${currentStatus}' status: ${reason}`);
    this.name = 'InvalidStateTransitionError';
    this.currentStatus = currentStatus;
    this.attemptedAction = attemptedAction;
  }
}

/**
 * Deterministically derives the current progress stage of an investigation
 * from its immutable evidence and artifact graph.
 */
export function deriveInvestigationStage(inv: Investigation): InvestigationStage {
  if (!inv || !inv.datasets || inv.datasets.length === 0) {
    return 'ingest';
  }
  const evidence = inv.evidence || [];
  const toolResults = inv.toolResults || [];
  const hasBaselineEvidence = evidence.some(
    (e) =>
      e.provenance?.kind === 'tool_result' &&
      toolResults.some(
        (r) =>
          r.id === (e.provenance as { resultId: Id<'result'> }).resultId &&
          ((r.tool as string) === 'compute_classification_metrics' ||
            (r.tool as string) === 'profile_dataset' ||
            (r.tool as string) === 'scan_feature_leakage' ||
            (r.tool as string) === 'evaluate_text_metrics' ||
            (r.tool as string) === 'evaluate_rag_attribution' ||
            (r.tool as string) === 'audit_image_quality' ||
            (r.tool as string) === 'detect_exact_duplicates')
      )
  );
  if (!hasBaselineEvidence) {
    return 'profile';
  }
  if (inv.status === 'completed' && inv.diagnosis !== null) {
    return 'report';
  }
  if (!inv.hypotheses || inv.hypotheses.length === 0) {
    return 'investigate';
  }
  if (!inv.experiments || inv.experiments.length === 0) {
    return 'verify';
  }
  if (!inv.comparisons || inv.comparisons.length === 0) {
    return 'repair';
  }
  return 'report';
}

/**
 * Creates a new draft investigation aggregate with default settings.
 */
export function createDraftInvestigation(objective = 'Investigate potential model performance failures and reliability risks.'): Investigation {
  const now = new Date().toISOString();
  return {
    schemaVersion: 2,
    id: createId('investigation'),
    objective,
    status: 'draft',
    stopReason: null,
    createdAt: now,
    updatedAt: now,
    sources: [],
    datasets: [],
    evidence: [],
    toolCalls: [],
    toolResults: [],
    hypotheses: [],
    experiments: [],
    repairs: [],
    comparisons: [],
    events: [],
    diagnosis: null,
  };
}

function appendEvent(
  inv: Investigation,
  kind: InvestigationEvent['kind'],
  entityId: InvestigationEvent['entityId'],
  message: string
): InvestigationEvent[] {
  const event: InvestigationEvent = {
    id: createId('event'),
    sequence: inv.events.length + 1,
    at: new Date().toISOString(),
    kind,
    entityId,
    message,
  };
  return [...inv.events, event];
}

/**
 * Transitions an investigation to 'running'.
 */
export function transitionToRunning(inv: Investigation): Investigation {
  if (inv.status !== 'draft' && inv.status !== 'running') {
    throw new InvalidStateTransitionError(inv.status, 'transitionToRunning', 'Only draft or already running investigations can be run.');
  }
  return {
    ...inv,
    status: 'running',
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Adds an evaluation source and dataset metadata to the investigation.
 */
export function addSourceAndDataset(
  inv: Investigation,
  source: Source,
  dataset: DatasetMetadata
): Investigation {
  if (inv.status === 'completed' || inv.status === 'failed' || inv.status === 'stopped') {
    throw new InvalidStateTransitionError(inv.status, 'addSourceAndDataset', 'Cannot add datasets to a finalized investigation.');
  }
  const events = appendEvent(
    inv,
    'dataset_registered',
    dataset.id,
    `Dataset '${dataset.name}' (${dataset.rowCount} rows) registered from source '${source.name}'.`
  );
  return {
    ...inv,
    sources: [...inv.sources, source],
    datasets: [...inv.datasets, dataset],
    events,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Records a diagnostic tool invocation call.
 */
export function recordToolCall(
  inv: Investigation,
  call: DiagnosticToolCall
): Investigation {
  if (inv.status === 'completed' || inv.status === 'failed' || inv.status === 'stopped') {
    throw new InvalidStateTransitionError(inv.status, 'recordToolCall', 'Cannot dispatch tools in a finalized investigation.');
  }
  const events = appendEvent(
    inv,
    'tool_requested',
    call.id,
    `Diagnostic tool '${call.tool}' requested.`
  );
  return {
    ...inv,
    toolCalls: [...inv.toolCalls, call],
    events,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Records the completed result of a diagnostic tool call and optional resulting evidence items.
 */
export function recordToolResult(
  inv: Investigation,
  result: DiagnosticToolResult,
  resultingEvidence: Evidence[] = []
): Investigation {
  if (inv.status === 'completed' || inv.status === 'failed' || inv.status === 'stopped') {
    throw new InvalidStateTransitionError(inv.status, 'recordToolResult', 'Cannot record tool results in a finalized investigation.');
  }
  const matchingCall = inv.toolCalls.find((c) => c.id === result.callId);
  if (!matchingCall) {
    throw new InvestigationInvariantError(
      `Tool result ${result.id} references call ${result.callId} which does not exist in the investigation.`
    );
  }
  const events = appendEvent(
    inv,
    'tool_completed',
    result.id,
    `Diagnostic tool '${result.tool}' completed with ${resultingEvidence.length} evidence observation(s).`
  );
  return {
    ...inv,
    toolResults: [...inv.toolResults, result],
    evidence: [...inv.evidence, ...resultingEvidence],
    events,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Records a new or updated hypothesis.
 */
export function recordHypothesis(
  inv: Investigation,
  hypothesis: Hypothesis
): Investigation {
  if (inv.status === 'completed' || inv.status === 'failed' || inv.status === 'stopped') {
    throw new InvalidStateTransitionError(inv.status, 'recordHypothesis', 'Cannot update hypotheses in a finalized investigation.');
  }
  const existingIdx = inv.hypotheses.findIndex((h) => h.id === hypothesis.id);
  const updatedHypotheses = existingIdx >= 0
    ? inv.hypotheses.map((h, i) => (i === existingIdx ? hypothesis : h))
    : [...inv.hypotheses, hypothesis];

  const events = appendEvent(
    inv,
    'hypothesis_updated',
    hypothesis.id,
    `Hypothesis '${hypothesis.statement}' marked as ${hypothesis.status}.`
  );
  return {
    ...inv,
    hypotheses: updatedHypotheses,
    events,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Records a verification falsification experiment and resulting evidence.
 */
export function recordExperiment(
  inv: Investigation,
  experiment: VerificationExperiment,
  resultingEvidence?: Evidence
): Investigation {
  if (inv.status === 'completed' || inv.status === 'failed' || inv.status === 'stopped') {
    throw new InvalidStateTransitionError(inv.status, 'recordExperiment', 'Cannot run experiments in a finalized investigation.');
  }
  const events = appendEvent(
    inv,
    'experiment_completed',
    experiment.id,
    `Verification experiment completed with outcome: ${experiment.outcome}.`
  );
  return {
    ...inv,
    experiments: [...inv.experiments, experiment],
    evidence: resultingEvidence ? [...inv.evidence, resultingEvidence] : inv.evidence,
    events,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Records a repair candidate policy.
 */
export function recordRepairCandidate(
  inv: Investigation,
  repair: RepairCandidate
): Investigation {
  if (inv.status === 'completed' || inv.status === 'failed' || inv.status === 'stopped') {
    throw new InvalidStateTransitionError(inv.status, 'recordRepairCandidate', 'Cannot propose repairs in a finalized investigation.');
  }
  const desc =
    repair.kind === 'operating_policy'
      ? `threshold ${repair.policy.threshold}`
      : repair.recommendation;
  const events = appendEvent(
    inv,
    'repair_proposed',
    repair.id,
    `Repair candidate proposed: ${desc} (${repair.kind}).`
  );
  return {
    ...inv,
    repairs: [...inv.repairs, repair],
    events,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Records a before-vs-after comparison re-evaluation.
 */
export function recordComparison(
  inv: Investigation,
  comparison: BeforeAfterComparison
): Investigation {
  if (inv.status === 'completed' || inv.status === 'failed' || inv.status === 'stopped') {
    throw new InvalidStateTransitionError(inv.status, 'recordComparison', 'Cannot record comparisons in a finalized investigation.');
  }
  const events = appendEvent(
    inv,
    'comparison_completed',
    comparison.id,
    `Before-vs-after re-evaluation completed with status: ${comparison.status}.`
  );
  return {
    ...inv,
    comparisons: [...inv.comparisons, comparison],
    events,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Records structured diagnosis and completes the investigation.
 */
export function finalizeInvestigationWithDiagnosis(
  inv: Investigation,
  diagnosis: Diagnosis
): Investigation {
  if (inv.status === 'completed' || inv.status === 'failed' || inv.status === 'stopped') {
    throw new InvalidStateTransitionError(inv.status, 'finalizeInvestigationWithDiagnosis', 'Investigation is already finalized.');
  }
  const events = appendEvent(
    inv,
    'investigation_completed',
    inv.id,
    `Investigation completed with diagnosis: ${diagnosis.summary}`
  );
  const finalized: Investigation = {
    ...inv,
    status: 'completed',
    diagnosis,
    events,
    updatedAt: new Date().toISOString(),
  };
  // Validate complete integrity
  validateInvestigation(finalized);
  return finalized;
}

/**
 * Fails the investigation with an explicit reason.
 */
export function failInvestigation(
  inv: Investigation,
  reason: string
): Investigation {
  const events = appendEvent(
    inv,
    'investigation_failed',
    inv.id,
    `Investigation failed: ${reason}`
  );
  return {
    ...inv,
    status: 'failed',
    stopReason: reason,
    events,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Gracefully stops the investigation.
 */
export function stopInvestigation(
  inv: Investigation,
  reason: string
): Investigation {
  return {
    ...inv,
    status: 'stopped',
    stopReason: reason,
    updatedAt: new Date().toISOString(),
  };
}
