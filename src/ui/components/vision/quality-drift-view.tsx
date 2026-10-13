'use client';

import React from 'react';
import type { VisionRecord } from '@/core/domain/vision-types';
import type { QualityDistributionSummary } from '@/core/diagnostics/vision/image-quality';

interface QualityDriftViewProps {
  records: VisionRecord[];
  qualitySummary: QualityDistributionSummary | null;
}

export function QualityDriftView({ records, qualitySummary }: QualityDriftViewProps) {
  // Compute per-site statistics
  const siteMap = new Map<
    string,
    {
      site: string;
      total: number;
      correct: number;
      sharpnessSum: number;
      blurryCount: number;
      luminanceSum: number;
    }
  >();

  for (const r of records) {
    const site = r.site || 'unspecified';
    let entry = siteMap.get(site);
    if (!entry) {
      entry = {
        site,
        total: 0,
        correct: 0,
        sharpnessSum: 0,
        blurryCount: 0,
        luminanceSum: 0,
      };
      siteMap.set(site, entry);
    }

    entry.total++;
    if (String(r.yTrue) === String(r.yPred)) entry.correct++;
    const sh = r.qualityProfile?.sharpness ?? 150;
    entry.sharpnessSum += sh;
    if (sh < 150) entry.blurryCount++;
    entry.luminanceSum += r.qualityProfile?.meanLuminance ?? 128;
  }

  const siteStats = Array.from(siteMap.values());

  // Compute sharpness quintile slices (5 quintiles)
  const recordsWithSharpness = records
    .filter((r) => r.qualityProfile?.sharpness !== undefined)
    .sort((a, b) => (a.qualityProfile!.sharpness) - (b.qualityProfile!.sharpness));

  const quintiles: {
    quintile: string;
    range: string;
    count: number;
    accuracy: number;
    meanSharpness: number;
  }[] = [];

  if (recordsWithSharpness.length >= 5) {
    const qSize = Math.floor(recordsWithSharpness.length / 5);
    for (let i = 0; i < 5; i++) {
      const slice =
        i === 4
          ? recordsWithSharpness.slice(i * qSize)
          : recordsWithSharpness.slice(i * qSize, (i + 1) * qSize);

      let correct = 0;
      let sharpSum = 0;
      for (const r of slice) {
        if (String(r.yTrue) === String(r.yPred)) correct++;
        sharpSum += r.qualityProfile!.sharpness;
      }

      const minSh = slice[0].qualityProfile!.sharpness.toFixed(0);
      const maxSh = slice[slice.length - 1].qualityProfile!.sharpness.toFixed(0);

      quintiles.push({
        quintile: `Q${i + 1} (${i === 0 ? 'Blurriest' : i === 4 ? 'Sharpest' : `Tier ${i + 1}`})`,
        range: `${minSh} – ${maxSh}`,
        count: slice.length,
        accuracy: slice.length > 0 ? (correct / slice.length) * 100 : 0,
        meanSharpness: slice.length > 0 ? sharpSum / slice.length : 0,
      });
    }
  }

  return (
    <div className="space-y-6">
      {/* KPI Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
          <div className="text-xs text-slate-400 mb-1">Mean Dataset Sharpness</div>
          <div className="text-2xl font-bold text-indigo-400 font-mono">
            {qualitySummary ? qualitySummary.meanSharpness.toFixed(1) : '—'}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">Discrete Laplacian variance</div>
        </div>

        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
          <div className="text-xs text-slate-400 mb-1">Blurry Image Rate</div>
          <div className="text-2xl font-bold text-rose-400 font-mono">
            {qualitySummary ? `${(qualitySummary.blurryImageRate * 100).toFixed(1)}%` : '—'}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            {qualitySummary?.blurryImageCount} images &lt; 150 cutoff
          </div>
        </div>

        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
          <div className="text-xs text-slate-400 mb-1">Mean Luminance</div>
          <div className="text-2xl font-bold text-slate-200 font-mono">
            {qualitySummary ? qualitySummary.meanLuminance.toFixed(1) : '—'}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">Grayscale intensity [0–255]</div>
        </div>

        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
          <div className="text-xs text-slate-400 mb-1">Mean RMS Contrast</div>
          <div className="text-2xl font-bold text-teal-400 font-mono">
            {qualitySummary ? qualitySummary.meanRmsContrast.toFixed(3) : '—'}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">Normalized std deviation</div>
        </div>
      </div>

      {/* Slices over Sharpness Quintiles */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 backdrop-blur">
        <h3 className="text-base font-semibold text-white mb-1">
          Performance Degradation Across Sharpness Quintiles
        </h3>
        <p className="text-xs text-slate-400 mb-4">
          Empirical evaluation over image quality quintiles. Exposes whether model accuracy collapses under optical blur.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-950/80 text-slate-400 font-mono uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Quintile</th>
                <th className="px-4 py-3">Sharpness Range</th>
                <th className="px-4 py-3 text-right">Sample Count</th>
                <th className="px-4 py-3 text-right">Mean Sharpness</th>
                <th className="px-4 py-3 text-right">Accuracy</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {quintiles.map((q, idx) => (
                <tr key={q.quintile} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3 font-semibold text-white">{q.quintile}</td>
                  <td className="px-4 py-3 text-slate-300">{q.range}</td>
                  <td className="px-4 py-3 text-right text-slate-300">{q.count}</td>
                  <td className="px-4 py-3 text-right text-slate-300">{q.meanSharpness.toFixed(1)}</td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={`font-bold ${
                        idx === 0 && q.accuracy < 60
                          ? 'text-rose-400'
                          : q.accuracy >= 80
                          ? 'text-emerald-400'
                          : 'text-amber-400'
                      }`}
                    >
                      {q.accuracy.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Acquisition Site Distribution Disparity */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 backdrop-blur">
        <h3 className="text-base font-semibold text-white mb-1">
          Acquisition Environment Disparity (Site A vs Site B)
        </h3>
        <p className="text-xs text-slate-400 mb-4">
          Comparison between capture environments (e.g. tripod dermascope in lab vs handheld mobile sensor in clinic).
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-950/80 text-slate-400 font-mono uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Acquisition Site</th>
                <th className="px-4 py-3 text-right">Sample Size</th>
                <th className="px-4 py-3 text-right">Mean Sharpness</th>
                <th className="px-4 py-3 text-right">Blurry Rate (&lt;150)</th>
                <th className="px-4 py-3 text-right">Mean Luminance</th>
                <th className="px-4 py-3 text-right">Accuracy</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {siteStats.map((st) => {
                const acc = st.total > 0 ? (st.correct / st.total) * 100 : 0;
                const meanSh = st.total > 0 ? st.sharpnessSum / st.total : 0;
                const blurRate = st.total > 0 ? (st.blurryCount / st.total) * 100 : 0;
                const meanLum = st.total > 0 ? st.luminanceSum / st.total : 0;

                return (
                  <tr key={st.site} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3 font-semibold text-white font-mono">{st.site}</td>
                    <td className="px-4 py-3 text-right text-slate-300 font-mono">{st.total}</td>
                    <td className="px-4 py-3 text-right font-mono">
                      <span className={meanSh < 150 ? 'text-rose-400 font-bold' : 'text-slate-200'}>
                        {meanSh.toFixed(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-300">
                      {blurRate.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-300">
                      {meanLum.toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      <span className={`font-bold ${acc < 60 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {acc.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
