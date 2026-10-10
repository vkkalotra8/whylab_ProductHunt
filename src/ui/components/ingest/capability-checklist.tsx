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
} from 'lucide-react';
import type { DatasetCapabilities, CapabilityItem } from '@/core/diagnostics/capability';

interface CapabilityChecklistProps {
  capabilities: DatasetCapabilities;
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

export default function CapabilityChecklist({ capabilities }: CapabilityChecklistProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const getStatusBadge = (item: CapabilityItem) => {
    switch (item.status) {
      case 'available':
      case 'completed':
        return (
          <span className="badge badge-success" style={{ fontSize: '11.5px', padding: '3px 7px' }}>
            <CheckCircle2 size={12} style={{ display: 'inline', marginRight: '3px' }} />
            AVAILABLE
          </span>
        );
      case 'running':
        return (
          <span className="badge badge-info" style={{ fontSize: '11.5px', padding: '3px 7px' }}>
            RUNNING
          </span>
        );
      case 'missing_evidence':
      case 'unavailable':
        return (
          <span className="badge badge-warning" style={{ fontSize: '11.5px', padding: '3px 7px' }}>
            <AlertCircle size={12} style={{ display: 'inline', marginRight: '3px' }} />
            MISSING EVIDENCE
          </span>
        );
      case 'failed':
        return (
          <span className="badge badge-danger" style={{ fontSize: '11.5px', padding: '3px 7px' }}>
            FAILED
          </span>
        );
      case 'unsupported':
      default:
        return (
          <span className="badge badge-neutral" style={{ fontSize: '11.5px', padding: '3px 7px' }}>
            UNSUPPORTED
          </span>
        );
    }
  };

  return (
    <div
      style={{
        padding: 'var(--space-4)',
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      {/* Task Type Banner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 'var(--space-2)',
          paddingBottom: 'var(--space-3)',
          marginBottom: 'var(--space-3)',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Detected Evidence Profile
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: '2px', marginBottom: '4px' }}>
            <span
              style={{
                fontSize: 'var(--text-base)',
                fontWeight: 700,
                color: capabilities.taskType === 'raw_features_no_predictions'
                  ? 'var(--status-warning)'
                  : capabilities.isSupportedForInvestigation
                  ? 'var(--status-success)'
                  : 'var(--status-danger)',
              }}
            >
              {capabilities.taskType === 'raw_features_no_predictions'
                ? 'LABELED DATASET (NO PREDICTIONS)'
                : capabilities.taskType.replace(/_/g, ' ').toUpperCase()}
            </span>
            {capabilities.taskType === 'raw_features_no_predictions' && (
              <span className="badge badge-warning" style={{ fontSize: '11.5px' }}>
                Partial Evidence
              </span>
            )}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '520px', lineHeight: 1.5 }}>
            {capabilities.taskType === 'raw_features_no_predictions'
              ? 'This dataset contains labels but no model predictions. WhyLab can profile the dataset and inspect data quality. Upload prediction outputs to enable model performance evaluation.'
              : capabilities.taskTypeExplanation}
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <span className="badge badge-info" style={{ fontSize: '12.5px' }}>
            {capabilities.summary.availableCount} of {capabilities.summary.total} Diagnostics Ready
          </span>
        </div>
      </div>

      {/* Capabilities List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {capabilities.items.map((item) => {
          const Icon = iconMap[item.id] ?? Activity;
          const isExpanded = expandedId === item.id;

          return (
            <div
              key={item.id}
              style={{
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: item.status === 'available' ? 'var(--status-success-bg)' : 'var(--bg-surface)',
              }}
            >
              <div
                onClick={() => toggleExpand(item.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  cursor: 'pointer',
                  fontSize: 'var(--text-sm)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Icon
                    size={15}
                    style={{
                      color: item.status === 'available' ? 'var(--color-success)' : 'var(--text-muted)',
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                    {item.title}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {getStatusBadge(item)}
                  {isExpanded ? <ChevronUp size={13} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} />}
                </div>
              </div>

              {/* Progressive Disclosure: Why & How to enable */}
              {isExpanded && (
                <div
                  style={{
                    padding: '8px 12px 12px 34px',
                    borderTop: '1px solid var(--border-subtle)',
                    fontSize: '13px',
                    color: 'var(--text-secondary)',
                    lineHeight: 1.5,
                  }}
                >
                  <div style={{ marginBottom: '4px' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>Assessment: </strong>
                    {item.reason}
                  </div>
                  {item.howToEnable && item.status !== 'available' && (
                    <div style={{ color: 'var(--color-warning)', marginTop: '4px' }}>
                      <strong>How to enable: </strong>
                      {item.howToEnable}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
