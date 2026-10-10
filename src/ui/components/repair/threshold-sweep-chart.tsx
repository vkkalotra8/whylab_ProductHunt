'use client';

import { useMemo, useState } from 'react';
import { Layers } from 'lucide-react';

export interface SweepPoint {
  threshold: number;
  confusion: {
    truePositive: number;
    falsePositive: number;
    trueNegative: number;
    falseNegative: number;
  };
  metrics: readonly {
    name: string;
    status: string;
    value?: number;
  }[];
}

export interface ThresholdSweepChartProps {
  points: readonly SweepPoint[];
  selectedThreshold: number;
  optimalThreshold: number;
  falseNegativeCost: number;
  falsePositiveCost: number;
  datasetName?: string;
  sampleSize?: number;
  onSelectThreshold: (threshold: number) => void;
}

export default function ThresholdSweepChart({
  points,
  selectedThreshold,
  optimalThreshold,
  falseNegativeCost,
  falsePositiveCost,
  datasetName,
  sampleSize,
  onSelectThreshold,
}: ThresholdSweepChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [visibleCurves, setVisibleCurves] = useState({
    recall: true,
    specificity: true,
    balancedAccuracy: true,
    cost: true,
  });

  // Calculate curves and cost normalization
  const computedPoints = useMemo(() => {
    return points.map((p) => {
      const { truePositive: tp, falsePositive: fp, trueNegative: tn, falseNegative: fn } = p.confusion;
      const posCount = tp + fn;
      const negCount = tn + fp;
      const recall = posCount > 0 ? tp / posCount : 0;
      const specificity = negCount > 0 ? tn / negCount : 1;
      const balancedAccuracy = (recall + specificity) / 2;
      const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
      const accuracy = posCount + negCount > 0 ? (tp + tn) / (posCount + negCount) : 0;
      const expectedCost = fn * falseNegativeCost + fp * falsePositiveCost;

      return {
        ...p,
        recall,
        specificity,
        balancedAccuracy,
        precision,
        accuracy,
        expectedCost,
      };
    });
  }, [points, falseNegativeCost, falsePositiveCost]);

  const maxCost = useMemo(() => {
    return Math.max(...computedPoints.map((p) => p.expectedCost), 1);
  }, [computedPoints]);

  const minCost = useMemo(() => {
    return Math.min(...computedPoints.map((p) => p.expectedCost), 0);
  }, [computedPoints]);

  // Chart dimensions
  const width = 760;
  const height = 240;
  const pad = { top: 20, right: 65, bottom: 35, left: 50 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;

  const toX = (t: number) => pad.left + t * chartW;
  const toYRate = (r: number) => pad.top + (1 - Math.max(0, Math.min(1, r))) * chartH;
  const toYCost = (c: number) => {
    const range = maxCost - minCost || 1;
    const norm = (c - minCost) / range;
    return pad.top + (1 - norm) * chartH;
  };

  const { recallPath, specPath, baPath, costPath } = useMemo(() => {
    if (!computedPoints.length) {
      return { recallPath: '', specPath: '', baPath: '', costPath: '' };
    }
    const calcX = (t: number) => pad.left + t * chartW;
    const calcYRate = (r: number) => pad.top + (1 - Math.max(0, Math.min(1, r))) * chartH;
    const range = maxCost - minCost || 1;
    const calcYCost = (c: number) => pad.top + (1 - (c - minCost) / range) * chartH;

    const buildPath = (getY: (p: (typeof computedPoints)[number]) => number) =>
      computedPoints
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${calcX(p.threshold).toFixed(1)} ${getY(p).toFixed(1)}`)
        .join(' ');

    return {
      recallPath: buildPath((p) => calcYRate(p.recall)),
      specPath: buildPath((p) => calcYRate(p.specificity)),
      baPath: buildPath((p) => calcYRate(p.balancedAccuracy)),
      costPath: buildPath((p) => calcYCost(p.expectedCost)),
    };
  }, [computedPoints, chartW, chartH, pad.left, pad.top, maxCost, minCost]);

  const activePoint = useMemo(() => {
    if (hoveredIndex !== null && computedPoints[hoveredIndex]) {
      return computedPoints[hoveredIndex];
    }
    const match = computedPoints.find((p) => Math.abs(p.threshold - selectedThreshold) < 0.005);
    return match || computedPoints[0] || null;
  }, [hoveredIndex, computedPoints, selectedThreshold]);

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const normX = (clientX - pad.left) / chartW;
    const clampedT = Math.max(0, Math.min(1, normX));
    const targetIdx = Math.round(clampedT * (computedPoints.length - 1));
    setHoveredIndex(targetIdx);
  };

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const normX = (clientX - pad.left) / chartW;
    const clampedT = Math.max(0, Math.min(1, normX));
    const targetIdx = Math.round(clampedT * (computedPoints.length - 1));
    if (computedPoints[targetIdx]) {
      onSelectThreshold(computedPoints[targetIdx].threshold);
    }
  };

  return (
    <div className="card card-elevated" style={{ padding: 'var(--space-5)' }}>
      {/* Chart Title and Toggles */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-3)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <Layers size={16} style={{ color: 'var(--color-primary, #3b82f6)' }} />
          <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>
            101-Point Operating Threshold Sweep Curves
          </h3>
          <span className="badge badge-accent" style={{ fontSize: '10px' }}>
            101 Cutoffs (0.00 &ndash; 1.00)
          </span>
          {datasetName && (
            <span className="badge badge-neutral" style={{ fontSize: '10px', color: 'var(--color-primary, #38bdf8)' }}>
              {datasetName}{sampleSize ? ` (N=${sampleSize.toLocaleString()})` : ''}
            </span>
          )}
        </div>

        {/* Visibility Toggles */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setVisibleCurves((c) => ({ ...c, recall: !c.recall }))}
            className="btn btn-sm"
            style={{
              padding: '2px 8px',
              fontSize: '11px',
              backgroundColor: visibleCurves.recall ? 'rgba(6, 182, 212, 0.15)' : 'transparent',
              color: visibleCurves.recall ? '#06b6d4' : 'var(--text-muted)',
              border: `1px solid ${visibleCurves.recall ? '#06b6d4' : 'var(--border-subtle)'}`,
            }}
          >
            ● Recall (Sensitivity)
          </button>
          <button
            type="button"
            onClick={() => setVisibleCurves((c) => ({ ...c, specificity: !c.specificity }))}
            className="btn btn-sm"
            style={{
              padding: '2px 8px',
              fontSize: '11px',
              backgroundColor: visibleCurves.specificity ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
              color: visibleCurves.specificity ? '#10b981' : 'var(--text-muted)',
              border: `1px solid ${visibleCurves.specificity ? '#10b981' : 'var(--border-subtle)'}`,
            }}
          >
            ● Specificity
          </button>
          <button
            type="button"
            onClick={() => setVisibleCurves((c) => ({ ...c, balancedAccuracy: !c.balancedAccuracy }))}
            className="btn btn-sm"
            style={{
              padding: '2px 8px',
              fontSize: '11px',
              backgroundColor: visibleCurves.balancedAccuracy ? 'rgba(129, 140, 248, 0.15)' : 'transparent',
              color: visibleCurves.balancedAccuracy ? '#818cf8' : 'var(--text-muted)',
              border: `1px solid ${visibleCurves.balancedAccuracy ? '#818cf8' : 'var(--border-subtle)'}`,
            }}
          >
            ● Balanced Acc
          </button>
          <button
            type="button"
            onClick={() => setVisibleCurves((c) => ({ ...c, cost: !c.cost }))}
            className="btn btn-sm"
            style={{
              padding: '2px 8px',
              fontSize: '11px',
              backgroundColor: visibleCurves.cost ? 'rgba(244, 63, 94, 0.15)' : 'transparent',
              color: visibleCurves.cost ? '#f43f5e' : 'var(--text-muted)',
              border: `1px solid ${visibleCurves.cost ? '#f43f5e' : 'var(--border-subtle)'}`,
            }}
          >
            - - Expected Cost
          </button>
        </div>
      </div>

      {/* SVG Container */}
      <div style={{ position: 'relative', width: '100%', maxWidth: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{
            width: '100%',
            height: 'auto',
            minWidth: '480px',
            cursor: 'crosshair',
            userSelect: 'none',
          }}
          onMouseMove={handleSvgMouseMove}
          onMouseLeave={() => setHoveredIndex(null)}
          onClick={handleSvgClick}
        >
          {/* Background Grid */}
          <rect x={pad.left} y={pad.top} width={chartW} height={chartH} fill="var(--bg-canvas, #090d16)" rx={4} />

          {/* Grid lines: horizontal */}
          {[0, 0.25, 0.5, 0.75, 1].map((r) => (
            <g key={r}>
              <line
                x1={pad.left}
                y1={toYRate(r)}
                x2={pad.left + chartW}
                y2={toYRate(r)}
                stroke="var(--border-subtle, #1e293b)"
                strokeDasharray="2 3"
                strokeWidth={1}
              />
              <text
                x={pad.left - 8}
                y={toYRate(r) + 4}
                fill="var(--text-muted, #64748b)"
                fontSize={10}
                fontFamily="var(--font-mono)"
                textAnchor="end"
              >
                {(r * 100).toFixed(0)}%
              </text>
            </g>
          ))}

          {/* Cost right-axis labels */}
          {visibleCurves.cost &&
            [minCost, (minCost + maxCost) / 2, maxCost].map((c, i) => (
              <text
                key={i}
                x={pad.left + chartW + 8}
                y={toYCost(c) + 4}
                fill="#f43f5e"
                fontSize={9}
                fontFamily="var(--font-mono)"
                textAnchor="start"
              >
                {Math.round(c).toLocaleString()}
              </text>
            ))}

          {/* Grid lines: vertical for thresholds */}
          {[0, 0.2, 0.4, 0.6, 0.8, 1.0].map((t) => (
            <g key={t}>
              <line
                x1={toX(t)}
                y1={pad.top}
                x2={toX(t)}
                y2={pad.top + chartH}
                stroke="var(--border-subtle, #1e293b)"
                strokeDasharray="2 3"
                strokeWidth={1}
              />
              <text
                x={toX(t)}
                y={pad.top + chartH + 16}
                fill="var(--text-muted, #64748b)"
                fontSize={10}
                fontFamily="var(--font-mono)"
                textAnchor="middle"
              >
                {t.toFixed(1)}
              </text>
            </g>
          ))}

          {/* Baseline Indicator Line (0.50) */}
          <line
            x1={toX(0.5)}
            y1={pad.top}
            x2={toX(0.5)}
            y2={pad.top + chartH}
            stroke="var(--status-warning, #f59e0b)"
            strokeDasharray="3 3"
            strokeWidth={1.5}
            opacity={0.65}
          />
          <text
            x={toX(0.5)}
            y={pad.top - 6}
            fill="var(--status-warning, #f59e0b)"
            fontSize={9}
            fontFamily="var(--font-mono)"
            textAnchor="middle"
            fontWeight={600}
          >
            Baseline (0.50)
          </text>

          {/* Optimal Threshold Indicator Line */}
          <line
            x1={toX(optimalThreshold)}
            y1={pad.top}
            x2={toX(optimalThreshold)}
            y2={pad.top + chartH}
            stroke="var(--color-success, #10b981)"
            strokeWidth={2}
            opacity={0.85}
          />
          <text
            x={toX(optimalThreshold)}
            y={pad.top - 6}
            fill="var(--color-success, #10b981)"
            fontSize={9}
            fontFamily="var(--font-mono)"
            textAnchor="middle"
            fontWeight={700}
          >
            ★ Optimal ({optimalThreshold.toFixed(2)})
          </text>

          {/* Metric Curves */}
          {visibleCurves.recall && (
            <path d={recallPath} fill="none" stroke="#06b6d4" strokeWidth={2.5} strokeLinecap="round" />
          )}
          {visibleCurves.specificity && (
            <path d={specPath} fill="none" stroke="#10b981" strokeWidth={2} strokeLinecap="round" />
          )}
          {visibleCurves.balancedAccuracy && (
            <path d={baPath} fill="none" stroke="#818cf8" strokeWidth={2} strokeLinecap="round" />
          )}
          {visibleCurves.cost && (
            <path
              d={costPath}
              fill="none"
              stroke="#f43f5e"
              strokeWidth={2}
              strokeDasharray="4 3"
              strokeLinecap="round"
            />
          )}

          {/* Active / Hovered Threshold Scrubber Line */}
          {activePoint && (
            <g>
              <line
                x1={toX(activePoint.threshold)}
                y1={pad.top}
                x2={toX(activePoint.threshold)}
                y2={pad.top + chartH}
                stroke="#38bdf8"
                strokeWidth={2}
              />
              <circle cx={toX(activePoint.threshold)} cy={toYRate(activePoint.recall)} r={4} fill="#06b6d4" />
              <circle
                cx={toX(activePoint.threshold)}
                cy={toYRate(activePoint.specificity)}
                r={4}
                fill="#10b981"
              />
              <circle
                cx={toX(activePoint.threshold)}
                cy={toYRate(activePoint.balancedAccuracy)}
                r={4}
                fill="#818cf8"
              />
              <circle
                cx={toX(activePoint.threshold)}
                cy={toYCost(activePoint.expectedCost)}
                r={4}
                fill="#f43f5e"
              />
            </g>
          )}

          {/* Axis Labels */}
          <text
            x={pad.left + chartW / 2}
            y={height - 4}
            fill="var(--text-secondary, #94a3b8)"
            fontSize={11}
            fontWeight={500}
            textAnchor="middle"
          >
            Decision Threshold Cutoff (&tau;) &rarr;
          </text>
          <text
            x={14}
            y={pad.top + chartH / 2}
            fill="var(--text-secondary, #94a3b8)"
            fontSize={11}
            fontWeight={500}
            textAnchor="middle"
            transform={`rotate(-90 14 ${pad.top + chartH / 2})`}
          >
            Metric Rate (0% - 100%)
          </text>
        </svg>
      </div>

      {/* Real-Time Scrubber Value Strip */}
      {activePoint && (
        <div
          style={{
            marginTop: 'var(--space-3)',
            padding: 'var(--space-3) var(--space-4)',
            backgroundColor: 'var(--bg-surface-elevated)',
            borderRadius: 'var(--radius-sm, 6px)',
            border: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 'var(--space-3)',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-xs)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Cutoff &tau;:</span>
            <strong style={{ color: 'var(--primary)', fontSize: 'var(--text-sm)' }}>
              {activePoint.threshold.toFixed(2)}
            </strong>
            {Math.abs(activePoint.threshold - optimalThreshold) < 0.005 && (
              <span className="badge badge-success" style={{ fontSize: '10px' }}>
                ★ Cost Optimal
              </span>
            )}
            {Math.abs(activePoint.threshold - 0.5) < 0.005 && (
              <span className="badge badge-warning" style={{ fontSize: '10px' }}>
                Baseline
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Recall: </span>
              <strong style={{ color: '#06b6d4' }}>{(activePoint.recall * 100).toFixed(1)}%</strong>
              <span style={{ color: 'var(--text-muted)', fontSize: '10px', marginLeft: '4px' }}>
                ({activePoint.confusion.truePositive} TP)
              </span>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Specificity: </span>
              <strong style={{ color: '#10b981' }}>{(activePoint.specificity * 100).toFixed(1)}%</strong>
              <span style={{ color: 'var(--text-muted)', fontSize: '10px', marginLeft: '4px' }}>
                ({activePoint.confusion.trueNegative} TN)
              </span>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Balanced Acc: </span>
              <strong style={{ color: '#818cf8' }}>{(activePoint.balancedAccuracy * 100).toFixed(1)}%</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Misclass Cost: </span>
              <strong style={{ color: '#f43f5e' }}>{Math.round(activePoint.expectedCost).toLocaleString()}</strong>
            </div>
          </div>

          {activePoint.threshold !== selectedThreshold && (
            <button
              type="button"
              onClick={() => onSelectThreshold(activePoint.threshold)}
              className="btn btn-primary btn-sm"
              style={{ fontSize: '11px', padding: '2px 10px' }}
            >
              Select &tau; = {activePoint.threshold.toFixed(2)}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
