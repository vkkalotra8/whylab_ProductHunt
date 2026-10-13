'use client';

import React, { useState } from 'react';
import { ArrowRight, AlertTriangle, CheckCircle2, Sliders, TrendingUp, TrendingDown, Layers } from 'lucide-react';
import type { PromptComparisonSummary } from '@/core/diagnostics/llm/prompt-comparison';

interface PromptComparisonViewProps {
  summary: PromptComparisonSummary;
}

export function PromptComparisonView({ summary }: PromptComparisonViewProps) {
  const [filterMode, setFilterMode] = useState<'all' | 'regressions' | 'wins'>('regressions');
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(
    summary.regressedCaseIds[0] ?? summary.pairedCases[0]?.caseId ?? null
  );

  const filteredCases = summary.pairedCases.filter((p) => {
    if (filterMode === 'regressions') return p.outcome === 'CANDIDATE_REGRESSION';
    if (filterMode === 'wins') return p.outcome === 'CANDIDATE_WIN';
    return true;
  });

  const selectedCase =
    summary.pairedCases.find((p) => p.caseId === selectedCaseId) ?? summary.pairedCases[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* Metric Comparison Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-3)' }}>
        {/* Candidate Wins */}
        <div className="card" style={{ padding: 'var(--space-3)', background: 'var(--bg-surface)' }}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            Prompt B Wins
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-success)', marginTop: '4px' }}>
            +{summary.candidateWinsCount}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Candidate passed where Baseline failed
          </div>
        </div>

        {/* Candidate Regressions */}
        <div className="card" style={{ padding: 'var(--space-3)', background: 'var(--bg-surface)' }}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            Regressions (Defects)
          </div>
          <div
            style={{
              fontSize: '1.75rem',
              fontWeight: 700,
              color: summary.candidateRegressionsCount > 0 ? 'var(--color-danger)' : 'var(--color-success)',
              marginTop: '4px',
            }}
          >
            {summary.candidateRegressionsCount}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Candidate broke cases Baseline previously passed
          </div>
        </div>

        {/* Net Improvement Rate */}
        <div className="card" style={{ padding: 'var(--space-3)', background: 'var(--bg-surface)' }}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            Net Win Rate
          </div>
          <div
            style={{
              fontSize: '1.75rem',
              fontWeight: 700,
              color: summary.netWinRate >= 0 ? 'var(--color-primary)' : 'var(--color-danger)',
              marginTop: '4px',
            }}
          >
            {(summary.netWinRate * 100).toFixed(1)}%
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            (Wins - Regressions) / {summary.pairedCasesCount} paired cases
          </div>
        </div>

        {/* McNemar Significance Test */}
        <div className="card" style={{ padding: 'var(--space-3)', background: 'var(--bg-surface)' }}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            McNemar Test (p-value)
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>
            p = {summary.mcnemarPValue.toFixed(4)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {summary.isStatisticallySignificant ? (
              <span style={{ color: 'var(--color-success)' }}>Statistically Significant (p &lt; 0.05)</span>
            ) : (
              <span>Not Significant (p &ge; 0.05)</span>
            )}
          </div>
        </div>
      </div>

      {/* Regression Alert Banner if regressions exist */}
      {summary.candidateRegressionsCount > 0 && (
        <div
          style={{
            padding: 'var(--space-3)',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
          }}
        >
          <AlertTriangle size={18} color="var(--color-danger)" style={{ flexShrink: 0 }} />
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger)' }}>
            <strong>Prompt Regression Alert:</strong> Candidate prompt regressed on{' '}
            <strong>{summary.candidateRegressionsCount}</strong> cases ({summary.regressedCaseIds.join(', ')}). In WhyLab 2.0, prompt repairs require verified zero regression guarantees before production sign-off.
          </div>
        </div>
      )}

      {/* Side-by-Side Comparison Inspector */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) 2.5fr', gap: 'var(--space-4)' }}>
        {/* Paired Case Selector */}
        <div className="card" style={{ padding: 'var(--space-3)', background: 'var(--bg-surface)', maxHeight: '440px', overflowY: 'auto' }}>
          <div style={{ display: 'flex', gap: '4px', marginBottom: 'var(--space-2)' }}>
            <button
              type="button"
              onClick={() => setFilterMode('regressions')}
              className={`btn ${filterMode === 'regressions' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: '10px', padding: '3px 8px', height: 'auto' }}
            >
              Regressions ({summary.candidateRegressionsCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('wins')}
              className={`btn ${filterMode === 'wins' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: '10px', padding: '3px 8px', height: 'auto' }}
            >
              Wins ({summary.candidateWinsCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`btn ${filterMode === 'all' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: '10px', padding: '3px 8px', height: 'auto' }}
            >
              All ({summary.pairedCasesCount})
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {filteredCases.map((p) => {
              const isSelected = p.caseId === selectedCaseId;
              let badgeColor = 'neutral';
              if (p.outcome === 'CANDIDATE_REGRESSION') badgeColor = 'danger';
              else if (p.outcome === 'CANDIDATE_WIN') badgeColor = 'success';

              return (
                <button
                  key={p.caseId}
                  type="button"
                  onClick={() => setSelectedCaseId(p.caseId)}
                  className={`btn ${isSelected ? 'btn-primary' : 'btn-ghost'}`}
                  style={{
                    justifyContent: 'space-between',
                    fontSize: 'var(--text-xs)',
                    padding: '6px 10px',
                    height: 'auto',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{p.caseId}</span>
                  <span className={`badge badge-${badgeColor}`} style={{ fontSize: '10px', padding: '1px 5px' }}>
                    {p.outcome.replace('CANDIDATE_', '')}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Side-by-Side Output Inspector */}
        {selectedCase && (
          <div className="card" style={{ padding: 'var(--space-4)', background: 'var(--bg-surface)' }}>
            <div style={{ marginBottom: 'var(--space-3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 'var(--text-sm)' }}>
                  {selectedCase.caseId}
                </span>
                <span className={`badge ${selectedCase.outcome === 'CANDIDATE_REGRESSION' ? 'badge-danger' : selectedCase.outcome === 'CANDIDATE_WIN' ? 'badge-success' : 'badge-neutral'}`}>
                  {selectedCase.outcome}
                </span>
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: '4px' }}>
                <strong>Prompt:</strong> {selectedCase.prompt}
              </div>
              {selectedCase.referenceAnswer && (
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-success)', marginTop: '2px' }}>
                  <strong>Ground Truth Reference:</strong> {selectedCase.referenceAnswer}
                </div>
              )}
            </div>

            {/* Side by side outputs */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              {/* Baseline Output */}
              <div
                style={{
                  padding: 'var(--space-3)',
                  background: 'var(--bg-code)',
                  border: `1px solid ${selectedCase.baselinePassed ? 'var(--color-success)' : 'var(--color-danger)'}`,
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 600, marginBottom: '4px' }}>
                  <span>Baseline (Prompt A)</span>
                  <span style={{ color: selectedCase.baselinePassed ? 'var(--color-success)' : 'var(--color-danger)' }}>
                    {selectedCase.baselinePassed ? 'PASS' : 'FAIL'}
                  </span>
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                  {selectedCase.baselineResponse}
                </div>
              </div>

              {/* Candidate Output */}
              <div
                style={{
                  padding: 'var(--space-3)',
                  background: 'var(--bg-code)',
                  border: `1px solid ${selectedCase.candidatePassed ? 'var(--color-success)' : 'var(--color-danger)'}`,
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 600, marginBottom: '4px' }}>
                  <span>Candidate (Prompt B)</span>
                  <span style={{ color: selectedCase.candidatePassed ? 'var(--color-success)' : 'var(--color-danger)' }}>
                    {selectedCase.candidatePassed ? 'PASS' : 'FAIL'}
                  </span>
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                  {selectedCase.candidateResponse}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
