'use client';

import { useMemo } from 'react';
import { AlertCircle, ArrowDownRight, CheckCircle2, DollarSign, Scale, ShieldAlert, Sparkles } from 'lucide-react';
import type { SweepPoint } from './threshold-sweep-chart';

export interface CostMatrixControlsProps {
  points: readonly SweepPoint[];
  falseNegativeCost: number;
  falsePositiveCost: number;
  selectedThreshold: number;
  onCostChange: (fnCost: number, fpCost: number) => void;
  onSelectThreshold: (threshold: number) => void;
}

export default function CostMatrixControls({
  points,
  falseNegativeCost,
  falsePositiveCost,
  selectedThreshold,
  onCostChange,
  onSelectThreshold,
}: CostMatrixControlsProps) {
  // Compute optimal threshold under current costs
  const { optimalThreshold, minCost, baselineCost, costReductionPercent } = useMemo(() => {
    let bestT = 0.5;
    let lowestCost = Infinity;

    // Evaluate baseline cost at 0.50
    const baselinePoint = points.find((p) => Math.abs(p.threshold - 0.5) < 0.005) || points[0];
    const baseCost = baselinePoint
      ? baselinePoint.confusion.falseNegative * falseNegativeCost +
        baselinePoint.confusion.falsePositive * falsePositiveCost
      : 1;

    // Traverse descending for tie-breaking by higher threshold
    const sorted = [...points].sort((a, b) => b.threshold - a.threshold);
    for (const p of sorted) {
      const c =
        p.confusion.falseNegative * falseNegativeCost + p.confusion.falsePositive * falsePositiveCost;
      if (c < lowestCost) {
        lowestCost = c;
        bestT = p.threshold;
      }
    }

    const reduction = baseCost > 0 ? ((baseCost - lowestCost) / baseCost) * 100 : 0;

    return {
      optimalThreshold: bestT,
      minCost: lowestCost,
      baselineCost: baseCost,
      costReductionPercent: Math.max(0, reduction),
    };
  }, [points, falseNegativeCost, falsePositiveCost]);

  const presets = [
    { label: 'Melanoma Clinical (20:1)', fn: 20, fp: 1, desc: 'Cancer miss is 20x worse than unnecessary biopsy' },
    { label: 'Critical Care / Sepsis (50:1)', fn: 50, fp: 1, desc: 'Catastrophic patient mortality penalty' },
    { label: 'Moderate Priority (5:1)', fn: 5, fp: 1, desc: 'High-value customer attrition or diagnostic screening' },
    { label: 'Symmetric Risk (1:1)', fn: 1, fp: 1, desc: 'Equal financial penalty for both error directions' },
  ];

  const ratio = (falseNegativeCost / (falsePositiveCost || 1)).toFixed(1);

  return (
    <div className="card card-elevated" style={{ padding: 'var(--space-5)' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 'var(--space-2)',
          marginBottom: 'var(--space-4)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <Scale size={16} style={{ color: 'var(--color-primary, #3b82f6)' }} />
          <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>
            Domain Loss Matrix &amp; Error Weights
          </h3>
          <span className="badge badge-neutral" style={{ fontSize: '10px' }}>
            {ratio}x Cost Asymmetry
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span className="badge badge-accent" style={{ fontSize: '11px' }}>
            <DollarSign size={10} />
            Pure Deterministic Optimization
          </span>
        </div>
      </div>

      {/* Preset Pills */}
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>
          Select Clinical or Domain Priority Preset:
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {presets.map((preset) => {
            const isActive = falseNegativeCost === preset.fn && falsePositiveCost === preset.fp;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => onCostChange(preset.fn, preset.fp)}
                className={`btn btn-sm ${isActive ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '11px', padding: '4px 10px' }}
                title={preset.desc}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sliders Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-4)',
        }}
      >
        {/* False Negative Cost Slider */}
        <div
          style={{
            padding: 'var(--space-3)',
            backgroundColor: 'var(--bg-code, #0b1120)',
            borderRadius: 'var(--radius-sm, 6px)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
              <ShieldAlert size={14} style={{ color: '#ef4444' }} />
              <label htmlFor="fn-cost-slider" style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)' }}>
                False Negative Penalty (C_FN)
              </label>
            </div>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-sm)',
                fontWeight: 700,
                color: '#ef4444',
              }}
            >
              {falseNegativeCost}x
            </span>
          </div>

          <input
            id="fn-cost-slider"
            type="range"
            min={1}
            max={100}
            step={1}
            value={falseNegativeCost}
            onChange={(e) => onCostChange(Number(e.target.value), falsePositiveCost)}
            style={{ width: '100%', cursor: 'pointer', accentColor: '#ef4444' }}
          />

          <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 'var(--space-1)', lineHeight: 1.3 }}>
            Relative damage of failing to detect a true positive (e.g., missed malignant cancer or delayed sepsis triage).
          </p>
        </div>

        {/* False Positive Cost Slider */}
        <div
          style={{
            padding: 'var(--space-3)',
            backgroundColor: 'var(--bg-code, #0b1120)',
            borderRadius: 'var(--radius-sm, 6px)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
              <AlertCircle size={14} style={{ color: '#f59e0b' }} />
              <label htmlFor="fp-cost-slider" style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)' }}>
                False Positive Penalty (C_FP)
              </label>
            </div>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-sm)',
                fontWeight: 700,
                color: '#f59e0b',
              }}
            >
              {falsePositiveCost}x
            </span>
          </div>

          <input
            id="fp-cost-slider"
            type="range"
            min={1}
            max={20}
            step={1}
            value={falsePositiveCost}
            onChange={(e) => onCostChange(falseNegativeCost, Number(e.target.value))}
            style={{ width: '100%', cursor: 'pointer', accentColor: '#f59e0b' }}
          />

          <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 'var(--space-1)', lineHeight: 1.3 }}>
            Relative burden of unnecessary clinical referrals, diagnostic biopsies, or secondary review costs.
          </p>
        </div>
      </div>

      {/* Optimization Result Strip */}
      <div
        style={{
          padding: 'var(--space-3) var(--space-4)',
          backgroundColor: 'rgba(16, 185, 129, 0.08)',
          borderRadius: 'var(--radius-sm, 6px)',
          border: '1px solid rgba(16, 185, 129, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 'var(--space-3)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Sparkles size={18} style={{ color: 'var(--color-success, #10b981)' }} />
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              Cost-Optimal Threshold (&tau;*)
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-base)', fontWeight: 700, color: '#10b981' }}>
              &tau; = {optimalThreshold.toFixed(2)}
            </div>
          </div>

          <div style={{ borderLeft: '1px solid var(--border-subtle)', paddingLeft: 'var(--space-3)' }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              Total Misclassification Risk
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-primary)' }}>
              <span style={{ color: '#10b981', fontWeight: 700 }}>
                {Math.round(minCost).toLocaleString()} units
              </span>{' '}
              <span style={{ color: 'var(--text-muted)', textDecoration: 'line-through' }}>
                ({Math.round(baselineCost).toLocaleString()} base)
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span className="badge badge-success" style={{ fontSize: '11px' }}>
              <ArrowDownRight size={11} />
              -{costReductionPercent.toFixed(1)}% Cost Reduction
            </span>
          </div>
        </div>

        {Math.abs(selectedThreshold - optimalThreshold) > 0.005 ? (
          <button
            type="button"
            onClick={() => onSelectThreshold(optimalThreshold)}
            className="btn btn-primary btn-sm"
            style={{ fontSize: '12px' }}
          >
            Apply Optimal &tau; = {optimalThreshold.toFixed(2)}
          </button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', color: '#10b981', fontSize: 'var(--text-xs)', fontWeight: 600 }}>
            <CheckCircle2 size={14} />
            Active Policy is Set to Optimal
          </div>
        )}
      </div>
    </div>
  );
}
