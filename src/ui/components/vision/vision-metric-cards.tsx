'use client';

import React from 'react';
import type { MulticlassSummaryMetrics, ExactDuplicateReport } from '@/core/domain/vision-types';
import type { QualityDistributionSummary } from '@/core/diagnostics/vision/image-quality';

interface VisionMetricCardsProps {
  metrics: MulticlassSummaryMetrics;
  qualitySummary?: QualityDistributionSummary | null;
  duplicateReport?: ExactDuplicateReport | null;
}

export function VisionMetricCards({
  metrics,
  qualitySummary,
  duplicateReport,
}: VisionMetricCardsProps) {
  const accuracyPct = (metrics.overallAccuracy * 100).toFixed(1);
  const macroF1Pct = (metrics.macroF1 * 100).toFixed(1);
  const weightedF1Pct = (metrics.weightedF1 * 100).toFixed(1);
  const highConfErrors = metrics.highConfidenceErrorCount;
  const highConfErrorRate =
    metrics.totalSamples > 0
      ? ((highConfErrors / metrics.totalSamples) * 100).toFixed(1)
      : '0.0';

  const avgSharpness = qualitySummary ? qualitySummary.meanSharpness.toFixed(0) : '—';
  const blurryRate = qualitySummary
    ? `${(qualitySummary.blurryImageRate * 100).toFixed(1)}% (${qualitySummary.blurryImageCount})`
    : '—';

  const leakageCount = duplicateReport ? duplicateReport.crossSplitContaminationCount : 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {/* Accuracy */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-sm backdrop-blur">
        <div className="text-xs font-medium text-slate-400 mb-1">Overall Accuracy</div>
        <div className="text-2xl font-bold text-white tracking-tight">{accuracyPct}%</div>
        <div className="text-xs text-slate-500 mt-1">{metrics.totalSamples} evaluation samples</div>
      </div>

      {/* Macro F1 */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-sm backdrop-blur">
        <div className="text-xs font-medium text-slate-400 mb-1">Macro F1 Score</div>
        <div className="text-2xl font-bold text-emerald-400 tracking-tight">{macroF1Pct}%</div>
        <div className="text-xs text-slate-500 mt-1">{metrics.classes.length} classes evaluated</div>
      </div>

      {/* Weighted F1 */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-sm backdrop-blur">
        <div className="text-xs font-medium text-slate-400 mb-1">Weighted F1</div>
        <div className="text-2xl font-bold text-teal-400 tracking-tight">{weightedF1Pct}%</div>
        <div className="text-xs text-slate-500 mt-1">Class imbalance adjusted</div>
      </div>

      {/* High Confidence Errors */}
      <div
        className={`border rounded-xl p-4 shadow-sm backdrop-blur ${
          highConfErrors > 0
            ? 'bg-rose-950/20 border-rose-800/60'
            : 'bg-slate-900/80 border-slate-800'
        }`}
      >
        <div className="text-xs font-medium text-slate-400 mb-1 flex items-center justify-between">
          <span>Overconfident Failures</span>
          {highConfErrors > 0 && (
            <span className="inline-block w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
          )}
        </div>
        <div
          className={`text-2xl font-bold tracking-tight ${
            highConfErrors > 0 ? 'text-rose-400' : 'text-slate-200'
          }`}
        >
          {highConfErrors}
        </div>
        <div className="text-xs text-slate-500 mt-1">{highConfErrorRate}% failure rate (&gt;70% conf)</div>
      </div>

      {/* Sharpness & Blur */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-sm backdrop-blur">
        <div className="text-xs font-medium text-slate-400 mb-1">Mean Sharpness</div>
        <div className="text-2xl font-bold text-indigo-400 tracking-tight">{avgSharpness}</div>
        <div className="text-xs text-slate-500 mt-1">Blurry images: {blurryRate}</div>
      </div>

      {/* Cross-Split Leakage */}
      <div
        className={`border rounded-xl p-4 shadow-sm backdrop-blur ${
          leakageCount > 0
            ? 'bg-amber-950/20 border-amber-800/60'
            : 'bg-slate-900/80 border-slate-800'
        }`}
      >
        <div className="text-xs font-medium text-slate-400 mb-1 flex items-center justify-between">
          <span>Cross-Split Leakage</span>
          {leakageCount > 0 && (
            <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          )}
        </div>
        <div
          className={`text-2xl font-bold tracking-tight ${
            leakageCount > 0 ? 'text-amber-400' : 'text-slate-200'
          }`}
        >
          {leakageCount}
        </div>
        <div className="text-xs text-slate-500 mt-1">
          {duplicateReport ? `${duplicateReport.duplicateGroupCount} duplicate clusters` : 'Not scanned'}
        </div>
      </div>
    </div>
  );
}
