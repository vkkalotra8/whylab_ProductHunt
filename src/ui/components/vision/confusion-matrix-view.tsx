'use client';

import React from 'react';
import type { MulticlassSummaryMetrics } from '@/core/domain/vision-types';

interface ConfusionMatrixViewProps {
  metrics: MulticlassSummaryMetrics;
}

export function ConfusionMatrixView({ metrics }: ConfusionMatrixViewProps) {
  const { classes, matrix } = metrics.confusionMatrix;
  const k = classes.length;

  // Find max cell value for color intensity
  let maxCount = 1;
  for (let r = 0; r < k; r++) {
    for (let c = 0; c < k; c++) {
      if (matrix[r][c] > maxCount) maxCount = matrix[r][c];
    }
  }

  return (
    <div className="space-y-6">
      {/* Confusion Matrix Card */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 backdrop-blur">
        <h3 className="text-base font-semibold text-white mb-1">
          Multiclass Confusion Matrix
        </h3>
        <p className="text-xs text-slate-400 mb-6">
          Rows represent actual ground-truth classes (y_true); columns represent model predictions (y_pred).
        </p>

        <div className="overflow-x-auto pb-4">
          <div className="inline-block min-w-full">
            <div className="flex flex-col items-center">
              {/* Top Label */}
              <div className="text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-2">
                Predicted Class →
              </div>

              <div className="flex items-center">
                {/* Side Label */}
                <div className="text-xs font-semibold text-indigo-400 uppercase tracking-wider -rotate-90 mr-2 whitespace-nowrap">
                  Actual Class →
                </div>

                {/* Matrix Grid */}
                <div className="border border-slate-800 rounded-xl overflow-hidden shadow-2xl bg-slate-950">
                  {/* Column Headers */}
                  <div className="flex border-b border-slate-800 bg-slate-900/80">
                    <div className="w-28 p-2.5 text-xs font-mono font-bold text-slate-500 border-r border-slate-800 text-center">
                      Actual \ Pred
                    </div>
                    {classes.map((c) => (
                      <div
                        key={c}
                        className="w-24 p-2.5 text-xs font-mono font-semibold text-slate-200 text-center border-r border-slate-800 last:border-r-0 truncate"
                        title={c}
                      >
                        {c}
                      </div>
                    ))}
                  </div>

                  {/* Rows */}
                  {classes.map((trueClass, rIdx) => (
                    <div key={trueClass} className="flex border-b border-slate-800/80 last:border-b-0">
                      {/* Row Header */}
                      <div className="w-28 p-2.5 text-xs font-mono font-semibold text-slate-200 bg-slate-900/60 border-r border-slate-800 text-right pr-3 truncate flex items-center justify-end">
                        {trueClass}
                      </div>

                      {/* Cells */}
                      {classes.map((predClass, cIdx) => {
                        const count = matrix[rIdx][cIdx];
                        const isDiagonal = rIdx === cIdx;
                        const intensity = count / maxCount;

                        let bgColor = 'rgba(15, 23, 42, 0.4)'; // slate-950
                        if (isDiagonal && count > 0) {
                          bgColor = `rgba(16, 185, 129, ${0.15 + intensity * 0.75})`; // emerald
                        } else if (!isDiagonal && count > 0) {
                          bgColor = `rgba(244, 63, 94, ${0.15 + intensity * 0.75})`; // rose
                        }

                        return (
                          <div
                            key={predClass}
                            style={{ backgroundColor: bgColor }}
                            className="w-24 h-16 p-2 border-r border-slate-800/60 last:border-r-0 flex flex-col items-center justify-center transition-colors"
                          >
                            <span className="font-mono text-base font-bold text-white">
                              {count}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {metrics.totalSamples > 0
                                ? `${((count / metrics.totalSamples) * 100).toFixed(1)}%`
                                : '0%'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Per-Class Scorecard Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 backdrop-blur">
        <h3 className="text-base font-semibold text-white mb-1">
          Per-Class Diagnostic Scorecard
        </h3>
        <p className="text-xs text-slate-400 mb-4">
          Detailed metrics per class with null-safe handling of unrepresented classes.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-950/80 text-slate-400 font-mono uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Class</th>
                <th className="px-4 py-3 text-right">Support (N)</th>
                <th className="px-4 py-3 text-right">Prevalence</th>
                <th className="px-4 py-3 text-right">Precision</th>
                <th className="px-4 py-3 text-right">Recall</th>
                <th className="px-4 py-3 text-right">F1 Score</th>
                <th className="px-4 py-3 text-right">Specificity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {Object.values(metrics.perClass).map((pc) => (
                <tr key={pc.className} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3 font-semibold text-white">{pc.className}</td>
                  <td className="px-4 py-3 text-right text-slate-300">{pc.support}</td>
                  <td className="px-4 py-3 text-right text-slate-400">
                    {(pc.prevalence * 100).toFixed(1)}%
                  </td>
                  <td className="px-4 py-3 text-right">
                    {pc.precision !== null ? (
                      <span className="text-emerald-400 font-bold">
                        {(pc.precision * 100).toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-slate-500 italic">Undefined</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {pc.recall !== null ? (
                      <span className="text-teal-400 font-bold">
                        {(pc.recall * 100).toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-slate-500 italic">Undefined</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {pc.f1Score !== null ? (
                      <span className="text-indigo-400 font-bold">
                        {(pc.f1Score * 100).toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-slate-500 italic">Undefined</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-300">
                    {pc.specificity !== null
                      ? `${(pc.specificity * 100).toFixed(1)}%`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
