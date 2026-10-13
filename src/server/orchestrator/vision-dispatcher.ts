/**
 * Computer Vision Diagnostic Tool Dispatcher.
 * Executes allowlisted deterministic vision tools, enforces typed contracts,
 * and produces immutable Evidence artifacts with evidence IDs.
 */

import { evaluateMulticlassVisionMetrics } from '../../core/diagnostics/vision/multiclass-metrics.ts';
import { summarizeQualityDistribution } from '../../core/diagnostics/vision/image-quality.ts';
import { scanCrossSplitLeakage } from '../../core/diagnostics/vision/leakage-detector.ts';
import { detectVisionCohortDrift } from '../../core/diagnostics/vision/quality-drift.ts';
import { detectShortcutLearning } from '../../core/diagnostics/vision/shortcut-detector.ts';
import { createId, type Id, type Measurement } from '../../core/domain/primitives.ts';
import type { Evidence } from '../../core/domain/types.ts';
import type {
  VisionToolName,
  VisionToolCall,
  VisionToolResult,
  VisionToolInputMap,
  VisionToolOutputMap,
} from '../../core/domain/vision-tool-contracts.ts';

export interface DispatchVisionToolOptions {
  investigationId?: Id<'investigation'>;
  callId?: Id<'call'>;
  resultId?: Id<'result'>;
}

export interface DispatchedVisionOutput<N extends VisionToolName = VisionToolName> {
  call: VisionToolCall<N>;
  result: VisionToolResult<N>;
  evidence?: Evidence[];
}

