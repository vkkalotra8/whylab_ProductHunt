'use client';

import React from 'react';
import type { VisionRecord } from '@/core/domain/vision-types';

interface ImageDetailModalProps {
  record: VisionRecord | null;
  onClose: () => void;
}

export function ImageDetailModal({ record, onClose }: ImageDetailModalProps) {
  if (!record) return null;

  const q = record.qualityProfile;
  const isCorrect = String(record.yTrue) === String(record.yPred);
  const isOverconfidentError = record.failureCategory === 'INCORRECT_HIGH_CONF';
  const hasRuler = (record.metadata?.has_ruler as number) === 1;

  const confPct =
    record.confidence !== undefined && record.confidence !== null
      ? (record.confidence * 100).toFixed(1)
      : record.yProbability !== undefined && record.yProbability !== null
      ? (record.yProbability * 100).toFixed(1)
      : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="relative w-full max-w-4xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <span className="font-mono text-base font-semibold text-white">
              {record.imageId}
            </span>
            {record.split && (
              <span className="text-xs px-2 py-0.5 rounded font-mono uppercase bg-indigo-950 border border-indigo-700/60 text-indigo-300">
                {record.split}
              </span>
            )}
            {record.site && (
              <span className="text-xs px-2 py-0.5 rounded font-mono bg-slate-800 text-slate-300">
                {record.site}
              </span>
            )}
            {hasRuler && (
              <span className="text-xs px-2 py-0.5 rounded font-mono bg-amber-950 border border-amber-700/60 text-amber-300">
                Scale Ruler Planted
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column: Image Preview */}
          <div className="flex flex-col items-center justify-center bg-slate-950/90 rounded-xl p-4 border border-slate-800">
            {record.thumbnailDataUrl ? (
              <img
                src={record.thumbnailDataUrl}
                alt={record.imageId}
                className="w-full max-h-[320px] object-contain rounded-lg shadow-inner"
              />
            ) : (
              <div className="w-48 h-48 flex items-center justify-center text-slate-600 text-xs font-mono">
                No Preview Available
              </div>
            )}
            <div className="mt-3 text-xs text-slate-400 font-mono text-center">
              {q ? `${q.width} x ${q.height} px • Aspect ${q.aspectRatio.toFixed(2)}` : 'Dimensions unavailable'}
            </div>
          </div>

          {/* Right Column: Diagnostic Inspection */}
          <div className="space-y-4">
            {/* Classification Outcome Card */}
            <div
              className={`p-4 rounded-xl border ${
                isOverconfidentError
                  ? 'bg-rose-950/30 border-rose-700/70'
                  : isCorrect
                  ? 'bg-emerald-950/20 border-emerald-800/50'
                  : 'bg-amber-950/20 border-amber-800/50'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Classification Outcome
                </span>
                <span
                  className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                    isCorrect
                      ? 'bg-emerald-900/60 text-emerald-300'
                      : 'bg-rose-900/60 text-rose-300'
                  }`}
                >
                  {record.outcome ?? (isCorrect ? 'CORRECT' : 'MISCLASSIFICATION')}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-xs text-slate-400 block">Ground Truth (y_true)</span>
                  <span className="font-semibold text-white text-base">{String(record.yTrue)}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-400 block">Model Prediction (y_pred)</span>
                  <span
                    className={`font-semibold text-base ${
                      isCorrect ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {String(record.yPred)}
                  </span>
                </div>
              </div>

              {confPct && (
                <div className="mt-3 pt-3 border-t border-slate-800/60">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">Prediction Confidence</span>
                    <span className="font-mono text-slate-200">{confPct}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        isCorrect ? 'bg-emerald-500' : 'bg-rose-500'
                      }`}
                      style={{ width: `${confPct}%` }}
                    />
                  </div>
                </div>
              )}

              {isOverconfidentError && (
                <div className="mt-3 p-2 bg-rose-900/40 border border-rose-700/60 rounded text-xs text-rose-200 flex items-start gap-2">
                  <span className="text-rose-400 font-bold">CRITICAL:</span>
                  <span>
                    Model expressed high certainty (&gt;70%) on an objectively false prediction.
                  </span>
                </div>
              )}
            </div>

            {/* Quality Metrics */}
            <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block">
                Deterministic Quality Indicators
              </span>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 bg-slate-900 rounded border border-slate-800">
                  <span className="text-slate-400 block">Sharpness (Laplacian)</span>
                  <span
                    className={`font-mono font-bold text-sm ${
                      (q?.sharpness ?? 200) < 150 ? 'text-rose-400' : 'text-emerald-400'
                    }`}
                  >
                    {q?.sharpness ? q.sharpness.toFixed(1) : '—'}
                  </span>
                  {(q?.sharpness ?? 200) < 150 && (
                    <span className="text-[10px] text-rose-400 block">Severe blur artifact</span>
                  )}
                </div>

                <div className="p-2 bg-slate-900 rounded border border-slate-800">
                  <span className="text-slate-400 block">Mean Luminance</span>
                  <span className="font-mono font-bold text-sm text-slate-200">
                    {q?.meanLuminance ? q.meanLuminance.toFixed(1) : '—'}
                  </span>
                  <span className="text-[10px] text-slate-500 block">Range: 0–255</span>
                </div>

                <div className="p-2 bg-slate-900 rounded border border-slate-800">
                  <span className="text-slate-400 block">RMS Contrast</span>
                  <span className="font-mono font-bold text-sm text-slate-200">
                    {q?.rmsContrast ? q.rmsContrast.toFixed(3) : '—'}
                  </span>
                </div>

                <div className="p-2 bg-slate-900 rounded border border-slate-800">
                  <span className="text-slate-400 block">Clipped Highlights</span>
                  <span className="font-mono font-bold text-sm text-slate-200">
                    {q ? `${(q.clippedHighlights * 100).toFixed(1)}%` : '—'}
                  </span>
                </div>
              </div>

              {q?.dHash && (
                <div className="pt-2 border-t border-slate-800 text-[11px] font-mono text-slate-400">
                  <span className="text-slate-500">dHash (64-bit): </span>
                  <span className="text-indigo-400 select-all">{q.dHash}</span>
                </div>
              )}
            </div>

            {/* Metadata Attributes */}
            {record.metadata && Object.keys(record.metadata).length > 0 && (
              <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                  Companion Manifest Metadata
                </span>
                <div className="space-y-1 text-xs font-mono">
                  {Object.entries(record.metadata).map(([k, v]) => (
                    <div key={k} className="flex justify-between text-slate-300">
                      <span className="text-slate-500">{k}:</span>
                      <span>{String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
