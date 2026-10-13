'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import {
  Activity,
  FileText,
  Download,
  RotateCcw,
  ShieldCheck,
  AlertCircle,
  Clock,
  Sparkles,
  Layers,
  Camera,
  Cpu,
  Database,
  ShieldAlert,
  GitCompare,
  UserCheck,
} from 'lucide-react';
import { ingestLlmEvaluation } from '@/core/diagnostics/llm/llm-ingestion';
import { evaluateTextMetrics, type TextMetricsSummary } from '@/core/diagnostics/llm/text-metrics';
import { evaluateJsonMetrics, type JsonMetricsSummary, type SimpleJsonSchema } from '@/core/diagnostics/llm/schema-validator';
import { profilePerformance, type PerformanceSummary } from '@/core/diagnostics/llm/performance-profiler';
import { evaluateRetrievalMetrics, type RetrievalSummaryMetrics } from '@/core/diagnostics/llm/retrieval-metrics';
import { evaluateDatasetAttribution, type AttributionSummaryMetrics } from '@/core/diagnostics/llm/attribution-checker';
import { comparePromptVersions, type PromptComparisonSummary } from '@/core/diagnostics/llm/prompt-comparison';
import { evaluateWithRubric, type StructuredJudgeResult } from '@/core/diagnostics/llm/structured-judge';
import { generateLlmMarkdownReport, generateLlmPdfReport } from '@/server/export/llm-report-generator';
import type { LlmEvaluationDataset, LlmPricingConfig, LlmRecord } from '@/core/domain/llm-types';

import { LlmMetricCards } from '@/ui/components/llm/llm-metric-cards';
import { LlmFailureExplorer } from '@/ui/components/llm/llm-failure-explorer';
import { LlmDropzone } from '@/ui/components/llm/llm-dropzone';
import { RagRetrievalCard } from '@/ui/components/llm/rag-retrieval-card';
import { AttributionInspector } from '@/ui/components/llm/attribution-inspector';
import { PromptComparisonView } from '@/ui/components/llm/prompt-comparison-view';
import { HumanReviewQueue } from '@/ui/components/llm/human-review-queue';

type StudioTab = 'overview' | 'retrieval' | 'attribution' | 'comparison' | 'human_review';

