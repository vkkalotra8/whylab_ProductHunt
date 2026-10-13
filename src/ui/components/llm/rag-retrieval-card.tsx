'use client';

import React from 'react';
import { Database, Search, Target, CheckCircle2, AlertCircle } from 'lucide-react';
import type { RetrievalSummaryMetrics } from '@/core/diagnostics/llm/retrieval-metrics';

interface RagRetrievalCardProps {
  metrics: RetrievalSummaryMetrics;
}

export function RagRetrievalCard({ metrics }: RagRetrievalCardProps) {
  if (metrics.status === 'unavailable') {
    return (
      <div
        className="card"
        style={{
          padding: 'var(--space-5)',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
          <Database size={18} color="var(--color-warning)" />
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            RAG Retrieval Evaluation: Unavailable
          </h3>
        </div>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: 0 }}>
          {metrics.reason ??
            'This evaluation dataset does not contain ground-truth relevant document IDs (`relevant_doc_ids`). Retrieval metrics (Recall@k, MRR) are unavailable without relevance labels.'}
        </p>
      </div>
    );
  }

  const mrrDisplay = metrics.meanReciprocalRank.toFixed(3);
  const r1 = ((metrics.recallAtK[1] ?? 0) * 100).toFixed(1);
  const r3 = ((metrics.recallAtK[3] ?? 0) * 100).toFixed(1);
  const r5 = ((metrics.recallAtK[5] ?? 0) * 100).toFixed(1);
  const hit3 = ((metrics.hitRateAtK[3] ?? 0) * 100).toFixed(1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-3)' }}>
        <div className="card" style={{ padding: 'var(--space-3)', background: 'var(--bg-surface)' }}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            Mean Reciprocal Rank (MRR)
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>
            {mrrDisplay}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Average reciprocal rank of first relevant doc
          </div>
        </div>

        <div className="card" style={{ padding: 'var(--space-3)', background: 'var(--bg-surface)' }}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            Recall@1
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-primary)', marginTop: '4px' }}>
            {r1}%
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Fraction of relevant docs retrieved top-1
          </div>
        </div>

        <div className="card" style={{ padding: 'var(--space-3)', background: 'var(--bg-surface)' }}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            Recall@3
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-info)', marginTop: '4px' }}>
            {r3}%
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Fraction of relevant docs retrieved top-3
          </div>
        </div>

        <div className="card" style={{ padding: 'var(--space-3)', background: 'var(--bg-surface)' }}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            Hit Rate@3
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-success)', marginTop: '4px' }}>
            {hit3}%
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Queries with at least 1 hit in top-3
          </div>
        </div>
      </div>

      {/* Query Retrieval Breakdown Table */}
      <div className="card" style={{ padding: 'var(--space-4)', background: 'var(--bg-surface)' }}>
        <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 var(--space-3)' }}>
          Query Retrieval Case Performance
        </h4>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-default)', textAlign: 'left', background: 'var(--bg-surface-elevated)' }}>
                <th style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>Case ID</th>
                <th style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>Retrieved Docs</th>
                <th style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>Relevant Target Docs</th>
                <th style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>1st Relevant Rank</th>
                <th style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>Reciprocal Rank</th>
                <th style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>Recall@3</th>
              </tr>
            </thead>
            <tbody>
              {metrics.perQueryResults.map((q) => (
                <tr key={q.caseId} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{q.caseId}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{q.retrievedCount} docs</td>
                  <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{q.relevantCount} docs</td>
                  <td style={{ padding: '8px 12px' }}>
                    {q.firstRelevantRank !== null ? (
                      <span className="badge badge-success" style={{ fontSize: '11px' }}>
                        Rank #{q.firstRelevantRank}
                      </span>
                    ) : (
                      <span className="badge badge-danger" style={{ fontSize: '11px' }}>
                        Missed
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)' }}>
                    {q.reciprocalRank?.toFixed(3) ?? '0.000'}
                  </td>
                  <td style={{ padding: '8px 12px', color: 'var(--text-primary)' }}>
                    {((q.recallAtK?.[3] ?? 0) * 100).toFixed(0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
