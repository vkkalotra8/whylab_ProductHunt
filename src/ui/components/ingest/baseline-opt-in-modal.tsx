'use client';

import React, { useState } from 'react';
import { EXPERIMENTAL_BASELINE_DISCLAIMER } from '@/core/inference/baseline-trainer';

interface BaselineOptInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (config: {
    seed: number;
    modelType: 'logistic_regression';
    trainRatio: number;
    valRatio: number;
    testRatio: number;
  }) => void;
  datasetName: string;
  targetColumn: string;
  positiveLabel: string;
  rowCount: number;
}

export function BaselineOptInModal({
  isOpen,
  onClose,
  onConfirm,
  datasetName,
  targetColumn,
  positiveLabel,
  rowCount,
}: BaselineOptInModalProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [seed, setSeed] = useState(42);
  const [trainRatio, setTrainRatio] = useState(0.7);

  if (!isOpen) return null;

  const handleLaunch = () => {
    if (!confirmed) return;
    const remaining = Math.max(0.1, 1.0 - trainRatio);
    const valRatio = Math.round((remaining / 2) * 100) / 100;
    const testRatio = Math.round((remaining - valRatio) * 100) / 100;

    onConfirm({
      seed,
      modelType: 'logistic_regression',
      trainRatio,
      valRatio,
      testRatio,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-headline"
    >
      <div className="relative w-full max-w-2xl bg-zinc-950 border border-amber-500/40 rounded-xl shadow-2xl p-6 text-zinc-100 flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-bold text-xl">
              ⚠️
            </div>
            <div>
              <h3 id="modal-headline" className="text-lg font-semibold text-zinc-100">
                Generate Experimental Reference Baseline
              </h3>
              <p className="text-xs text-zinc-400">
                Informed Operator Consent & Leak-Free Holdout Benchmark
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 text-sm px-2 py-1 rounded hover:bg-zinc-800 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Warning Banner */}
        <div className="p-3.5 bg-amber-950/40 border border-amber-500/30 rounded-lg text-xs leading-relaxed text-amber-200 flex flex-col gap-1.5">
          <div className="font-semibold text-amber-300 flex items-center gap-1.5">
            <span>🛡️</span> Zero Silent Training Invariant
          </div>
          <p>
            WhyLab strictly forbids silent or automatic model generation. An experimental reference baseline is computed exclusively for diagnostic failure falsification and comparative benchmarking on your labeled dataset (
            <code className="text-amber-100 font-mono">{datasetName}</code>, target: <code className="text-amber-100 font-mono">{targetColumn}</code>).
          </p>
          <p className="text-amber-300/80 italic font-mono text-[11px]">
            &quot;{EXPERIMENTAL_BASELINE_DISCLAIMER}&quot;
          </p>
        </div>

        {/* Dataset & Parameter Summary */}
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div className="p-3 bg-zinc-900/60 border border-zinc-800 rounded-lg flex flex-col gap-1">
            <span className="text-zinc-400">Dataset Rows:</span>
            <span className="font-mono text-zinc-200 font-medium">{rowCount.toLocaleString()} rows</span>
            <span className="text-zinc-400 mt-2">Target Label:</span>
            <span className="font-mono text-emerald-400 font-medium">Positive class = &quot;{positiveLabel}&quot;</span>
          </div>

          <div className="p-3 bg-zinc-900/60 border border-zinc-800 rounded-lg flex flex-col gap-2">
            <div>
              <label htmlFor="baseline-seed-input" className="text-zinc-400 block mb-1">Random Seed (Mulberry32):</label>
              <input
                id="baseline-seed-input"
                type="number"
                value={seed}
                onChange={(e) => setSeed(parseInt(e.target.value, 10) || 42)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded px-2.5 py-1 text-zinc-200 font-mono text-xs focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label htmlFor="baseline-train-ratio-slider" className="text-zinc-400 block mb-1">
                Train Split Ratio: {(trainRatio * 100).toFixed(0)}% (Holdout: {((1 - trainRatio) * 100).toFixed(0)}%)
              </label>
              <input
                id="baseline-train-ratio-slider"
                type="range"
                min="0.5"
                max="0.85"
                step="0.05"
                value={trainRatio}
                onChange={(e) => setTrainRatio(parseFloat(e.target.value))}
                className="w-full accent-amber-500"
              />
            </div>
          </div>
        </div>

        {/* Leakage Protection Checklist */}
        <div className="p-3 bg-zinc-900/40 border border-zinc-800 rounded-lg text-xs space-y-1.5">
          <div className="text-zinc-300 font-medium">Data Hygiene Guarantees:</div>
          <div className="flex items-center gap-2 text-zinc-400">
            <span className="text-emerald-400">✓</span>
            <span>Preprocessors (medians, means, standard deviations) fit strictly on train split rows</span>
          </div>
          <div className="flex items-center gap-2 text-zinc-400">
            <span className="text-emerald-400">✓</span>
            <span>Final benchmark metrics evaluated strictly on independent holdout test set</span>
          </div>
          <div className="flex items-center gap-2 text-zinc-400">
            <span className="text-emerald-400">✓</span>
            <span>Deterministic reproducibility across all runs with fixed PRNG seed</span>
          </div>
        </div>

        {/* Required Confirmation Checkbox */}
        <div className="pt-2 border-t border-zinc-800">
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              id="baseline-opt-in-checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 accent-amber-500 w-4 h-4 rounded cursor-pointer"
            />
            <span className="text-xs text-zinc-300 leading-normal">
              I acknowledge that I am generating an <strong>Experimental Reference Baseline</strong> strictly for diagnostic comparison and will <strong>NOT</strong> treat or deploy this baseline as a production model.
            </span>
          </label>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs rounded-lg border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 transition-colors"
          >
            Cancel
          </button>
          <button
            id="confirm-generate-baseline-btn"
            onClick={handleLaunch}
            disabled={!confirmed}
            className={`px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 transition-all ${
              confirmed
                ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-600/30'
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
            }`}
          >
            <span>⚡</span>
            <span>Generate Experimental Baseline</span>
          </button>
        </div>
      </div>
    </div>
  );
}
