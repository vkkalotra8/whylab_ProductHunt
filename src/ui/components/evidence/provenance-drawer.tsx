'use client';

import { useEffect } from 'react';
import type { Evidence, Investigation } from '@/core/domain/types';
import { CheckCircle2, Copy, Database, ShieldCheck, X } from 'lucide-react';
import { useState } from 'react';

export interface ProvenanceDrawerProps {
  evidence: Evidence | null;
  investigation: Investigation;
  onClose: () => void;
}

export default function ProvenanceDrawer({
  evidence,
  investigation,
  onClose,
}: ProvenanceDrawerProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!evidence) return null;

  const matchingResult =
    evidence.provenance.kind === 'tool_result'
      ? investigation.toolResults.find((r) => r.id === (evidence.provenance as { resultId: string }).resultId)
      : null;

  const matchingCall =
    matchingResult
      ? investigation.toolCalls.find((c) => c.id === matchingResult.callId)
      : null;

  const matchingExperiment =
    evidence.provenance.kind === 'experiment'
      ? investigation.experiments.find((exp) => exp.id === (evidence.provenance as { experimentId: string }).experimentId)
      : null;

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(evidence, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(3px)',
        zIndex: 1000,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '560px',
          height: '100%',
          backgroundColor: 'var(--bg-surface, #0e1422)',
          borderLeft: '1px solid var(--border-default)',
          boxShadow: 'var(--shadow-xl)',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          padding: 'var(--space-6)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingBottom: 'var(--space-4)',
            marginBottom: 'var(--space-4)',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
              <ShieldCheck size={18} style={{ color: 'var(--primary, #3b82f6)' }} />
              <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--text-primary)' }}>
                Provenance Inspector
              </h2>
            </div>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-xs)',
                color: 'var(--text-dim)',
              }}
            >
              Node: {evidence.id}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <button
              onClick={handleCopyJson}
              className="btn btn-secondary btn-sm"
              title="Copy evidence JSON"
            >
              {copied ? <CheckCircle2 size={13} style={{ color: 'var(--color-success)' }} /> : <Copy size={13} />}
              {copied ? 'Copied' : 'JSON'}
            </button>
            <button
              onClick={onClose}
              className="btn btn-secondary btn-sm"
              style={{ padding: '6px' }}
              title="Close drawer (Esc)"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Evidence Description Card */}
        <div className="card card-elevated" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
            <span className="badge badge-accent" style={{ textTransform: 'uppercase' }}>
              Kind: {evidence.kind}
            </span>
            <span className="badge badge-info">
              Provenance: {evidence.provenance.kind}
            </span>
          </div>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', lineHeight: 1.5 }}>
            {evidence.description}
          </p>
        </div>

        {/* Origin / Provenance Details */}
        <div className="card card-elevated" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
          <h3 style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 'var(--space-3)' }}>
            Audit & Computation Trace
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', fontSize: 'var(--text-xs)' }}>
            {matchingResult && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '6px', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Executing Instrument:</span>
                  <strong style={{ color: 'var(--primary)', fontFamily: 'var(--font-mono)' }}>
                    {matchingResult.tool} (v{matchingResult.toolVersion})
                  </strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '6px', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Completed Timestamp:</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                    {new Date(matchingResult.completedAt).toLocaleString()}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '6px', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Execution Call ID:</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
                    {matchingResult.callId}
                  </span>
                </div>

                {matchingCall && (
                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Input Parameters:</span>
                    <pre
                      style={{
                        backgroundColor: 'var(--bg-code)',
                        padding: 'var(--space-2)',
                        borderRadius: 'var(--radius-xs)',
                        overflowX: 'auto',
                        fontSize: '11px',
                        color: '#7ee787',
                      }}
                    >
                      {JSON.stringify(matchingCall.input, null, 2)}
                    </pre>
                  </div>
                )}
              </>
            )}

            {matchingExperiment && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '6px', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Experiment Method:</span>
                  <strong style={{ color: 'var(--primary)', fontFamily: 'var(--font-mono)' }}>
                    {matchingExperiment.method}
                  </strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '6px', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Falsification Outcome:</span>
                  <span className="badge badge-success" style={{ textTransform: 'uppercase' }}>
                    {matchingExperiment.outcome}
                  </span>
                </div>

                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Hypothesis Prediction:</span>
                  <span style={{ color: 'var(--text-primary)' }}>{matchingExperiment.prediction}</span>
                </div>
              </>
            )}

            {evidence.provenance.kind === 'source' && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Source ID:</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                  {(evidence.provenance as { sourceId: string }).sourceId}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Ground-Truth Measurements */}
        {evidence.measurements.length > 0 && (
          <div className="card card-elevated" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
            <h3 style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 'var(--space-3)' }}>
              Deterministic Measurements ({evidence.measurements.length})
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {evidence.measurements.map((m) => (
                <div
                  key={m.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 'var(--space-2) var(--space-3)',
                    backgroundColor: 'var(--bg-code)',
                    borderRadius: 'var(--radius-xs)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-xs)',
                  }}
                >
                  <span style={{ color: 'var(--text-secondary)' }}>{m.name}</span>
                  <div>
                    <strong style={{ color: 'var(--text-primary)', marginRight: '6px' }}>
                      {m.status === 'measured'
                        ? m.unit === 'ratio'
                          ? `${(m.value * 100).toFixed(1)}%`
                          : m.value.toLocaleString()
                        : 'Undefined'}
                    </strong>
                    {m.status === 'measured' && (
                      <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                        (n={m.sampleSize})
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Dataset Reference */}
        {investigation.datasets[0] && (
          <div
            style={{
              padding: 'var(--space-3)',
              backgroundColor: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '11px',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
            }}
          >
            <Database size={13} style={{ color: 'var(--text-dim)' }} />
            <span>Dataset: <strong>{investigation.datasets[0].name}</strong> ({investigation.datasets[0].rowCount.toLocaleString()} rows)</span>
          </div>
        )}
      </div>
    </div>
  );
}