export function dispatchVisionDiagnosticTool<N extends VisionToolName>(
  tool: N,
  input: VisionToolInputMap[N],
  options: DispatchVisionToolOptions = {}
): DispatchedVisionOutput<N> {
  const investigationId = options.investigationId ?? createId('investigation');
  const callId = options.callId ?? createId('call');
  const resultId = options.resultId ?? createId('result');
  const now = new Date().toISOString();

  const call: VisionToolCall<N> = {
    id: callId,
    investigationId,
    tool,
    toolVersion: 1,
    requestedAt: now,
    input,
  };

  try {
    let output: VisionToolOutputMap[N];
    const evidenceList: Evidence[] = [];
    const evidenceId = createId('evidence');

    switch (tool) {
      case 'compute_multiclass_metrics': {
        const inp = input as VisionToolInputMap['compute_multiclass_metrics'];
        const res = evaluateMulticlassVisionMetrics(inp.records, inp.knownClasses).metrics;
        output = res as VisionToolOutputMap[N];

        const measurements: Measurement[] = [
          {
            name: 'overall_accuracy',
            status: 'measured',
            value: res.overallAccuracy,
            unit: 'ratio',
            sampleSize: res.totalSamples,
          },
          {
            name: 'macro_f1',
            status: 'measured',
            value: res.macroF1,
            unit: 'ratio',
            sampleSize: res.totalSamples,
          },
          {
            name: 'weighted_f1',
            status: 'measured',
            value: res.weightedF1,
            unit: 'ratio',
            sampleSize: res.totalSamples,
          },
        ];

        evidenceList.push({
          id: evidenceId,
          kind: 'measurement',
          description: `Multiclass metrics: Accuracy ${(res.overallAccuracy * 100).toFixed(1)}%, Macro F1 ${(res.macroF1 * 100).toFixed(1)}% across ${res.totalSamples} images with ${res.highConfidenceErrorCount} overconfident failures.`,
          measurements,
          provenance: {
            kind: 'tool_result',
            resultId,
          },
        });
        break;
      }

      case 'profile_image_quality': {
        const inp = input as VisionToolInputMap['profile_image_quality'];
        const res = summarizeQualityDistribution(inp.profiles, inp.blurThreshold);
        output = res as VisionToolOutputMap[N];

        const measurements: Measurement[] = [
          {
            name: 'mean_sharpness',
            status: 'measured',
            value: res.meanSharpness,
            unit: 'feature_units',
            sampleSize: res.sampleCount,
          },
          {
            name: 'blurry_image_rate',
            status: 'measured',
            value: res.blurryImageRate,
            unit: 'ratio',
            sampleSize: res.sampleCount,
          },
        ];

        evidenceList.push({
          id: evidenceId,
          kind: 'measurement',
          description: `Image quality profile: Mean Laplacian sharpness ${res.meanSharpness.toFixed(1)}, Blurry images ${res.blurryImageCount} (${(res.blurryImageRate * 100).toFixed(1)}% of cohort).`,
          measurements,
          provenance: {
            kind: 'tool_result',
            resultId,
          },
        });
        break;
      }

      case 'scan_perceptual_leakage': {
        const inp = input as VisionToolInputMap['scan_perceptual_leakage'];
        const res = scanCrossSplitLeakage(inp.records, {
          hammingThreshold: inp.hammingThreshold,
          trainSplitName: inp.trainSplitName,
          evalSplitNames: inp.evalSplitNames,
        });
        output = res as VisionToolOutputMap[N];

        const measurements: Measurement[] = [
          {
            name: 'leaked_image_rate',
            status: 'measured',
            value: res.leakedImageRate,
            unit: 'ratio',
            sampleSize: res.totalEvalImagesScanned,
          },
          {
            name: 'leakage_inflation_gap',
            status: 'measured',
            value: res.leakageInflationGap,
            unit: 'percentage_points',
            sampleSize: res.totalEvalImagesScanned,
          },
          {
            name: 'leaked_accuracy',
            status: 'measured',
            value: res.leakedAccuracy,
            unit: 'ratio',
            sampleSize: res.leakedImageCount,
          },
          {
            name: 'clean_accuracy',
            status: 'measured',
            value: res.cleanAccuracy,
            unit: 'ratio',
            sampleSize: res.totalEvalImagesScanned - res.leakedImageCount,
          },
        ];

        evidenceList.push({
          id: evidenceId,
          kind: 'measurement',
          description: `Perceptual near-duplicate scan detected ${res.leakedImageCount} leaked evaluation images (${(res.leakedImageRate * 100).toFixed(1)}%). Leaked accuracy ${(res.leakedAccuracy * 100).toFixed(1)}% vs clean ${(res.cleanAccuracy * 100).toFixed(1)}% (+${(res.leakageInflationGap * 100).toFixed(1)} pp inflation).`,
          measurements,
          provenance: {
            kind: 'tool_result',
            resultId,
          },
        });
        break;
      }

      case 'detect_quality_drift': {
        const inp = input as VisionToolInputMap['detect_quality_drift'];
        const res = detectVisionCohortDrift(inp.records, {
          cohortAIdentifier: inp.cohortAIdentifier,
          cohortBIdentifier: inp.cohortBIdentifier,
          cohortField: inp.cohortField,
        });
        output = res as VisionToolOutputMap[N];

        const sh = res.metrics.sharpness;
        const measurements: Measurement[] = [
          {
            name: 'sharpness_ks_statistic',
            status: 'measured',
            value: sh.ksStatistic,
            unit: 'ratio',
            sampleSize: sh.sampleSizeA + sh.sampleSizeB,
          },
          {
            name: 'sharpness_psi',
            status: 'measured',
            value: sh.psi,
            unit: 'unitless',
            sampleSize: sh.sampleSizeA + sh.sampleSizeB,
          },
          {
            name: 'sharpness_delta',
            status: 'measured',
            value: Math.abs(sh.deltaMean),
            unit: 'feature_units',
            sampleSize: sh.sampleSizeA + sh.sampleSizeB,
          },
        ];

        evidenceList.push({
          id: evidenceId,
          kind: 'measurement',
          description: `Acquisition drift analysis between ${res.cohortAName} and ${res.cohortBName}: Sharpness KS ${sh.ksStatistic.toFixed(3)}, PSI ${sh.psi.toFixed(2)}, Shift level: ${sh.shiftLevel}.`,
          measurements,
          provenance: {
            kind: 'tool_result',
            resultId,
          },
        });
        break;
      }

      case 'scan_shortcut_bias': {
        const inp = input as VisionToolInputMap['scan_shortcut_bias'];
        const res = detectShortcutLearning(inp.records, {
          shortcutKey: inp.shortcutKey,
          positiveLabel: inp.positiveLabel,
        });
        output = res as VisionToolOutputMap[N];

        const measurements: Measurement[] = [
          {
            name: 'recall_collapse_delta',
            status: 'measured',
            value: res.recallCollapseDelta,
            unit: 'percentage_points',
            sampleSize: res.totalEvaluatedRecords,
          },
          {
            name: 'shortcut_odds_ratio',
            status: 'measured',
            value: res.oddsRatio,
            unit: 'unitless',
            sampleSize: res.totalEvaluatedRecords,
          },
        ];

        evidenceList.push({
          id: evidenceId,
          kind: 'measurement',
          description: `Shortcut bias diagnostic for "${res.shortcutKey}": Positive recall collapses by ${(res.recallCollapseDelta * 100).toFixed(1)} pp when artifact is removed (Odds Ratio: ${res.oddsRatio.toFixed(1)}x). Bias confirmed: ${res.hasShortcutBiasConfirmed}.`,
          measurements,
          provenance: {
            kind: 'tool_result',
            resultId,
          },
        });
        break;
      }

      default:
        throw new Error(`Unsupported vision tool: ${tool}`);
    }

    const result: VisionToolResult<N> = {
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
    const result: VisionToolResult<N> = {
      id: resultId,
      callId,
      tool,
      toolVersion: 1,
      completedAt: new Date().toISOString(),
      evidenceIds: [],
      status: 'failed',
      error: errorMsg,
    };
    return { call, result, evidence: [] };
  }
}
