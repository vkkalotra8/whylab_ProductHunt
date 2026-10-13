'use client';

import React from 'react';
import { CheckCircle2, AlertTriangle, Clock, Zap, DollarSign, FileCode, Layers } from 'lucide-react';
import type { TextMetricsSummary } from '@/core/diagnostics/llm/text-metrics';
import type { JsonMetricsSummary } from '@/core/diagnostics/llm/schema-validator';
import type { PerformanceSummary } from '@/core/diagnostics/llm/performance-profiler';

interface LlmMetricCardsProps {
  textMetrics: TextMetricsSummary;
  jsonMetrics?: JsonMetricsSummary;
  performance: PerformanceSummary;
}

export function LlmMetricCards({ textMetrics, jsonMetrics, performance }: LlmMetricCardsProps) {
  const emRate = (textMetrics.exactMatchRate * 100).toFixed(1);
  const nemRate = (textMetrics.normalizedExactMatchRate * 100).toFixed(1);
  const f1Score = (textMetrics.meanTokenF1 * 100).toFixed(1);
  const jsonParseRate = jsonMetrics ? (jsonMetrics.jsonParseValidityRate * 100).toFixed(1) : null;
  const p50 = performance.latency.medianMs ?? '—';
  const p95 = performance.latency.p95Ms ?? '—';
  const totalTokens = performance.tokenUsage.totalTokens.toLocaleString();

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-3)' }}>
      {/* 1. Exact Match Card */}
      <div className="card" style={{ padding: 'var(--space-3)', background: 'var(--bg-surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Exact Match (EM)
          </span>
          <CheckCircle2 size={16} color="var(--color-primary)" />
        </div>
        <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          {textMetrics.status === 'computed' ? `${emRate}%` : 'N/A'}
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 'var(--space-1)' }}>
          {textMetrics.status === 'computed'
            ? `${textMetrics.exactMatchCount} / ${textMetrics.recordsWithReferenceCount} identical`
            : 'No reference answers'}
        </div>
      </div>

      {/* 2. Normalized EM Card */}
      <div className="card" style={{ padding: 'var(--space-3)', background: 'var(--bg-surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Normalized EM
          </span>
          <Layers size={16} color="var(--color-info)" />
        </div>
        <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          {textMetrics.status === 'computed' ? `${nemRate}%` : 'N/A'}
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 'var(--space-1)' }}>
          Punctuation & case invariant
        </div>
      </div>

      {/* 3. Token-Level F1 Card */}
      <div className="card" style={{ padding: 'var(--space-3)', background: 'var(--bg-surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Token F1 Score
          </span>
          <Zap size={16} color="var(--color-success)" />
        </div>
        <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          {textMetrics.status === 'computed' ? `${f1Score}%` : 'N/A'}
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 'var(--space-1)' }}>
          Unigram harmonic overlap
        </div>
      </div>

      {/* 4. JSON Parse Validity Card */}
      <div className="card" style={{ padding: 'var(--space-3)', background: 'var(--bg-surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            JSON Validity
          </span>
          <FileCode size={16} color="#8b5cf6" />
        </div>
        <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          {jsonParseRate !== null ? `${jsonParseRate}%` : 'N/A'}
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 'var(--space-1)' }}>
          {jsonMetrics ? `${jsonMetrics.validParseCount}/${jsonMetrics.evaluatedRecordCount} valid JSON` : 'Not evaluated'}
        </div>
      </div>

      {/* 5. Latency Profile Card */}
      <div className="card" style={{ padding: 'var(--space-3)', background: 'var(--bg-surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Latency (p50 / p95)
          </span>
          <Clock size={16} color="var(--color-warning)" />
        </div>
        <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          {performance.latency.status === 'computed' ? `${p50} / ${p95} ms` : 'N/A'}
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 'var(--space-1)' }}>
          {performance.latency.sampleCount} recorded cases
        </div>
      </div>

      {/* 6. Tokens & Estimated Cost */}
      <div className="card" style={{ padding: 'var(--space-3)', background: 'var(--bg-surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Tokens & Cost
          </span>
          <DollarSign size={16} color="var(--color-success)" />
        </div>
        <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          {performance.cost.status === 'calculated'
            ? `$${performance.cost.estimatedCostUsd?.toFixed(4)}`
            : totalTokens}
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 'var(--space-1)' }}>
          {performance.cost.status === 'calculated'
            ? `${totalTokens} tokens evaluated`
            : 'Pricing unconfigured'}
        </div>
      </div>
    </div>
  );
}
