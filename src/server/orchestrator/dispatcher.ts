import { profileEvaluationDataset } from '../../core/diagnostics/dataset-profiler.ts';
import { evaluateClassification } from '../../core/diagnostics/classification-metrics.ts';
import { runThresholdSweep } from '../../core/diagnostics/threshold-sweep.ts';
import { checkCalibration } from '../../core/diagnostics/calibration.ts';
import { scanFeatureLeakage } from '../../core/diagnostics/leakage-scanner.ts';
import { evaluateSlices } from '../../core/diagnostics/slice-evaluation.ts';
import { runDriftTests } from '../../core/diagnostics/drift-tests.ts';
import { runCounterfactualTest } from '../../core/diagnostics/counterfactual.ts';
import { generateRepairCandidate } from '../../core/diagnostics/repair-candidates.ts';
import { reEvaluateRepair } from '../../core/diagnostics/repair-reevaluation.ts';
import type { EvaluationDataset } from '../../core/diagnostics/evaluation-ingestion.ts';
import { createId, type Id } from '../../core/domain/primitives.ts';
import type {
  Evidence,
  VerificationExperiment,
  RepairCandidate,
  BeforeAfterComparison,
} from '../../core/domain/types.ts';
import {
  toolSchemas,
  diagnosticToolCallSchema,
  diagnosticToolResultSchema,
  type ToolName,
  type ToolInput,
  type ToolOutput,
  type DiagnosticToolCall,
  type DiagnosticToolResult,
} from '../../core/domain/tool-contracts.ts';

export interface DispatchToolOptions {
  investigationId: Id<'investigation'>;
  callId?: Id<'call'>;
  resultId?: Id<'result'>;
  assumptions?: readonly Evidence[];
  comparisonDataset?: EvaluationDataset;
  hypothesisId?: Id<'hypothesis'>;
  evidenceIds?: Id<'evidence'>[];
}

export interface DispatchedDiagnosticOutput {
  call: DiagnosticToolCall;
  result: DiagnosticToolResult;
  artifacts?: {
    evidence?: Evidence[];
    experiment?: VerificationExperiment;
    repair?: RepairCandidate;
    comparison?: BeforeAfterComparison;
  };
}

/**
 * Normalizes user/LLM input payloads so required dataset references default appropriately.
 */
function normalizeToolInput<N extends ToolName>(
  dataset: EvaluationDataset,
  tool: N,
  rawInput: unknown,
  options: DispatchToolOptions
): ToolInput<N> {
  const inputObj = (rawInput && typeof rawInput === 'object' ? { ...(rawInput as Record<string, unknown>) } : {}) as Record<string, unknown>;

  // Auto-fill datasetId if missing or mismatched
  if ('datasetId' in toolSchemas[tool].input && !inputObj.datasetId) {
    inputObj.datasetId = dataset.metadata.id;
  }

  // Auto-fill positiveLabel if missing
  if ('positiveLabel' in toolSchemas[tool].input && !inputObj.positiveLabel && dataset.labels) {
    inputObj.positiveLabel = dataset.labels.positive;
  }

  // Auto-fill hypothesisId if missing and available in options
  if ('hypothesisId' in toolSchemas[tool].input && !inputObj.hypothesisId && options.hypothesisId) {
    inputObj.hypothesisId = options.hypothesisId;
  }

  return inputObj as ToolInput<N>;
}

/**
 * Dispatches a typed diagnostic tool against an evaluation dataset,
 * wrapping execution safely and producing strictly conforming domain artifacts.
 */