export default function LlmInvestigationPage() {
  const [dataset, setDataset] = useState<LlmEvaluationDataset | null>(null);
  const [activeTab, setActiveTab] = useState<StudioTab>('overview');
  const [pricing, setPricing] = useState<LlmPricingConfig | null>(null);
  const [targetSchema, setTargetSchema] = useState<SimpleJsonSchema | undefined>(undefined);
  const [ingestionErrors, setIngestionErrors] = useState<string[]>([]);
  const [ingestionWarnings, setIngestionWarnings] = useState<string[]>([]);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // Compute evaluations whenever dataset, pricing, or targetSchema updates
  const textMetrics = useMemo<TextMetricsSummary | null>(() => {
    if (!dataset) return null;
    return evaluateTextMetrics(dataset.records);
  }, [dataset]);

  const jsonMetrics = useMemo<JsonMetricsSummary | null>(() => {
    if (!dataset) return null;
    return evaluateJsonMetrics(dataset.records, targetSchema);
  }, [dataset, targetSchema]);

  const performance = useMemo<PerformanceSummary | null>(() => {
    if (!dataset) return null;
    return profilePerformance(dataset.records, pricing);
  }, [dataset, pricing]);

  // RAG retrieval metrics
  const retrievalMetrics = useMemo<RetrievalSummaryMetrics | null>(() => {
    if (!dataset) return null;
    const queryRecords = dataset.records.map((r) => {
      const meta = r.metadata ?? {};
      const retrieved = Array.isArray(meta.retrieved_doc_ids)
        ? (meta.retrieved_doc_ids as string[])
        : Array.isArray(r.retrievedContext)
          ? r.retrievedContext.map((c, i) => (typeof c === 'object' && c && 'id' in c ? String(c.id) : String(i + 1)))
          : [];
      const relevant = Array.isArray(meta.relevant_doc_ids)
        ? (meta.relevant_doc_ids as string[])
        : null;

      return {
        caseId: r.caseId,
        retrievedDocIds: retrieved,
        relevantDocIds: relevant,
      };
    });

    return evaluateRetrievalMetrics(queryRecords);
  }, [dataset]);

  // Context attribution metrics
  const attributionMetrics = useMemo<AttributionSummaryMetrics | null>(() => {
    if (!dataset) return null;
    return evaluateDatasetAttribution(
      dataset.records.map((r) => ({
        caseId: r.caseId,
        response: r.response,
        retrievedContext: r.retrievedContext,
      }))
    );
  }, [dataset]);

  // Simulated judge ratings and human review queue
  const judgeResults = useMemo<StructuredJudgeResult[]>(() => {
    if (!dataset) return [];
    return dataset.records.map((r) => {
      const textRes = textMetrics?.perRecordResults.find((tr) => tr.caseId === r.caseId);
      const isMismatch = textRes?.hasReference && !textRes.normalizedExactMatch;

      return evaluateWithRubric(
        r.caseId,
        r.prompt,
        r.response,
        'factual_correctness',
        {
          referenceAnswer: r.referenceAnswer,
          tokenF1: textRes?.tokenF1,
          simulatedScore: isMismatch ? 2 : 5,
          simulatedConfidence: isMismatch ? 0.65 : 0.92,
          simulatedRationale: isMismatch
            ? 'Output deviates from ground-truth reference answer.'
            : 'Response cleanly matches verified reference.',
        }
      );
    });
  }, [dataset, textMetrics]);

  // Prompt comparison sample (Candidate prompt with strict instruction formatting)
  const promptComparison = useMemo<PromptComparisonSummary | null>(() => {
    if (!dataset) return null;
    // Construct synthetic candidate prompt run where some defects are repaired
    const candidateRecords: LlmRecord[] = dataset.records.map((r) => {
      // If original had markdown fence or slight defect, make candidate perfect
      if (r.caseId === 'cs_004' || r.caseId === 'cs_005') {
        return {
          ...r,
          response: r.referenceAnswer ?? r.response,
          latencyMs: (r.latencyMs ?? 300) - 25,
        };
      }
      return r;
    });

    return comparePromptVersions(dataset.records, candidateRecords);
  }, [dataset]);

  const handleFileLoaded = (rawContent: string, filename: string) => {
    const res = ingestLlmEvaluation(rawContent, { filename });
    if (res.dataset) {
      setDataset(res.dataset);
      setIngestionErrors(res.errors.map((e) => e.message));
      setIngestionWarnings(res.warnings);
    } else {
      setIngestionErrors(res.errors.map((e) => e.message));
      setIngestionWarnings(res.warnings);
    }
  };

  // Export handlers
  const handleExportMarkdown = () => {
    if (!dataset || !textMetrics || !performance) return;
    const md = generateLlmMarkdownReport({
      dataset,
      textMetrics,
      jsonMetrics: jsonMetrics ?? undefined,
      performance,
    });
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${dataset.name.replace(/\.[^/.]+$/, '')}-llm-report.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPdf = () => {
    if (!dataset || !textMetrics || !performance) return;
    setIsExportingPdf(true);
    try {
      const pdfBytes = generateLlmPdfReport({
        dataset,
        textMetrics,
        jsonMetrics: jsonMetrics ?? undefined,
        performance,
      });
      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${dataset.name.replace(/\.[^/.]+$/, '')}-incident-report.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('PDF generation error:', e);
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Auto-load sample fixture on initial mount if empty
  useEffect(() => {
    if (!dataset) {
      fetch('/fixtures/llm/customer-support-eval.jsonl')
        .then((res) => (res.ok ? res.text() : null))
        .then((text) => {
          if (text) {
            handleFileLoaded(text, 'customer-support-eval.jsonl');
          }
        })
        .catch(() => {});
    }
  }, []);

  return (
    <div className="container-wide" style={{ padding: 'var(--space-6) var(--space-4)', minHeight: '85vh' }}>
      {/* Modality Switcher Navigation Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--space-6)',
          borderBottom: '1px solid var(--border-default)',
          paddingBottom: 'var(--space-4)',
          flexWrap: 'wrap',
          gap: 'var(--space-3)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Investigation Studio
            </h1>
            <span className="badge badge-primary" style={{ fontSize: '11.5px', padding: '3px 8px' }}>
              MULTI-MODAL
            </span>
          </div>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
            Autonomous reliability investigation and failure diagnosis across Tabular ML, LLMs, and Computer Vision.
          </p>
        </div>

        {/* Modality Selector Pills */}
        <div
          style={{
            display: 'flex',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-lg)',
            padding: '3px',
            gap: '2px',
          }}
        >
          <Link
            href="/investigate"
            className="btn btn-ghost"
            style={{
              fontSize: 'var(--text-xs)',
              padding: '6px 14px',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-secondary)',
            }}
          >
            <Layers size={14} style={{ marginRight: '6px' }} />
            Tabular ML
          </Link>

          <Link
            href="/investigate/llm"
            className="btn btn-primary"
            style={{
              fontSize: 'var(--text-xs)',
              padding: '6px 14px',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <Cpu size={14} style={{ marginRight: '6px' }} />
            LLM Reliability
          </Link>

          <Link
            href="/investigate/vision"
            className="btn btn-ghost"
            style={{
              fontSize: 'var(--text-xs)',
              padding: '6px 14px',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-secondary)',
            }}
          >
            <Camera size={14} style={{ marginRight: '6px' }} />
            Computer Vision
          </Link>
        </div>
      </div>

      {/* Main Studio Body */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        {/* Dropzone & Configuration */}
        <LlmDropzone
          onFileLoaded={handleFileLoaded}
          onPricingChange={setPricing}
          onSchemaChange={setTargetSchema}
        />

        {/* Ingestion Alerts */}
        {ingestionErrors.length > 0 && (
          <div
            style={{
              padding: 'var(--space-3)',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-xs)',
              color: 'var(--color-danger)',
            }}
          >
            <strong>Ingestion Notices:</strong>
            <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
              {ingestionErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Active Dataset Navigation & Controls */}
        {dataset && textMetrics && performance && (
          <>
            <div
              className="card"
              style={{
                padding: 'var(--space-4)',
                background: 'var(--bg-surface)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 'var(--space-3)',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <h2 style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                    {dataset.name}
                  </h2>
                  <span className="badge badge-info" style={{ fontSize: '11px' }}>
                    {dataset.format.toUpperCase()}
                  </span>
                  <span className="badge badge-neutral" style={{ fontSize: '11px' }}>
                    {dataset.recordCount.toLocaleString()} cases
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginTop: '4px', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  <span>
                    Digest: <code style={{ fontFamily: 'var(--font-mono)' }}>{dataset.contentDigest.slice(0, 28)}...</code>
                  </span>
                  <span>Captured: {new Date(dataset.capturedAt).toLocaleTimeString()}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                <button
                  onClick={handleExportMarkdown}
                  className="btn btn-secondary"
                  style={{ fontSize: 'var(--text-xs)', padding: '6px 12px' }}
                >
                  <FileText size={13} style={{ marginRight: '5px' }} />
                  Markdown Report
                </button>
                <button
                  onClick={handleExportPdf}
                  disabled={isExportingPdf}
                  className="btn btn-primary"
                  style={{ fontSize: 'var(--text-xs)', padding: '6px 12px' }}
                >
                  <Download size={13} style={{ marginRight: '5px' }} />
                  {isExportingPdf ? 'Exporting...' : 'Incident Report (PDF 1.4)'}
                </button>
              </div>
            </div>

            {/* Studio Diagnostic Tabs */}
            <div
              style={{
                display: 'flex',
                gap: 'var(--space-2)',
                borderBottom: '1px solid var(--border-default)',
                paddingBottom: 'var(--space-2)',
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                onClick={() => setActiveTab('overview')}
                className={`btn ${activeTab === 'overview' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: 'var(--text-xs)', padding: '6px 14px' }}
              >
                <Activity size={13} style={{ marginRight: '5px' }} />
                Overview & Metrics
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('retrieval')}
                className={`btn ${activeTab === 'retrieval' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: 'var(--text-xs)', padding: '6px 14px' }}
              >
                <Database size={13} style={{ marginRight: '5px' }} />
                RAG Retrieval Analysis
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('attribution')}
                className={`btn ${activeTab === 'attribution' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: 'var(--text-xs)', padding: '6px 14px' }}
              >
                <ShieldAlert size={13} style={{ marginRight: '5px' }} />
                Hallucination & Grounding
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('comparison')}
                className={`btn ${activeTab === 'comparison' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: 'var(--text-xs)', padding: '6px 14px' }}
              >
                <GitCompare size={13} style={{ marginRight: '5px' }} />
                Prompt Comparison Lab
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('human_review')}
                className={`btn ${activeTab === 'human_review' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: 'var(--text-xs)', padding: '6px 14px' }}
              >
                <UserCheck size={13} style={{ marginRight: '5px' }} />
                Human Review Queue
              </button>
            </div>

            {/* Tab 1: Overview & Metrics */}
            {activeTab === 'overview' && (
              <>
                <LlmMetricCards
                  textMetrics={textMetrics}
                  jsonMetrics={jsonMetrics ?? undefined}
                  performance={performance}
                />
                <LlmFailureExplorer
                  records={dataset.records}
                  textMetrics={textMetrics}
                  jsonMetrics={jsonMetrics ?? undefined}
                />
              </>
            )}

            {/* Tab 2: RAG Retrieval Analysis */}
            {activeTab === 'retrieval' && retrievalMetrics && (
              <RagRetrievalCard metrics={retrievalMetrics} />
            )}

            {/* Tab 3: Context Attribution & Hallucination */}
            {activeTab === 'attribution' && attributionMetrics && (
              <AttributionInspector metrics={attributionMetrics} />
            )}

            {/* Tab 4: Prompt Comparison Lab */}
            {activeTab === 'comparison' && promptComparison && (
              <PromptComparisonView summary={promptComparison} />
            )}

            {/* Tab 5: Human Review Queue */}
            {activeTab === 'human_review' && (
              <HumanReviewQueue initialResults={judgeResults} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
