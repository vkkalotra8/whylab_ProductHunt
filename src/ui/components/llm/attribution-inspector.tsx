'use client';

import React, { useState } from 'react';
import { ShieldAlert, CheckCircle2, AlertTriangle, FileText, BookmarkX } from 'lucide-react';
import type { AttributionSummaryMetrics } from '@/core/diagnostics/llm/attribution-checker';

interface AttributionInspectorProps {
  metrics: AttributionSummaryMetrics;
}

export function AttributionInspector({ metrics }: AttributionInspectorProps) {
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(
    metrics.perRecordResults[0]?.caseId ?? null
  );

  if (metrics.status === 'unavailable') {
    return (
      <div className="card" style={{ padding: 'var(--space-5)', background: 'var(--bg-surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
          <ShieldAlert size={18} color="var(--color-warning)" />
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            Context Attribution: Unavailable
          </h3>
        </div>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: 0 }}>
          {metrics.reason ??
            'This evaluation dataset does not contain retrieved context chunks. Attribution and hallucination verification require context passages.'}
        </p>
      </div>
    );
  }

  const selectedRecord =
    metrics.perRecordResults.find((r) => r.caseId === selectedCaseId) ??
    metrics.perRecordResults[0];

  const overallScorePct = (metrics.meanAttributionScore * 100).toFixed(1);
  const unsupportedRatePct = (metrics.unsupportedClaimRate * 100).toFixed(1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* Top Scorecard Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-3)' }}>
        <div className="card" style={{ padding: 'var(--space-3)', background: 'var(--bg-surface)' }}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            Overall Attribution Score
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-success)', marginTop: '4px' }}>
            {overallScorePct}%
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Mean semantic overlap with context
          </div>
        </div>

        <div className="card" style={{ padding: 'var(--space-3)', background: 'var(--bg-surface)' }}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            Unsupported Claim Rate
          </div>
          <div
            style={{
              fontSize: '1.75rem',
              fontWeight: 700,
              color: metrics.totalUnsupportedClaims > 0 ? 'var(--color-danger)' : 'var(--color-success)',
              marginTop: '4px',
            }}
          >
            {unsupportedRatePct}%
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {metrics.totalUnsupportedClaims} / {metrics.totalClaimsEvaluated} sentences lack context support
          </div>
        </div>

        <div className="card" style={{ padding: 'var(--space-3)', background: 'var(--bg-surface)' }}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            Phantom Citations
          </div>
          <div
            style={{
              fontSize: '1.75rem',
              fontWeight: 700,
              color: metrics.totalPhantomCitations > 0 ? 'var(--color-danger)' : 'var(--color-success)',
              marginTop: '4px',
            }}
          >
            {metrics.totalPhantomCitations}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Citations referencing non-existent documents
          </div>
        </div>
      </div>

      {/* Case Selector and Claim Highlight Inspector */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) 2.5fr', gap: 'var(--space-4)' }}>
        {/* Case List Sidebar */}
        <div className="card" style={{ padding: 'var(--space-3)', background: 'var(--bg-surface)', maxHeight: '420px', overflowY: 'auto' }}>
          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 'var(--space-2)' }}>
            Evaluation Cases
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {metrics.perRecordResults.map((r) => {
              const isSelected = r.caseId === selectedCaseId;
              const hasDefect = r.unsupportedClaimsCount > 0 || r.phantomCitationsCount > 0;

              return (
                <button
                  key={r.caseId}
                  type="button"
                  onClick={() => setSelectedCaseId(r.caseId)}
                  className={`btn ${isSelected ? 'btn-primary' : 'btn-ghost'}`}
                  style={{
                    justifyContent: 'space-between',
                    fontSize: 'var(--text-xs)',
                    padding: '6px 10px',
                    height: 'auto',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{r.caseId}</span>
                  {hasDefect && (
                    <span className="badge badge-danger" style={{ fontSize: '10px', padding: '1px 5px' }}>
                      {r.unsupportedClaimsCount > 0 ? `${r.unsupportedClaimsCount} unsupported` : 'phantom cite'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Claim Detail Inspector Panel */}
        {selectedRecord && (
          <div className="card" style={{ padding: 'var(--space-4)', background: 'var(--bg-surface)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
              <div>
                <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                  Case <span style={{ fontFamily: 'var(--font-mono)' }}>{selectedRecord.caseId}</span> — Sentence-Level Grounding
                </h4>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Attribution: {(selectedRecord.overallAttributionScore * 100).toFixed(0)}% | {selectedRecord.claims.length} claims analyzed
                </div>
              </div>
            </div>

            {/* Claims list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {selectedRecord.claims.map((claim, idx) => {
                let badgeStyle = { bg: 'rgba(16, 185, 129, 0.1)', border: 'rgba(16, 185, 129, 0.3)', color: 'var(--color-success)', text: 'ATTRIBUTED' };
                if (claim.classification === 'PARTIAL_SUPPORT') {
                  badgeStyle = { bg: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.3)', color: 'var(--color-warning)', text: 'PARTIAL SUPPORT' };
                } else if (claim.classification === 'UNSUPPORTED_CLAIM') {
                  badgeStyle = { bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.3)', color: 'var(--color-danger)', text: 'UNSUPPORTED CLAIM' };
                }

                return (
                  <div
                    key={idx}
                    style={{
                      padding: 'var(--space-3)',
                      background: badgeStyle.bg,
                      border: `1px solid ${badgeStyle.border}`,
                      borderRadius: 'var(--radius-md)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: badgeStyle.color }}>
                        Sentence #{claim.sentenceIndex} — {badgeStyle.text} ({(claim.attributionScore * 100).toFixed(0)}% support)
                      </span>
                      {claim.phantomCitations.length > 0 && (
                        <span className="badge badge-danger" style={{ fontSize: '10px' }}>
                          <BookmarkX size={10} style={{ marginRight: '3px' }} />
                          Phantom: {claim.phantomCitations.map((c) => `[${c}]`).join(', ')}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                      {claim.claimText}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