export async function dispatchDiagnosticTool<N extends ToolName>(
  dataset: EvaluationDataset,
  tool: N,
  rawInput: unknown,
  options: DispatchToolOptions
): Promise<DispatchedDiagnosticOutput> {
  const callId = options.callId ?? createId('call');
  const resultId = options.resultId ?? createId('result');
  const requestedAt = new Date().toISOString();

  const normalizedInput = normalizeToolInput(dataset, tool, rawInput, options);

  // Validate the tool call contract
  let call: DiagnosticToolCall;
  try {
    call = diagnosticToolCallSchema.parse({
      id: callId,
      investigationId: options.investigationId,
      tool,
      toolVersion: 1,
      requestedAt,
      input: normalizedInput,
    }) as DiagnosticToolCall;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const completedAt = new Date().toISOString();
    const errorResult = diagnosticToolResultSchema.parse({
      id: resultId,
      callId,
      tool,
      toolVersion: 1,
      completedAt,
      datasetIds: [dataset.metadata.id],
      evidenceIds: [],
      limitations: ['Tool call validation error: ' + errorMsg],
      status: 'error',
      error: {
        code: 'VALIDATION_ERROR',
        message: errorMsg,
        retryable: true,
      },
    }) as DiagnosticToolResult;

    return {
      call: {
        id: callId,
        investigationId: options.investigationId,
        tool,
        toolVersion: 1,
        requestedAt,
        input: normalizedInput,
      } as DiagnosticToolCall,
      result: errorResult,
    };
  }

  try {
    const artifacts: NonNullable<DispatchedDiagnosticOutput['artifacts']> = {};
    let output: ToolOutput<N>;
    let limitations: string[] = [];

    switch (tool) {
      case 'profile_dataset': {
        output = profileEvaluationDataset(dataset, call.input as ToolInput<'profile_dataset'>) as ToolOutput<N>;
        break;
      }

      case 'compute_classification_metrics': {
        const report = evaluateClassification(dataset, call.input as ToolInput<'compute_classification_metrics'>);
        output = report.output as ToolOutput<N>;
        limitations = report.limitations;

        const metricsEvidence: Evidence = {
          id: createId('evidence'),
          kind: 'measurement',
          description: `Baseline classification metrics evaluated on ${dataset.metadata.name}: sample size ${report.output.sampleSize}.`,
          measurements: report.output.metrics,
          provenance: {
            kind: 'tool_result',
            resultId,
          },
        };
        artifacts.evidence = [metricsEvidence];
        break;
      }

      case 'threshold_sweep': {
        const report = runThresholdSweep(
          dataset,
          call.input as ToolInput<'threshold_sweep'>,
          options.assumptions ?? []
        );
        output = report.output as ToolOutput<N>;
        limitations = report.limitations;
        break;
      }

      case 'check_calibration': {
        const report = checkCalibration(dataset, call.input as ToolInput<'check_calibration'>);
        limitations = report.limitations;
        if (report.status === 'insufficient_data' || !report.output) {
          const completedAt = new Date().toISOString();
          const result = diagnosticToolResultSchema.parse({
            id: resultId,
            callId,
            tool,
            toolVersion: 1,
            completedAt,
            datasetIds: [dataset.metadata.id],
            evidenceIds: [],
            limitations,
            status: 'insufficient_data',
            error: {
              code: 'INSUFFICIENT_DATA',
              message: report.limitations[0] ?? 'Insufficient rows for calibration binning.',
              retryable: false,
            },
          }) as DiagnosticToolResult;
          return { call, result };
        }
        output = report.output as ToolOutput<N>;
        break;
      }

      case 'scan_feature_leakage': {
        const report = scanFeatureLeakage(
          dataset,
          call.input as ToolInput<'scan_feature_leakage'>,
          options.assumptions ?? []
        );
        output = report.output as ToolOutput<N>;
        limitations = report.limitations;
        break;
      }

      case 'slice_evaluation': {
        const report = evaluateSlices(dataset, call.input as ToolInput<'slice_evaluation'>);
        output = report.output as ToolOutput<N>;
        limitations = report.limitations;
        break;
      }

      case 'run_drift_tests': {
        const compDataset = options.comparisonDataset ?? dataset;
        const report = runDriftTests(dataset, compDataset, call.input as ToolInput<'run_drift_tests'>);
        output = report.output as ToolOutput<N>;
        break;
      }

      case 'run_counterfactual_test': {
        const expId = createId('experiment');
        const evId = createId('evidence');
        const cfRes = runCounterfactualTest(
          dataset,
          call.input as ToolInput<'run_counterfactual_test'>,
          { experimentId: expId, evidenceId: evId, callId }
        );
        output = cfRes.output as ToolOutput<N>;
        artifacts.experiment = cfRes.experiment;
        artifacts.evidence = [cfRes.evidence];
        break;
      }

      case 'generate_repair_candidate': {
        const genInput = call.input as ToolInput<'generate_repair_candidate'>;
        const report = generateRepairCandidate(dataset, genInput, options.assumptions ?? []);
        output = report.output as ToolOutput<N>;
        limitations = report.limitations;

        const repairEvidenceIds = options.evidenceIds && options.evidenceIds.length > 0
          ? options.evidenceIds
          : options.assumptions && options.assumptions.length > 0
          ? options.assumptions.map((a) => a.id)
          : [];

        const repair: RepairCandidate = {
          id: createId('repair'),
          hypothesisId: genInput.hypothesisId,
          kind: 'operating_policy',
          verification: 'evaluation_data',
          datasetId: dataset.metadata.id,
          policy: report.output.policy,
          criterion: genInput.criterion,
          rationale: report.output.rationale,
          evidenceIds: repairEvidenceIds,
        };
        artifacts.repair = repair;
        break;
      }

      case 're_evaluate_repair': {
        const reevalInput = call.input as ToolInput<'re_evaluate_repair'>;
        const report = reEvaluateRepair(dataset, reevalInput);
        output = report.output as ToolOutput<N>;
        limitations = report.limitations;

        const repEvidence: Evidence = {
          id: createId('evidence'),
          kind: 'measurement',
          description: report.output.rationale,
          measurements: report.output.repairedMetrics,
          provenance: {
            kind: 'tool_result',
            resultId,
          },
        };

        const comparison: BeforeAfterComparison = {
          id: createId('comparison'),
          repairId: reevalInput.repairId,
          datasetId: dataset.metadata.id,
          baselinePolicy: {
            threshold: reevalInput.baselineThreshold,
            positiveLabel: reevalInput.positiveLabel,
            comparison: 'greater_than_or_equal',
            costs: null,
          },
          afterPolicy: {
            threshold: reevalInput.repairedThreshold,
            positiveLabel: reevalInput.positiveLabel,
            comparison: 'greater_than_or_equal',
            costs: null,
          },
          baselineEvidenceIds: reevalInput.baselineEvidenceIds,
          afterEvidenceIds: [repEvidence.id],
          criterion: reevalInput.criterion,
          status: report.output.status,
          limitations: report.limitations,
        };

        artifacts.evidence = [repEvidence];
        artifacts.comparison = comparison;
        break;
      }

      default: {
        throw new Error(`Unsupported tool: ${tool as string}`);
      }
    }

    const toolResultEvidenceIds = (artifacts.evidence ?? [])
      .filter((e) => e.provenance.kind === 'tool_result' && e.provenance.resultId === resultId)
      .map((e) => e.id);

    const completedAt = new Date().toISOString();
    const result = diagnosticToolResultSchema.parse({
      id: resultId,
      callId,
      tool,
      toolVersion: 1,
      completedAt,
      datasetIds: [dataset.metadata.id],
      evidenceIds: toolResultEvidenceIds,
      limitations,
      status: 'completed',
      output,
    }) as DiagnosticToolResult;

    return {
      call,
      result,
      artifacts,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const completedAt = new Date().toISOString();
    const errorResult = diagnosticToolResultSchema.parse({
      id: resultId,
      callId,
      tool,
      toolVersion: 1,
      completedAt,
      datasetIds: [dataset.metadata.id],
      evidenceIds: [],
      limitations: ['Diagnostic tool runtime failure: ' + errorMsg],
      status: 'error',
      error: {
        code: 'EXECUTION_ERROR',
        message: errorMsg,
        retryable: false,
      },
    }) as DiagnosticToolResult;

    return {
      call,
      result: errorResult,
    };
  }
}
