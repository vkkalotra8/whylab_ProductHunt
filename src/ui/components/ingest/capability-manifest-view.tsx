'use client';

import { useState } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Sliders,
  BarChart2,
  Activity,
  Layers,
  ShieldAlert,
  ArrowUpDown,
  Wrench,
  TrendingDown,
  Sparkles,
  Info,
  HelpCircle,
  Database,
  Search,
  Filter,
} from 'lucide-react';
import type { DatasetCapabilities, CapabilityItem } from '@/core/diagnostics/capability';
import type { DatasetCapabilityManifest } from '@/core/domain/capability-contracts';

interface CapabilityManifestViewProps {
  capabilities: DatasetCapabilities;
  manifest?: DatasetCapabilityManifest | null;
  onLaunchInvestigation?: () => void;
  onGenerateBaseline?: () => void;
  isRunning?: boolean;
}

const iconMap: Record<string, typeof Activity> = {
  binary_metrics: BarChart2,
  probability_metrics: Activity,
  regression_metrics: BarChart2,
  threshold_sweep: Sliders,
  probability_calibration: TrendingDown,
  counterfactual_paradox: ShieldAlert,
  slice_evaluation: Layers,
  feature_leakage: AlertCircle,
  distribution_drift: ArrowUpDown,
  training_diagnostics: TrendingDown,
  split_drift: ArrowUpDown,
  split_contamination: ShieldAlert,
  data_quality: CheckCircle2,
  repair_lab: Wrench,
};

const categoryTitles: Record<string, { label: string; desc: string }> = {
  quality: {
    label: 'Data Quality & Hygiene',
    desc: 'Unsupervised checks on completeness, uniqueness, outlier bounds, and leakages.',
  },
  metrics: {
    label: 'Supervised Model Metrics',
    desc: 'Evaluation of classifier decision performance against ground truth labels.',
  },
  calibration: {
    label: 'Probability & Calibration',
    desc: 'Continuous confidence evaluation, ROC-AUC, Brier calibration, and threshold sweeping.',
  },
  fairness: {
    label: 'Subgroups & Disparities',
    desc: 'Fairness audits and performance disparity scanning across categorical slices.',
  },
  drift: {
    label: 'Distribution Shift & Drift',
    desc: 'KS, PSI, and Wasserstein tests across comparison cohorts or production splits.',
  },
  repair: {
    label: 'Autonomous Repair & Curation',
    desc: 'Operating policy discovery, data curation rules, and code generation.',
  },
  training: {
    label: 'Training Diagnostics',
    desc: 'Overfitting gap and loss trajectory audits from training run logs.',
  },
};

