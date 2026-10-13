'use client';

import React from 'react';
import type { ShortcutLearningReport } from '@/core/diagnostics/vision/shortcut-detector';

interface ShortcutAnalysisViewProps {
  report: ShortcutLearningReport | null;
}

export function ShortcutAnalysisView({ report }: ShortcutAnalysisViewProps) {
  if (!report) {
    return (
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
        <p className="text-sm">Shortcut learning analysis has not been performed on this dataset.</p>
      </div>
    );
  }

  const {
    shortcutKey,
    trainPrevalenceInPositives,
    trainPrevalenceInNegatives,
    trainPrevalenceDisparity,
    prodPrevalenceInPositives,
    prodPrevalenceInNegatives,
    positiveRecallWithShortcut,
    positiveRecallWithoutShortcut,
    recallCollapseDelta,
    oddsRatio,
    hasShortcutBiasConfirmed,
    evidenceSummary,
    recommendations,
  } = report;

  return (
    <div className="space-y-6">
      {/* Shortcut Bias Confirmation Alert */}
      {hasShortcutBiasConfirmed ? (
        <div className="bg-amber-950/30 border border-amber-600/70 rounded-2xl p-6 shadow-xl flex items-start gap-4">
          <div className="p-3 bg-amber-500/20 rounded-xl text-amber-400 text-2xl font-bold">
            📐
          </div>
          <div>
            <h4 className="text-base font-bold text-amber-200 mb-1">
              Spurious Visual Shortcut Learning Confirmed: &quot;{shortcutKey}&quot;
            </h4>
            <p className="text-xs text-amber-300/80 leading-relaxed">{evidenceSummary}</p>
          </div>
        </div>
      ) : (
        <div className="bg-emerald-950/20 border border-emerald-800/40 rounded-2xl p-5 shadow-sm flex items-center gap-3">
          <span className="text-emerald-400 text-lg font-bold">✓</span>
          <span className="text-xs text-emerald-300 font-medium">
            No critical shortcut learning disparity detected for artifact &quot;{shortcutKey}&quot;.
          </span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
          <div className="text-xs text-slate-400 mb-1">Train Positive Prevalence</div>
          <div className="text-2xl font-bold text-amber-400 font-mono">
            {(trainPrevalenceInPositives * 100).toFixed(1)}%
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            vs {(trainPrevalenceInNegatives * 100).toFixed(1)}% in training negatives
          </div>
        </div>

        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
          <div className="text-xs text-slate-400 mb-1">Production Prevalence</div>
          <div className="text-2xl font-bold text-rose-400 font-mono">
            {(prodPrevalenceInPositives * 100).toFixed(1)}%
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            Severe real-world artifact drop
          </div>
        </div>

        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
          <div className="text-xs text-slate-400 mb-1">Recall with Shortcut</div>
          <div className="text-2xl font-bold text-emerald-400 font-mono">
            {(positiveRecallWithShortcut * 100).toFixed(1)}%
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            Artifact present in image
          </div>
        </div>

        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
          <div className="text-xs text-slate-400 mb-1">Recall Collapse Delta</div>
          <div className="text-2xl font-bold text-rose-400 font-mono">
            -{(recallCollapseDelta * 100).toFixed(1)} pp
          </div>
          <div className="text-[10px] text-rose-400/80 mt-1">
            Collapses to {(positiveRecallWithoutShortcut * 100).toFixed(1)}% without artifact
          </div>
        </div>
      </div>

      {/* Disparity Contingency Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 backdrop-blur">
        <h3 className="text-base font-semibold text-white mb-1">
          Artifact Prevalence &amp; Performance Disparity Breakdown
        </h3>
        <p className="text-xs text-slate-400 mb-4">
          Quantifying spurious feature dependence across dataset cohorts.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left font-mono">
            <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Cohort Partition</th>
                <th className="px-4 py-3 text-right">Positives with Artifact</th>
                <th className="px-4 py-3 text-right">Negatives with Artifact</th>
                <th className="px-4 py-3 text-right">Prevalence Disparity</th>
                <th className="px-4 py-3 text-right">Malignant Recall</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              <tr className="hover:bg-slate-800/30">
                <td className="px-4 py-3 font-semibold text-white">Training Set</td>
                <td className="px-4 py-3 text-right text-amber-400 font-bold">
                  {(trainPrevalenceInPositives * 100).toFixed(1)}%
                </td>
                <td className="px-4 py-3 text-right text-slate-400">
                  {(trainPrevalenceInNegatives * 100).toFixed(1)}%
                </td>
                <td className="px-4 py-3 text-right text-amber-300 font-bold">
                  +{(trainPrevalenceDisparity * 100).toFixed(1)} pp
                </td>
                <td className="px-4 py-3 text-right text-emerald-400 font-bold">100.0%</td>
              </tr>
              <tr className="hover:bg-slate-800/30">
                <td className="px-4 py-3 font-semibold text-white">Production Deployment</td>
                <td className="px-4 py-3 text-right text-slate-400">
                  {(prodPrevalenceInPositives * 100).toFixed(1)}%
                </td>
                <td className="px-4 py-3 text-right text-slate-400">
                  {(prodPrevalenceInNegatives * 100).toFixed(1)}%
                </td>
                <td className="px-4 py-3 text-right text-slate-500">
                  {((prodPrevalenceInPositives - prodPrevalenceInNegatives) * 100).toFixed(1)} pp
                </td>
                <td className="px-4 py-3 text-right text-rose-400 font-bold">
                  {(positiveRecallWithoutShortcut * 100).toFixed(1)}% (Collapse)
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Actionable Engineering Mitigations */}
      {recommendations.length > 0 && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 backdrop-blur">
          <h3 className="text-base font-semibold text-white mb-2 flex items-center gap-2">
            <span>🛡</span> Actionable Countermeasure Protocol
          </h3>
          <ul className="space-y-2 text-xs text-slate-300">
            {recommendations.map((rec, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="text-indigo-400 font-bold font-mono">0{i + 1}.</span>
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
