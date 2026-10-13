'use client';

import React from 'react';
import type { CrossSplitLeakageReport } from '@/core/diagnostics/vision/leakage-detector';

interface PerceptualLeakageViewProps {
  report: CrossSplitLeakageReport | null;
}

export function PerceptualLeakageView({ report }: PerceptualLeakageViewProps) {
  if (!report) {
    return (
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
        <p className="text-sm">Perceptual leakage scan has not been performed on this dataset.</p>
      </div>
    );
  }

  const {
    totalEvalImagesScanned,
    totalTrainImagesScanned,
    leakedImageCount,
    leakedImageRate,
    leakedAccuracy,
    leakedWilsonCi,
    cleanAccuracy,
    cleanWilsonCi,
    leakageInflationGap,
    matches,
    hasSevereLeakageInflation,
  } = report;

  return (
    <div className="space-y-6">
      {/* Leakage Severity Banner */}
      {hasSevereLeakageInflation ? (
        <div className="bg-rose-950/30 border border-rose-600/70 rounded-2xl p-6 shadow-xl flex items-start gap-4">
          <div className="p-3 bg-rose-500/20 rounded-xl text-rose-400 text-2xl font-bold">
            🚨
          </div>
          <div>
            <h4 className="text-base font-bold text-rose-200 mb-1">
              Severe Cross-Split Near-Duplicate Leakage Confirmed (+{(leakageInflationGap * 100).toFixed(1)} pp Inflation)
            </h4>
            <p className="text-xs text-rose-300/80 leading-relaxed">
              Evaluation cohort contains perceptual clones (Hamming distance $\le 1$ bit) of training samples.
              Model achieves <strong className="text-white">{(leakedAccuracy * 100).toFixed(1)}% accuracy</strong> on leaked images,
              masking a true generalization accuracy of only <strong className="text-white">{(cleanAccuracy * 100).toFixed(1)}%</strong> on clean data.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-emerald-950/20 border border-emerald-800/40 rounded-2xl p-5 shadow-sm flex items-center gap-3">
          <span className="text-emerald-400 text-lg font-bold">✓</span>
          <span className="text-xs text-emerald-300 font-medium">
            No significant cross-split near-duplicate leakage detected (Hamming distance $\le 1$).
          </span>
        </div>
      )}

      {/* KPI Comparative Cards with Wilson 95% CIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
          <div className="text-xs text-slate-400 mb-1">Leaked Images</div>
          <div className="text-2xl font-bold text-rose-400 font-mono">
            {leakedImageCount}{' '}
            <span className="text-xs text-slate-400 font-normal">
              ({(leakedImageRate * 100).toFixed(1)}% of eval)
            </span>
          </div>
          <div className="text-[10px] text-slate-500 mt-1">Scanned against {totalTrainImagesScanned} train images</div>
        </div>

        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
          <div className="text-xs text-slate-400 mb-1">Leaked Subset Accuracy</div>
          <div className="text-2xl font-bold text-white font-mono">
            {(leakedAccuracy * 100).toFixed(1)}%
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            95% Wilson CI: [{(leakedWilsonCi.lower * 100).toFixed(1)}% – {(leakedWilsonCi.upper * 100).toFixed(1)}%]
          </div>
        </div>

        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
          <div className="text-xs text-slate-400 mb-1">Clean Subset Accuracy</div>
          <div className="text-2xl font-bold text-slate-300 font-mono">
            {(cleanAccuracy * 100).toFixed(1)}%
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            95% Wilson CI: [{(cleanWilsonCi.lower * 100).toFixed(1)}% – {(cleanWilsonCi.upper * 100).toFixed(1)}%]
          </div>
        </div>

        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
          <div className="text-xs text-slate-400 mb-1">Leakage Inflation Gap</div>
          <div className="text-2xl font-bold text-amber-400 font-mono">
            +{(leakageInflationGap * 100).toFixed(1)} pp
          </div>
          <div className="text-[10px] text-amber-400/80 mt-1">Spurious benchmark inflation</div>
        </div>
      </div>

      {/* Near-Duplicate Matches Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 backdrop-blur">
        <h3 className="text-base font-semibold text-white mb-1">
          Identified Perceptual Near-Duplicate Pairs
        </h3>
        <p className="text-xs text-slate-400 mb-4">
          Pairs identified with bitwise 64-bit dHash Hamming distance $\le 1$ bit across partitions.
        </p>

        {matches.length === 0 ? (
          <div className="text-xs text-slate-500 py-6 text-center font-mono">
            Zero near-duplicate pairs detected under Hamming distance $\le 1$.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-950/80 text-slate-400 font-mono uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">Evaluation Image</th>
                  <th className="px-4 py-3">Split</th>
                  <th className="px-4 py-3">Training Twin</th>
                  <th className="px-4 py-3 text-center">Hamming Distance</th>
                  <th className="px-4 py-3 text-center">Outcome</th>
                  <th className="px-4 py-3">Ground Truth</th>
                  <th className="px-4 py-3">Prediction</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {matches.map((m) => (
                  <tr key={m.evalImageId} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3 font-semibold text-white">{m.evalImageId}</td>
                    <td className="px-4 py-3">
                      <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-purple-950 text-purple-300">
                        {m.evalSplit}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-indigo-300">{m.trainImageId}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-950 border border-amber-600 text-amber-300">
                        {m.hammingDistance} bit{m.hammingDistance === 1 ? '' : 's'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          m.evalOutcome === 'CORRECT'
                            ? 'bg-emerald-950 text-emerald-300'
                            : 'bg-rose-950 text-rose-300'
                        }`}
                      >
                        {m.evalOutcome}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{String(m.yTrue)}</td>
                    <td className="px-4 py-3 text-emerald-400 font-bold">{String(m.yPred)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
