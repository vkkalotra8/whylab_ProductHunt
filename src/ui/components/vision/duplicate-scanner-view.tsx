'use client';

import React from 'react';
import type { ExactDuplicateReport } from '@/core/domain/vision-types';

interface DuplicateScannerViewProps {
  report: ExactDuplicateReport | null;
}

export function DuplicateScannerView({ report }: DuplicateScannerViewProps) {
  if (!report) {
    return (
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
        <p className="text-sm">Exact duplicate scan has not been performed on this dataset.</p>
      </div>
    );
  }

  const {
    totalImagesScanned,
    uniqueImageCount,
    duplicateGroupCount,
    totalDuplicateInstances,
    crossSplitContaminationCount,
    clusters,
  } = report;

  return (
    <div className="space-y-6">
      {/* Contamination Alert Banner */}
      {crossSplitContaminationCount > 0 ? (
        <div className="bg-amber-950/30 border border-amber-600/60 rounded-2xl p-5 shadow-lg flex items-start gap-4">
          <div className="p-2 bg-amber-500/20 rounded-xl text-amber-400 text-xl font-bold">
            ⚠
          </div>
          <div>
            <h4 className="text-base font-bold text-amber-200 mb-1">
              Cross-Split Data Leakage Detected ({crossSplitContaminationCount} Cluster{crossSplitContaminationCount > 1 ? 's' : ''})
            </h4>
            <p className="text-xs text-amber-300/80 leading-relaxed">
              Identical byte streams exist across distinct dataset partitions (e.g., training and test/production).
              Models evaluated on leaked holdout samples exhibit artificially inflated benchmark performance.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-emerald-950/20 border border-emerald-800/40 rounded-2xl p-5 shadow-sm flex items-center gap-3">
          <span className="text-emerald-400 text-lg font-bold">✓</span>
          <span className="text-xs text-emerald-300 font-medium">
            No cross-split exact duplicates detected across {totalImagesScanned} scanned images.
          </span>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
          <div className="text-xs text-slate-400 mb-1">Scanned Images</div>
          <div className="text-2xl font-bold text-white font-mono">{totalImagesScanned}</div>
        </div>
        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
          <div className="text-xs text-slate-400 mb-1">Unique Bitstreams</div>
          <div className="text-2xl font-bold text-indigo-400 font-mono">{uniqueImageCount}</div>
        </div>
        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
          <div className="text-xs text-slate-400 mb-1">Duplicate Groups</div>
          <div className="text-2xl font-bold text-slate-200 font-mono">{duplicateGroupCount}</div>
        </div>
        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
          <div className="text-xs text-slate-400 mb-1">Leaked Clusters</div>
          <div className="text-2xl font-bold text-amber-400 font-mono">
            {crossSplitContaminationCount}
          </div>
        </div>
      </div>

      {/* Clusters Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 backdrop-blur">
        <h3 className="text-base font-semibold text-white mb-1">
          Identified Duplicate Clusters
        </h3>
        <p className="text-xs text-slate-400 mb-4">
          Bitwise identical image files matched via cryptographic SHA-256 digests.
        </p>

        {clusters.length === 0 ? (
          <div className="text-xs text-slate-500 py-6 text-center font-mono">
            Zero duplicate files found. All images have unique byte streams.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-950/80 text-slate-400 font-mono uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">SHA-256 Digest</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3">Partitions Involved</th>
                  <th className="px-4 py-3">Member Images</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {clusters.map((c) => (
                  <tr key={c.digest} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3 text-slate-300 select-all max-w-[180px] truncate" title={c.digest}>
                      {c.digest}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {c.isCrossSplitContamination ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 border border-amber-600 text-amber-300">
                          CROSS-SPLIT LEAKAGE
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400">
                          Intra-Split Duplicate
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      <div className="flex gap-1 flex-wrap">
                        {c.splits.map((s) => (
                          <span
                            key={s}
                            className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-semibold ${
                              s === 'train'
                                ? 'bg-blue-950 text-blue-300'
                                : s === 'val'
                                ? 'bg-purple-950 text-purple-300'
                                : 'bg-amber-950 text-amber-300'
                            }`}
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-200">
                      <div className="flex gap-1.5 flex-wrap">
                        {c.imageIds.map((id) => (
                          <span key={id} className="bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-white">
                            {id}
                          </span>
                        ))}
                      </div>
                    </td>
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
