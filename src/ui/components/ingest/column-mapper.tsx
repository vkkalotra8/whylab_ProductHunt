'use client';

import { useState } from 'react';
import {
  Database,
  Tag,
  HelpCircle,
  AlertCircle,
  CheckCircle2,
  Info,
  ChevronDown,
  ChevronUp,
  FileText,
} from 'lucide-react';
import type { DatasetPreview, InferredColumnMapping } from '@/core/diagnostics/capability';

interface ColumnMapperProps {
  preview: DatasetPreview;
  onMappingChange: (mapping: InferredColumnMapping, labels: { positive: string; negative: string }) => void;
  disabled?: boolean;
}

export default function ColumnMapper({ preview, onMappingChange, disabled }: ColumnMapperProps) {
  const [mapping, setMapping] = useState<InferredColumnMapping>(preview.inferredMapping);
  const [positiveLabel, setPositiveLabel] = useState<string>(
    preview.detectedLabels?.positive ?? '1'
  );
  const [negativeLabel, setNegativeLabel] = useState<string>(
    preview.detectedLabels?.negative ?? '0'
  );
  const [showGlossary, setShowGlossary] = useState(false);
  const [expandedCells, setExpandedCells] = useState<Record<string, boolean>>({});

  const columnNames = preview.columns.map((c) => c.name);

  const handleUpdate = (updated: Partial<InferredColumnMapping>, newPositive?: string, newNegative?: string) => {
    const nextMapping: InferredColumnMapping = { ...mapping, ...updated };
    const nextPos = newPositive ?? positiveLabel;
    const nextNeg = newNegative ?? negativeLabel;

    setMapping(nextMapping);
    if (newPositive) setPositiveLabel(newPositive);
    if (newNegative) setNegativeLabel(newNegative);

    onMappingChange(nextMapping, { positive: nextPos, negative: nextNeg });
  };

  const toggleCellExpand = (cellKey: string) => {
    setExpandedCells((prev) => ({
      ...prev,
      [cellKey]: !prev[cellKey],
    }));
  };

  // Target values candidates
  const targetColStats = preview.columns.find((c) => c.name === mapping.targetColumn);
  const targetCandidates = targetColStats?.sampleValues ?? ['1', '0'];

  const hasNoPredictions = !mapping.predictionColumn;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* Configuration Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 'var(--space-2)',
          paddingBottom: 'var(--space-3)',
          borderBottom: '1px solid var(--border-default)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <Database size={16} style={{ color: 'var(--primary)' }} />
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>
            Column Mapping & Task Configuration
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <button
            type="button"
            onClick={() => setShowGlossary((prev) => !prev)}
            className="btn btn-ghost btn-sm"
            style={{ fontSize: '12.5px', height: '28px', padding: '0 8px', color: 'var(--text-muted)' }}
          >
            <HelpCircle size={14} />
            <span>{showGlossary ? 'Hide Guide' : 'Mapping Guide'}</span>
            {showGlossary ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {preview.totalRows.toLocaleString()} rows &bull; {preview.columns.length} cols
          </span>
        </div>
      </div>

      {/* Dataset Awareness Notice: Labeled dataset without predictions */}
      {hasNoPredictions && (
        <div
          className="alert alert-info"
          role="status"
          style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}
        >
          <Info size={18} style={{ color: 'var(--status-info)', flexShrink: 0, marginTop: '2px' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>
              Labeled Dataset Without Model Predictions
            </div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              This dataset contains labels but no model predictions. WhyLab can profile the dataset,
              inspect data quality, and audit feature distributions. Upload prediction outputs to enable
              model performance evaluation and threshold tuning.
            </div>
          </div>
        </div>
      )}

      {/* Progressive Disclosure: Beginner Guide / Glossary */}
      {showGlossary && (
        <div
          style={{
            backgroundColor: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: 'var(--space-4)',
            fontSize: 'var(--text-sm)',
            lineHeight: 1.5,
          }}
        >
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 'var(--space-2)' }}>
            ML Evidence Mapping Guide:
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-3)' }}>
            <div>
              <strong style={{ color: 'var(--status-info)' }}>Ground Truth (Target):</strong>
              <p style={{ color: 'var(--text-secondary)', margin: '2px 0 0' }}>
                The real-world factual label (e.g. &apos;target&apos;, &apos;actual&apos;). Required to calculate confusion matrices and false omission rates.
              </p>
            </div>
            <div>
              <strong style={{ color: 'var(--status-accent)' }}>Model Prediction:</strong>
              <p style={{ color: 'var(--text-secondary)', margin: '2px 0 0' }}>
                The discrete decision made by your classifier (e.g. 0 or 1). Required for accuracy and recall metrics.
              </p>
            </div>
            <div>
              <strong style={{ color: 'var(--status-success)' }}>Probability Score:</strong>
              <p style={{ color: 'var(--text-secondary)', margin: '2px 0 0' }}>
                Continuous confidence score in [0.0, 1.0]. Enables ROC-AUC, Brier score, and threshold sweeping in Repair Lab.
              </p>
            </div>
            <div>
              <strong style={{ color: 'var(--status-warning)' }}>Subgroup Slice:</strong>
              <p style={{ color: 'var(--text-secondary)', margin: '2px 0 0' }}>
                Categorical metadata (e.g. site, device, location) used to check for performance disparities across sub-populations.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Mapping Selectors Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 'var(--space-4)' }}>
        {/* Target Column */}
        <div className="form-group">
          <label htmlFor="select-target-column" className="form-label form-label-required">
            Ground Truth (Actual)
          </label>
          <select
            id="select-target-column"
            disabled={disabled}
            value={mapping.targetColumn ?? ''}
            onChange={(e) => handleUpdate({ targetColumn: e.target.value || null })}
            className={`select-control ${!mapping.targetColumn ? 'select-invalid' : ''}`}
          >
            <option value="">-- Select Target Column --</option>
            {columnNames.map((col) => (
              <option key={col} value={col}>
                {col}
              </option>
            ))}
          </select>
          <span className="form-helper">Verified ground-truth annotations</span>
        </div>

        {/* Prediction Column */}
        <div className="form-group">
          <label htmlFor="select-prediction-column" className="form-label">
            <span>Model Prediction</span>
            {hasNoPredictions && (
              <span className="badge badge-neutral" style={{ fontSize: '11px', textTransform: 'none' }}>
                Optional
              </span>
            )}
          </label>
          <select
            id="select-prediction-column"
            disabled={disabled}
            value={mapping.predictionColumn ?? ''}
            onChange={(e) => handleUpdate({ predictionColumn: e.target.value || null })}
            className="select-control"
          >
            <option value="">-- None (Data Profiling & Quality Only) --</option>
            {columnNames.map((col) => (
              <option key={col} value={col}>
                {col}
              </option>
            ))}
          </select>
          <span className="form-helper">
            {hasNoPredictions
              ? 'None mapped: WhyLab will profile data quality'
              : 'Discrete classifier output'}
          </span>
        </div>

        {/* Probability Column */}
        <div className="form-group">
          <label htmlFor="select-prob-column" className="form-label">
            Probability Score
          </label>
          <select
            id="select-prob-column"
            disabled={disabled}
            value={mapping.probabilityColumn ?? ''}
            onChange={(e) => handleUpdate({ probabilityColumn: e.target.value ? e.target.value : null })}
            className="select-control"
          >
            <option value="">-- None (Discrete Labels Only) --</option>
            {preview.columns
              .filter((c) => c.isNumeric)
              .map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} (numeric {c.min != null && c.max != null ? `[${c.min.toFixed(2)}, ${c.max.toFixed(2)}]` : ''})
                </option>
              ))}
          </select>
          <span className="form-helper">Continuous confidence score in [0.0, 1.0]</span>
        </div>

        {/* Slice / Partition Column */}
        <div className="form-group">
          <label htmlFor="select-slice-column" className="form-label">
            Subgroup Slice
          </label>
          <select
            id="select-slice-column"
            disabled={disabled}
            value={mapping.sliceColumns[0] ?? ''}
            onChange={(e) => handleUpdate({ sliceColumns: e.target.value ? [e.target.value] : [] })}
            className="select-control"
          >
            <option value="">-- None (No Slice Partition) --</option>
            {columnNames
              .filter((c) => c !== mapping.targetColumn && c !== mapping.predictionColumn && c !== mapping.probabilityColumn)
              .map((col) => (
                <option key={col} value={col}>
                  {col}
                </option>
              ))}
          </select>
          <span className="form-helper">Metadata for fairness & disparity audits</span>
        </div>
      </div>

      {/* Positive Class Selection (when ground-truth has binary candidates) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 'var(--space-3)',
          padding: 'var(--space-3) var(--space-4)',
          backgroundColor: 'var(--bg-surface-elevated)',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-default)',
          fontSize: 'var(--text-sm)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
          <Tag size={14} style={{ color: 'var(--primary)' }} />
          <span>Positive Class Label (Focal outcome):</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          {targetCandidates.slice(0, 4).map((candidate) => {
            const isPos = positiveLabel === candidate;
            return (
              <button
                key={candidate}
                type="button"
                disabled={disabled}
                onClick={() => {
                  const other = targetCandidates.find((c) => c !== candidate) ?? (candidate === '1' ? '0' : 'other');
                  handleUpdate({}, candidate, other);
                }}
                className={`btn btn-sm ${isPos ? 'btn-primary' : 'btn-secondary'}`}
                style={{ height: '30px', fontSize: '13px', padding: '0 10px' }}
              >
                {candidate} {isPos ? '✓ (Positive)' : ''}
              </button>
            );
          })}
        </div>
      </div>

      {/* Safe Data Preview Table */}
      <div style={{ marginTop: 'var(--space-2)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 'var(--space-2)',
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Sample Data Preview (First {preview.previewRows.length} Rows)
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Click long text cells to expand/collapse
          </span>
        </div>

        <div
          style={{
            overflowX: 'auto',
            maxHeight: '340px',
            overflowY: 'auto',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--bg-surface)',
            width: '100%',
            maxWidth: '100%',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <table className="table-modern">
            <thead>
              <tr>
                {columnNames.map((col) => {
                  const isTarget = col === mapping.targetColumn;
                  const isPred = col === mapping.predictionColumn;
                  const isProb = col === mapping.probabilityColumn;
                  const isSlice = mapping.sliceColumns.includes(col);

                  return (
                    <th key={col}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>{col}</span>
                        {isTarget && (
                          <span className="badge badge-info" style={{ fontSize: '11px', padding: '2px 6px' }}>
                            Target
                          </span>
                        )}
                        {isPred && (
                          <span className="badge badge-accent" style={{ fontSize: '11px', padding: '2px 6px' }}>
                            Pred
                          </span>
                        )}
                        {isProb && (
                          <span className="badge badge-success" style={{ fontSize: '11px', padding: '2px 6px' }}>
                            Prob
                          </span>
                        )}
                        {isSlice && (
                          <span className="badge badge-warning" style={{ fontSize: '11px', padding: '2px 6px' }}>
                            Slice
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {preview.previewRows.map((row, rowIdx) => (
                <tr key={rowIdx}>
                  {columnNames.map((col) => {
                    const rawVal = row[col];
                    const isMissing = rawVal === null || rawVal === undefined || rawVal === '';
                    const cellKey = `${rowIdx}-${col}`;
                    const isExpanded = expandedCells[cellKey] ?? false;
                    const isLongText = typeof rawVal === 'string' && rawVal.length > 40;

                    return (
                      <td key={col}>
                        {isMissing ? (
                          <span className="badge-null">null</span>
                        ) : isLongText ? (
                          <div
                            onClick={() => toggleCellExpand(cellKey)}
                            title={isExpanded ? 'Click to collapse' : 'Click to expand full text'}
                            className={`table-cell-text ${isExpanded ? 'expanded' : ''}`}
                            style={{
                              cursor: 'pointer',
                              color: isExpanded ? 'var(--text-primary)' : 'var(--text-secondary)',
                            }}
                          >
                            {rawVal}
                            {!isExpanded && (
                              <span style={{ color: 'var(--primary)', marginLeft: '4px', fontSize: '12px' }}>
                                [+]
                              </span>
                            )}
                          </div>
                        ) : (
                          <span>{rawVal}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
