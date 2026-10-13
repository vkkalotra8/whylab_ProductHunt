/**
 * Computer Vision Diagnostic Tool Contracts.
 * Defines typed input/output schemas for allowlisted CV tools registered with Astra.
 */

import type {
  VisionRecord,
  ImageQualityProfile,
  MulticlassSummaryMetrics,
} from './vision-types.ts';
import type { QualityDistributionSummary } from '../diagnostics/vision/image-quality.ts';
import type { CrossSplitLeakageReport } from '../diagnostics/vision/leakage-detector.ts';
import type { VisionCohortDriftReport } from '../diagnostics/vision/quality-drift.ts';
import type { ShortcutLearningReport } from '../diagnostics/vision/shortcut-detector.ts';
import type { Id } from './primitives.ts';

export type VisionToolName =
  | 'compute_multiclass_metrics'
  | 'profile_image_quality'
  | 'scan_perceptual_leakage'
  | 'detect_quality_drift'
  | 'scan_shortcut_bias';

export interface VisionToolInputMap {
  compute_multiclass_metrics: {
    records: VisionRecord[];
    knownClasses?: string[];
  };
  profile_image_quality: {
    profiles: ImageQualityProfile[];
    blurThreshold?: number;
  };
  scan_perceptual_leakage: {
    records: VisionRecord[];
    hammingThreshold?: number;
    trainSplitName?: string;
    evalSplitNames?: string[];
  };
  detect_quality_drift: {
    records: VisionRecord[];
    cohortAIdentifier?: string;
    cohortBIdentifier?: string;
    cohortField?: 'site' | 'split';
  };
  scan_shortcut_bias: {
    records: VisionRecord[];
    shortcutKey?: string;
    positiveLabel?: string;
  };
}

export interface VisionToolOutputMap {
  compute_multiclass_metrics: MulticlassSummaryMetrics;
  profile_image_quality: QualityDistributionSummary;
  scan_perceptual_leakage: CrossSplitLeakageReport;
  detect_quality_drift: VisionCohortDriftReport;
  scan_shortcut_bias: ShortcutLearningReport;
}

export interface VisionToolCall<N extends VisionToolName = VisionToolName> {
  id: Id<'call'>;
  investigationId: Id<'investigation'>;
  tool: N;
  toolVersion: 1;
  requestedAt: string;
  input: VisionToolInputMap[N];
}

export interface VisionToolResult<N extends VisionToolName = VisionToolName> {
  id: Id<'result'>;
  callId: Id<'call'>;
  tool: N;
  toolVersion: 1;
  completedAt: string;
  evidenceIds: Id<'evidence'>[];
  status: 'completed' | 'failed';
  output?: VisionToolOutputMap[N];
  error?: string;
}
