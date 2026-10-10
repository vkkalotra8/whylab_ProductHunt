'use client';

import { useState } from 'react';
import type { Investigation, Evidence } from '@/core/domain/types';
import {
  CheckCircle2,
  Database,
  Filter,
  GitBranch,
  Layers,
  TestTube,
  Wrench,
} from 'lucide-react';

export interface EvidenceGraphProps {
  investigation: Investigation;
  onSelectEvidence: (evidence: Evidence) => void;
}

export type GraphFilter = 'all' | 'evidence' | 'experiments' | 'repairs';

export default function EvidenceGraph({
  investigation,
  onSelectEvidence,
}: EvidenceGraphProps) {
  const [filter, setFilter] = useState<GraphFilter>('all');
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);

  const dataset = investigation.datasets[0];
  const hypotheses = investigation.hypotheses;
  const experiments = investigation.experiments;
  const repairs = investigation.repairs;
  const comparisons = investigation.comparisons;
  const evidenceList = investigation.evidence;
  const diagnosis = investigation.diagnosis;

  const handleNodeClick = (evidenceId: string) => {
    setActiveNodeId(evidenceId);
    const ev = evidenceList.find((e) => e.id === evidenceId);
    if (ev) onSelectEvidence(ev);
  };

  return (
    <div className="card card-elevated" style={{ padding: 'var(--space-6)', overflow: 'hidden' }}>
      {/* Graph Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-6)',
          paddingBottom: 'var(--space-3)',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <Layers size={16} style={{ color: 'var(--primary)' }} />
          <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
            Evidence Provenance DAG
          </strong>
          <span className="badge badge-accent">Interactive Visualizer</span>
        </div>

        {/* Filter Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <Filter size={13} style={{ color: 'var(--text-dim)' }} />
          {(['all', 'evidence', 'experiments', 'repairs'] as GraphFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '11px', textTransform: 'capitalize', padding: '2px 8px' }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Node DAG Container */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'var(--space-6)',
          padding: 'var(--space-4) 0',
          position: 'relative',
        }}
      >
        {/* Tier 1: Input Dataset Node */}
        {dataset && (
          <div
            style={{
              padding: 'var(--space-3) var(--space-5)',
              backgroundColor: 'rgba(59, 130, 246, 0.08)',
              border: '1px solid var(--border-accent, #3b82f6)',
              borderRadius: 'var(--radius-md)',
              textAlign: 'center',
              width: '100%',
              maxWidth: '380px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)', marginBottom: '4px' }}>
              <Database size={14} style={{ color: 'var(--primary)' }} />
              <strong style={{ fontSize: 'var(--text-xs)', color: 'var(--text-primary)' }}>
                {dataset.name}
              </strong>
              <span className="badge badge-info" style={{ fontSize: '10px' }}>EVALUATION</span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
              {dataset.rowCount.toLocaleString()} rows · {dataset.columns.length} columns · {dataset.task}
            </div>
          </div>
        )}

        <div style={{ width: '2px', height: '24px', backgroundColor: 'var(--border-default)' }} />

        {/* Tier 2: Observed Measurements Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 'var(--space-4)',
            width: '100%',
          }}
        >
          {evidenceList.map((ev, index) => {
            const isSelected = activeNodeId === ev.id;
            return (
              <div
                key={ev.id}
                onClick={() => handleNodeClick(ev.id)}
                style={{
                  padding: 'var(--space-4)',
                  backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.12)' : 'var(--bg-surface-subtle)',
                  border: isSelected ? '1px solid var(--primary)' : '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  position: 'relative',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                  <span className="badge badge-accent" style={{ fontFamily: 'var(--font-mono)', fontSize: '10px' }}>
                    EV-{(index + 1).toString().padStart(2, '0')}
                  </span>
                  <span className="badge badge-success" style={{ fontSize: '10px', textTransform: 'uppercase' }}>
                    {ev.provenance.kind}
                  </span>
                </div>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-primary)', lineHeight: 1.4, marginBottom: 'var(--space-2)' }}>
                  {ev.description}
                </p>
                {ev.measurements.length > 0 && (
                  <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    {ev.measurements.slice(0, 3).map((m) => (
                      <span
                        key={m.name}
                        style={{
                          fontSize: '10px',
                          fontFamily: 'var(--font-mono)',
                          backgroundColor: 'var(--bg-code)',
                          padding: '2px 6px',
                          borderRadius: 'var(--radius-xs)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {m.name}: <strong style={{ color: 'var(--text-primary)' }}>{m.status === 'measured' ? (m.unit === 'ratio' ? `${(m.value * 100).toFixed(1)}%` : m.value) : 'undefined'}</strong>
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ marginTop: 'var(--space-2)', textAlign: 'right' }}>
                  <span style={{ fontSize: '10px', color: 'var(--primary)' }}>Click to inspect provenance →</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Tier 3: Hypotheses & Counterfactual Falsification */}
        {(filter === 'all' || filter === 'experiments') && hypotheses.length > 0 && (
          <>
            <div style={{ width: '2px', height: '24px', backgroundColor: 'var(--border-default)' }} />

            <div style={{ width: '100%', maxWidth: '640px' }}>
              {hypotheses.map((hyp) => (
                <div
                  key={hyp.id}
                  style={{
                    padding: 'var(--space-4)',
                    backgroundColor: 'rgba(99, 102, 241, 0.06)',
                    border: '1px solid rgba(99, 102, 241, 0.4)',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: 'var(--space-3)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <GitBranch size={14} style={{ color: '#818cf8' }} />
                      <strong style={{ fontSize: 'var(--text-xs)', color: 'var(--text-primary)' }}>
                        Hypothesis: {hyp.status.toUpperCase()}
                      </strong>
                    </div>
                    <span className="badge badge-info" style={{ fontSize: '10px' }}>
                      Confidence: {hyp.confidence.level.toUpperCase()}
                    </span>
                  </div>
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: 'var(--space-3)' }}>
                    {hyp.statement}
                  </p>

                  {/* Experiments linked to this hypothesis */}
                  {experiments
                    .filter((e) => e.hypothesisId === hyp.id)
                    .map((exp) => (
                      <div
                        key={exp.id}
                        style={{
                          padding: 'var(--space-3)',
                          backgroundColor: 'var(--bg-surface)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-xs)',
                          fontSize: '11px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-primary)' }}>
                            <TestTube size={12} style={{ color: 'var(--primary)' }} />
                            Falsification Test: {exp.method}
                          </span>
                          <span className="badge badge-success" style={{ textTransform: 'uppercase', fontSize: '10px' }}>
                            {exp.outcome}
                          </span>
                        </div>
                        <div style={{ color: 'var(--text-muted)' }}>{exp.prediction}</div>
                      </div>
                    ))}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Tier 4: Diagnosis Node */}
        {diagnosis && (filter === 'all' || filter === 'experiments') && (
          <>
            <div style={{ width: '2px', height: '24px', backgroundColor: 'var(--border-default)' }} />

            <div
              style={{
                padding: 'var(--space-4) var(--space-6)',
                backgroundColor: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid var(--color-success)',
                borderRadius: 'var(--radius-md)',
                width: '100%',
                maxWidth: '540px',
                textAlign: 'center',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
                <CheckCircle2 size={16} style={{ color: 'var(--color-success)' }} />
                <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
                  Certified Diagnosis: {diagnosis.status.toUpperCase()}
                </strong>
              </div>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                {diagnosis.summary}
              </p>
            </div>
          </>
        )}

        {/* Tier 5: Repair Policy & Measured Re-Evaluation */}
        {(filter === 'all' || filter === 'repairs') && repairs.length > 0 && (
          <>
            <div style={{ width: '2px', height: '24px', backgroundColor: 'var(--border-default)' }} />

            <div style={{ width: '100%', maxWidth: '640px' }}>
              {repairs.map((rep) => (
                <div
                  key={rep.id}
                  style={{
                    padding: 'var(--space-4)',
                    backgroundColor: 'rgba(139, 92, 246, 0.06)',
                    border: '1px solid rgba(139, 92, 246, 0.4)',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: 'var(--space-3)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <Wrench size={14} style={{ color: '#a78bfa' }} />
                      <strong style={{ fontSize: 'var(--text-xs)', color: 'var(--text-primary)' }}>
                        Proposed Repair: {rep.kind === 'operating_policy' ? `Threshold ${rep.policy.threshold}` : 'Recommendation'}
                      </strong>
                    </div>
                    <span className="badge badge-accent" style={{ fontSize: '10px' }}>VERIFIED POLICY</span>
                  </div>
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: 'var(--space-3)' }}>
                    {rep.rationale}
                  </p>

                  {/* Comparisons linked to this repair */}
                  {comparisons
                    .filter((c) => c.repairId === rep.id)
                    .map((comp) => (
                      <div
                        key={comp.id}
                        style={{
                          padding: 'var(--space-3)',
                          backgroundColor: 'var(--bg-surface)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-xs)',
                          fontSize: '11px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-primary)' }}>
                            Re-evaluation on Identical Rows (Threshold {comp.baselinePolicy.threshold} → {comp.afterPolicy.threshold})
                          </span>
                          <span className="badge badge-success" style={{ textTransform: 'uppercase', fontSize: '10px' }}>
                            {comp.status}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
