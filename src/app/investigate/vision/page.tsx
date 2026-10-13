'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { VisionMetricCards } from '@/ui/components/vision/vision-metric-cards';
import { MisclassificationFilter, type VisionFilterState } from '@/ui/components/vision/misclassification-filter';
import { ImageGallery } from '@/ui/components/vision/image-gallery';
import { ConfusionMatrixView } from '@/ui/components/vision/confusion-matrix-view';
import { QualityDriftView } from '@/ui/components/vision/quality-drift-view';
import { DuplicateScannerView } from '@/ui/components/vision/duplicate-scanner-view';
import { PerceptualLeakageView } from '@/ui/components/vision/perceptual-leakage-view';
import { ShortcutAnalysisView } from '@/ui/components/vision/shortcut-analysis-view';
import { AutonomousInvestigationView } from '@/ui/components/vision/autonomous-investigation-view';
import { evaluateMulticlassVisionMetrics } from '@/core/diagnostics/vision/multiclass-metrics';
import { summarizeQualityDistribution } from '@/core/diagnostics/vision/image-quality';
import { scanExactDuplicates } from '@/core/diagnostics/vision/exact-duplicates';
import { scanCrossSplitLeakage, type CrossSplitLeakageReport } from '@/core/diagnostics/vision/leakage-detector';
import { detectShortcutLearning, type ShortcutLearningReport } from '@/core/diagnostics/vision/shortcut-detector';
import { generateSyntheticThumbnail } from '@/server/vision/thumbnail-generator';
import type { VisionRecord, MulticlassSummaryMetrics, ExactDuplicateReport, ImageQualityProfile } from '@/core/domain/vision-types';
import type { QualityDistributionSummary } from '@/core/diagnostics/vision/image-quality';