export default function CapabilityManifestView({
  capabilities,
  manifest,
  onLaunchInvestigation,
  onGenerateBaseline,
  isRunning,
}: CapabilityManifestViewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const hasPredictions = capabilities.items.some(
    (c) => (c.id === 'binary_metrics' || c.id === 'threshold_sweep') && c.status === 'available'
  );

  const availableItems = capabilities.items.filter((c) => c.status === 'available');
  const missingItems = capabilities.items.filter((c) => c.status === 'missing_evidence' || c.status === 'unavailable');
  const unsupportedItems = capabilities.items.filter((c) => c.status === 'unsupported');

  // Filter items
  const filteredItems = capabilities.items.filter((item) => {
    if (filterCategory !== 'all' && item.category !== filterCategory) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        item.title.toLowerCase().includes(q) ||
        item.reason.toLowerCase().includes(q) ||
        (item.howToEnable && item.howToEnable.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const getStatusBadge = (item: CapabilityItem) => {
    switch (item.status) {
      case 'available':
      case 'completed':
        return (
          <span className="badge badge-success" style={{ fontSize: '11px', padding: '3px 8px' }}>
            <CheckCircle2 size={12} style={{ display: 'inline', marginRight: '3px' }} />
            AVAILABLE
          </span>
        );
      case 'missing_evidence':
      case 'unavailable':
        return (
          <span className="badge badge-warning" style={{ fontSize: '11px', padding: '3px 8px' }}>
            <AlertCircle size={12} style={{ display: 'inline', marginRight: '3px' }} />
            MISSING EVIDENCE
          </span>
        );
      case 'unsupported':
      default:
        return (
          <span className="badge badge-neutral" style={{ fontSize: '11px', padding: '3px 8px' }}>
            UNSUPPORTED
          </span>
        );
    }
  };

  const getGradeColor = (grade?: string) => {
    switch (grade) {
      case 'A':
        return 'var(--status-success)';
      case 'B':
        return 'var(--status-accent)';
      case 'C':
        return 'var(--status-warning)';
      case 'D':
      case 'F':
        return 'var(--status-danger)';
      default:
        return 'var(--primary)';
    }
  };

  const availableCount = manifest?.summary?.availableCount ?? availableItems.length;
  const totalCount = manifest?.summary?.totalTools ?? capabilities.items.length;
  const readinessScore = Math.round((availableCount / Math.max(1, totalCount)) * 100);
  const readinessGrade = readinessScore >= 90 ? 'A' : readinessScore >= 75 ? 'B' : readinessScore >= 60 ? 'C' : 'D';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* Overview Card */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 'var(--space-3)',
          padding: 'var(--space-4)',
          backgroundColor: 'var(--bg-surface-elevated)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        <div>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Dataset Task Architecture
          </div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>
            {capabilities.taskType.replace(/_/g, ' ').toUpperCase()}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px', lineHeight: 1.4 }}>
            {capabilities.taskTypeExplanation}
          </div>
        </div>

        <div>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Data Readiness Grade
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
            <span
              style={{
                fontSize: '22px',
                fontWeight: 800,
                color: getGradeColor(readinessGrade),
                fontFamily: 'var(--font-mono)',
              }}
            >
              Grade {readinessGrade}
            </span>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
              ({readinessScore}/100)
            </span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            {hasPredictions
              ? 'Complete: Ready for model validation & threshold sweep'
              : 'Partial: Ready for dataset intelligence & quality audit'}
          </div>
        </div>

        <div>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Capability Breakdown
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
            <span className="badge badge-success" style={{ fontSize: '12px', padding: '3px 8px' }}>
              {availableItems.length} Available
            </span>
            <span className="badge badge-warning" style={{ fontSize: '12px', padding: '3px 8px' }}>
              {missingItems.length} Missing
            </span>
            <span className="badge badge-neutral" style={{ fontSize: '12px', padding: '3px 8px' }}>
              {unsupportedItems.length} Unsupported
            </span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            {Math.round((availableItems.length / capabilities.items.length) * 100)}% investigation coverage
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 'var(--space-2)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>
            Filter:
          </span>
          {['all', 'quality', 'metrics', 'calibration', 'fairness', 'drift', 'repair'].map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setFilterCategory(cat)}
              className={`btn btn-sm ${filterCategory === cat ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: '11.5px', height: '26px', padding: '0 8px' }}
            >
              {cat === 'all' ? 'All Analyses' : categoryTitles[cat]?.label ?? cat}
            </button>
          ))}
        </div>

        <div style={{ position: 'relative', width: '220px' }}>
          <Search
            size={13}
            style={{
              position: 'absolute',
              left: '9px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
            }}
          />
          <input
            type="text"
            placeholder="Search capabilities..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-control"
            style={{
              paddingLeft: '28px',
              fontSize: '12px',
              height: '28px',
              borderRadius: 'var(--radius-sm)',
            }}
          />
        </div>
      </div>

      {/* Capabilities List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {filteredItems.map((item) => {
          const Icon = iconMap[item.id] || Activity;
          const isExpanded = expandedId === item.id;

          return (
            <div
              key={item.id}
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                overflow: 'hidden',
                transition: 'border-color 0.15s ease',
              }}
            >
              <div
                onClick={() => toggleExpand(item.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 'var(--space-3) var(--space-4)',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flex: 1 }}>
                  <Icon
                    size={16}
                    style={{
                      color:
                        item.status === 'available'
                          ? 'var(--status-success)'
                          : item.status === 'missing_evidence'
                          ? 'var(--status-warning)'
                          : 'var(--text-muted)',
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {item.title}
                      </span>
                      <span
                        style={{
                          fontSize: '10.5px',
                          color: 'var(--text-muted)',
                          backgroundColor: 'var(--bg-surface-elevated)',
                          padding: '1px 6px',
                          borderRadius: '4px',
                        }}
                      >
                        {categoryTitles[item.category]?.label ?? item.category}
                      </span>
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      {item.reason}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  {getStatusBadge(item)}
                  {isExpanded ? (
                    <ChevronUp size={15} style={{ color: 'var(--text-muted)' }} />
                  ) : (
                    <ChevronDown size={15} style={{ color: 'var(--text-muted)' }} />
                  )}
                </div>
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div
                  style={{
                    padding: 'var(--space-3) var(--space-4)',
                    backgroundColor: 'var(--bg-surface-elevated)',
                    borderTop: '1px solid var(--border-subtle)',
                    fontSize: '12.5px',
                    lineHeight: 1.5,
                  }}
                >
                  {item.requiredColumns.length > 0 && (
                    <div style={{ marginBottom: '6px' }}>
                      <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
                        Required Evidence Columns:{' '}
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                        {item.requiredColumns.join(', ')}
                      </span>
                    </div>
                  )}

                  {item.howToEnable && item.status !== 'available' && (
                    <div
                      style={{
                        padding: 'var(--space-2) var(--space-3)',
                        backgroundColor: 'var(--bg-card)',
                        border: '1px dashed var(--border-default)',
                        borderRadius: 'var(--radius-sm)',
                        marginTop: '4px',
                      }}
                    >
                      <strong style={{ color: 'var(--status-info)' }}>How to Enable: </strong>
                      <span style={{ color: 'var(--text-secondary)' }}>{item.howToEnable}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Action Footer */}
      {onLaunchInvestigation && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--space-3) var(--space-4)',
            backgroundColor: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            marginTop: 'var(--space-2)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Sparkles size={16} style={{ color: 'var(--primary)' }} />
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              {hasPredictions
                ? 'Ready to execute full model reliability battery & 101-point threshold sweep.'
                : 'Ready to execute dataset-only intelligence investigation & data quality audit.'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {!hasPredictions && onGenerateBaseline && (
              <button
                type="button"
                id="open-baseline-opt-in-btn"
                disabled={isRunning}
                onClick={onGenerateBaseline}
                className="btn btn-secondary"
                style={{
                  height: '34px',
                  fontSize: '13px',
                  padding: '0 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  borderColor: 'rgba(245, 158, 11, 0.4)',
                  color: 'var(--accent-amber, #f59e0b)',
                }}
              >
                <span>⚡</span>
                <span>Generate Baseline (Optional)</span>
              </button>
            )}

            <button
              type="button"
              disabled={isRunning || availableItems.length === 0}
              onClick={onLaunchInvestigation}
              className="btn btn-primary"
              style={{ height: '34px', fontSize: '13px', padding: '0 16px' }}
            >
              {isRunning ? (
                'Investigation in Progress...'
              ) : hasPredictions ? (
                'Launch Astra Investigation →'
              ) : (
                'Launch Dataset Intelligence Investigation →'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
