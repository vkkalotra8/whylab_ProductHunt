'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, HelpCircle, Info, Sigma } from 'lucide-react';

export interface ProgressiveDisclosureProps {
  id?: string;
  name: string;
  value: string | number;
  badge?: string;
  status?: 'critical' | 'warning' | 'good' | 'neutral';
  level1: string; // Plain language summary
  level2: string; // Why it matters here
  level3: {
    formula: string;
    calculation?: string;
    sampleSize?: number;
    confusion?: {
      truePositive: number;
      falsePositive: number;
      trueNegative: number;
      falseNegative: number;
    };
    limitations?: string[];
  };
  onInspectProvenance?: () => void;
}

export default function ProgressiveDisclosureCard({
  name,
  value,
  badge,
  status = 'neutral',
  level1,
  level2,
  level3,
  onInspectProvenance,
}: ProgressiveDisclosureProps) {
  const [showWhy, setShowWhy] = useState(false);
  const [showTechnical, setShowTechnical] = useState(false);

  const statusColor =
    status === 'critical'
      ? 'var(--color-danger, #ef4444)'
      : status === 'warning'
      ? 'var(--status-warning, #f59e0b)'
      : status === 'good'
      ? 'var(--color-success, #10b981)'
      : 'var(--text-secondary, #94a3b8)';

  const badgeClass =
    status === 'critical'
      ? 'badge-danger'
      : status === 'warning'
      ? 'badge-warning'
      : status === 'good'
      ? 'badge-success'
      : 'badge-neutral';

  return (
    <div
      className="card card-elevated"
      style={{
        padding: 'var(--space-4)',
        borderLeft: `3px solid ${statusColor}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
      }}
    >
      {/* Level 1: Glance View */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {name.replace(/_/g, ' ')}
            </span>
            {badge && <span className={`badge ${badgeClass}`}>{badge}</span>}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--text-primary)' }}>
            {value}
          </div>
        </div>

        {onInspectProvenance && (
          <button
            onClick={onInspectProvenance}
            className="btn btn-secondary btn-sm"
            style={{ fontSize: '11px', padding: '2px 8px' }}
            title="Inspect Provenance"
          >
            Provenance
          </button>
        )}
      </div>

      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
        {level1}
      </p>

      {/* Level 2 Toggle: Why It Matters */}
      <div style={{ marginTop: 'var(--space-1)' }}>
        <button
          onClick={() => setShowWhy(!showWhy)}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '11px',
            color: 'var(--primary, #3b82f6)',
            fontWeight: 500,
          }}
        >
          <HelpCircle size={12} />
          {showWhy ? 'Hide context' : 'Why this matters here'}
          {showWhy ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </button>

        {showWhy && (
          <div
            style={{
              marginTop: 'var(--space-2)',
              padding: 'var(--space-3)',
              backgroundColor: 'rgba(59, 130, 246, 0.05)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-xs)',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-secondary)',
              lineHeight: 1.5,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
              <Info size={12} style={{ color: 'var(--primary)' }} />
              Contextual Significance
            </div>
            {level2}
          </div>
        )}
      </div>

      {/* Level 3 Toggle: Technical Deep-Dive & Formula */}
      <div>
        <button
          onClick={() => setShowTechnical(!showTechnical)}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '11px',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <Sigma size={12} />
          {showTechnical ? 'Hide formula' : 'L3: Formula & derivation'}
          {showTechnical ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </button>

        {showTechnical && (
          <div
            style={{
              marginTop: 'var(--space-2)',
              padding: 'var(--space-3)',
              backgroundColor: 'var(--bg-code, #0d1117)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-xs)',
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              color: 'var(--text-secondary)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Formula: </span>
              <code style={{ color: '#58a6ff' }}>{level3.formula}</code>
            </div>

            {level3.calculation && (
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Calculation: </span>
                <span style={{ color: 'var(--text-primary)' }}>{level3.calculation}</span>
              </div>
            )}

            {level3.sampleSize && (
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Sample Size: </span>
                <span style={{ color: 'var(--text-primary)' }}>n = {level3.sampleSize.toLocaleString()}</span>
              </div>
            )}

            {level3.confusion && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingTop: '4px', borderTop: '1px solid var(--border-subtle)' }}>
                <span>TP: <strong style={{ color: 'var(--color-success)' }}>{level3.confusion.truePositive}</strong></span>
                <span>FP: <strong style={{ color: 'var(--color-danger)' }}>{level3.confusion.falsePositive}</strong></span>
                <span>TN: <strong style={{ color: 'var(--text-primary)' }}>{level3.confusion.trueNegative}</strong></span>
                <span>FN: <strong style={{ color: 'var(--color-danger)' }}>{level3.confusion.falseNegative}</strong></span>
              </div>
            )}

            {level3.limitations && level3.limitations.length > 0 && (
              <div style={{ paddingTop: '4px', borderTop: '1px solid var(--border-subtle)', color: 'var(--status-warning)' }}>
                <span>Caveats: </span>
                {level3.limitations.join('; ')}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