export default function VisionInvestigationStudio() {
  const [activeTab, setActiveTab] = useState<
    'gallery' | 'confusion' | 'leakage' | 'quality' | 'shortcut' | 'autonomous'
  >('gallery');
  const [isLoading, setIsLoading] = useState(false);
  const [datasetName, setDatasetName] = useState<string>('Flagship Dermatology (Melanoma Diagnostics)');
  const [records, setRecords] = useState<VisionRecord[]>([]);
  const [filters, setFilters] = useState<VisionFilterState>({
    search: '',
    outcome: 'ALL',
    failureCategory: 'ALL',
    split: 'ALL',
    quality: 'ALL',
    ruler: 'ALL',
  });

  // Load default flagship fixture on mount
  useEffect(() => {
    loadFlagshipFixture();
  }, []);

  async function loadFlagshipFixture() {
    setIsLoading(true);
    try {
      const res = await fetch('/fixtures/vision/synthetic-fixture.json');
      if (!res.ok) throw new Error('Failed loading vision fixture');
      const data = await res.json();

      const profileMap = new Map<string, ImageQualityProfile>();
      if (Array.isArray(data.profiles)) {
        for (const p of data.profiles) profileMap.set(p.imageId, p);
      }

      // Parse CSV
      const csvLines = (data.csv as string).trim().split('\n');
      const header = csvLines[0].split(',');
      const parsedRecords: VisionRecord[] = [];

      for (let i = 1; i < csvLines.length; i++) {
        const parts = csvLines[i].split(',');
        if (parts.length < 3) continue;

        const imageId = parts[0];
        const yTrue = parts[1];
        const yPred = parts[2];
        const yProb = parts[3] ? parseFloat(parts[3]) : undefined;
        const split = parts[4] as any;
        const site = parts[5];
        const device = parts[6];
        const hasRuler = parts[8] ? parseInt(parts[8], 10) : 0;

        const profile = profileMap.get(imageId);
        const sharpness = profile?.sharpness ?? 200;

        // Generate synthetic preview thumbnail
        const thumb = generateSyntheticThumbnail(imageId, yTrue, yPred, {
          hasRuler: hasRuler === 1,
          sharpness,
        });

        parsedRecords.push({
          imageId,
          yTrue,
          yPred,
          yProbability: yProb,
          confidence: yProb,
          split,
          site,
          device,
          metadata: { has_ruler: hasRuler },
          qualityProfile: profile,
          thumbnailDataUrl: thumb,
        });
      }

      setRecords(parsedRecords);
      setDatasetName('Flagship Dermatology (Melanoma Diagnostics — 200 images)');
    } catch (err) {
      console.error('Failed to load vision fixture:', err);
    } finally {
      setIsLoading(false);
    }
  }

  // Multiclass metrics evaluation
  const { metrics, evaluatedRecords } = useMemo(() => {
    return evaluateMulticlassVisionMetrics(records);
  }, [records]);

  // Quality distribution summary
  const qualitySummary: QualityDistributionSummary | null = useMemo(() => {
    const profiles = evaluatedRecords
      .map((r) => r.qualityProfile)
      .filter((p): p is ImageQualityProfile => p !== undefined);
    return profiles.length > 0 ? summarizeQualityDistribution(profiles) : null;
  }, [evaluatedRecords]);

  // Duplicate scan report
  const duplicateReport: ExactDuplicateReport | null = useMemo(() => {
    if (evaluatedRecords.length === 0) return null;
    const items = evaluatedRecords.map((r) => ({
      imageId: r.imageId,
      split: r.split,
      sha256Digest: r.qualityProfile?.dHash ?? r.imageId,
    }));
    return scanExactDuplicates(items);
  }, [evaluatedRecords]);

  // Perceptual cross-split leakage report (dHash near-duplicates)
  const leakageReport: CrossSplitLeakageReport | null = useMemo(() => {
    if (evaluatedRecords.length === 0) return null;
    return scanCrossSplitLeakage(evaluatedRecords);
  }, [evaluatedRecords]);

  // Shortcut learning report (scale ruler confounder)
  const shortcutReport: ShortcutLearningReport | null = useMemo(() => {
    if (evaluatedRecords.length === 0) return null;
    return detectShortcutLearning(evaluatedRecords);
  }, [evaluatedRecords]);

  // Available splits in dataset
  const availableSplits = useMemo(() => {
    const set = new Set<string>();
    for (const r of evaluatedRecords) {
      if (r.split) set.add(r.split);
    }
    return Array.from(set).sort();
  }, [evaluatedRecords]);

  // Filtered records for Gallery view
  const filteredRecords = useMemo(() => {
    return evaluatedRecords.filter((r) => {
      // Search
      if (filters.search) {
        const query = filters.search.toLowerCase();
        if (!r.imageId.toLowerCase().includes(query)) return false;
      }

      // Outcome
      if (filters.outcome !== 'ALL') {
        const isCorrect = String(r.yTrue) === String(r.yPred);
        if (filters.outcome === 'CORRECT' && !isCorrect) return false;
        if (filters.outcome === 'INCORRECT' && isCorrect) return false;
        if (filters.outcome === 'TRUE_POSITIVE' && r.outcome !== 'TRUE_POSITIVE') return false;
        if (filters.outcome === 'FALSE_POSITIVE' && r.outcome !== 'FALSE_POSITIVE') return false;
        if (filters.outcome === 'FALSE_NEGATIVE' && r.outcome !== 'FALSE_NEGATIVE') return false;
      }

      // Failure Category
      if (filters.failureCategory !== 'ALL') {
        if (r.failureCategory !== filters.failureCategory) return false;
      }

      // Split
      if (filters.split !== 'ALL') {
        if (r.split !== filters.split) return false;
      }

      // Quality
      if (filters.quality !== 'ALL') {
        const sh = r.qualityProfile?.sharpness ?? 200;
        if (filters.quality === 'BLURRY' && sh >= 150) return false;
        if (filters.quality === 'SHARP' && sh < 150) return false;
      }

      // Ruler confounder
      if (filters.ruler !== 'ALL') {
        const hasR = (r.metadata?.has_ruler as number) === 1;
        if (filters.ruler === 'HAS_RULER' && !hasR) return false;
        if (filters.ruler === 'NO_RULER' && hasR) return false;
      }

      return true;
    });
  }, [evaluatedRecords, filters]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2">
              <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-teal-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">
                WhyLab 2.0
              </span>
            </Link>

            {/* Modality Tabs */}
            <nav className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-lg border border-slate-800">
              <Link
                href="/investigate"
                className="px-3 py-1 rounded text-xs font-medium text-slate-400 hover:text-white transition-colors"
              >
                Tabular ML
              </Link>
              <Link
                href="/investigate/llm"
                className="px-3 py-1 rounded text-xs font-medium text-slate-400 hover:text-white transition-colors"
              >
                LLM &amp; RAG
              </Link>
              <span className="px-3 py-1 rounded text-xs font-semibold bg-indigo-600 text-white shadow-sm">
                Computer Vision
              </span>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadFlagshipFixture}
              disabled={isLoading}
              className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg border border-slate-700 transition-colors flex items-center gap-1.5"
            >
              <span className="w-2 h-2 rounded-full bg-teal-400" />
              Reset Flagship Fixture
            </button>
          </div>
        </div>
      </header>

      {/* Main Studio Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Studio Title and Dataset Info */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800/80">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Computer Vision Reliability Studio
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Active Dataset: <strong className="text-indigo-400 font-mono">{datasetName}</strong>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-mono">
              Engine: <strong className="text-teal-400">Pure TypeScript Deterministic</strong>
            </span>
          </div>
        </div>

        {/* High-Level Metric KPI Scorecard */}
        <VisionMetricCards
          metrics={metrics}
          qualitySummary={qualitySummary}
          duplicateReport={duplicateReport}
        />

        {/* Sub-Tabs Navigation */}
        <div className="border-b border-slate-800 flex items-center gap-1 overflow-x-auto pb-0.5">
          <button
            onClick={() => setActiveTab('gallery')}
            className={`px-3.5 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'gallery'
                ? 'border-indigo-500 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Gallery ({evaluatedRecords.length})
          </button>

          <button
            onClick={() => setActiveTab('confusion')}
            className={`px-3.5 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'confusion'
                ? 'border-indigo-500 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Confusion Matrix
          </button>

          <button
            onClick={() => setActiveTab('leakage')}
            className={`px-3.5 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeTab === 'leakage'
                ? 'border-indigo-500 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Near-Duplicate Leakage</span>
            {(leakageReport?.leakedImageCount ?? 0) > 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('quality')}
            className={`px-3.5 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'quality'
                ? 'border-indigo-500 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Blur &amp; Quality Drift
          </button>

          <button
            onClick={() => setActiveTab('shortcut')}
            className={`px-3.5 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeTab === 'shortcut'
                ? 'border-indigo-500 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Shortcut Artifact Bias</span>
            {shortcutReport?.hasShortcutBiasConfirmed && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('autonomous')}
            className={`px-3.5 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeTab === 'autonomous'
                ? 'border-indigo-500 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="text-indigo-400">⚡</span>
            <span>Astra Autonomous Investigation</span>
          </button>
        </div>

        {/* Tab Content Panes */}
        {activeTab === 'gallery' && (
          <div>
            <MisclassificationFilter
              filters={filters}
              onFilterChange={setFilters}
              availableSplits={availableSplits}
              totalCount={evaluatedRecords.length}
              filteredCount={filteredRecords.length}
            />
            <ImageGallery records={filteredRecords} />
          </div>
        )}

        {activeTab === 'confusion' && <ConfusionMatrixView metrics={metrics} />}

        {activeTab === 'leakage' && <PerceptualLeakageView report={leakageReport} />}

        {activeTab === 'quality' && (
          <QualityDriftView records={evaluatedRecords} qualitySummary={qualitySummary} />
        )}

        {activeTab === 'shortcut' && <ShortcutAnalysisView report={shortcutReport} />}

        {activeTab === 'autonomous' && (
          <AutonomousInvestigationView records={evaluatedRecords} datasetName={datasetName} />
        )}
      </main>
    </div>
  );
}
