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
  Key,
  X,
  Target,
  SlidersHorizontal,
  Compass,
} from 'lucide-react';
import type { DatasetPreview, InferredColumnMapping, TaskType } from '@/core/diagnostics/capability';

interface ColumnMapperProps {
  preview: DatasetPreview;
  onMappingChange: (
    mapping: InferredColumnMapping,
    labels: { positive: string; negative: string },
    confirmedTask?: TaskType
  ) => void;
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
  const [selectedTask, setSelectedTask] = useState<TaskType>(
    preview.capabilities?.taskType ?? (mapping.predictionColumn ? 'binary_classification' : 'raw_features_no_predictions')
  );
  const [showGlossary, setShowGlossary] = useState(false);
  const [expandedCells, setExpandedCells] = useState<Record<string, boolean>>({});

  const columnNames = preview.columns.map((c) => c.name);

  const handleUpdate = (
    updated: Partial<InferredColumnMapping>,
    newPositive?: string,
    newNegative?: string,
    newTask?: TaskType
  ) => {
    const nextMapping: InferredColumnMapping = { ...mapping, ...updated };
    const nextPos = newPositive ?? positiveLabel;
    const nextNeg = newNegative ?? negativeLabel;
    const nextTask = newTask ?? selectedTask;

    setMapping(nextMapping);
    if (newPositive) setPositiveLabel(newPositive);
    if (newNegative) setNegativeLabel(newNegative);
    if (newTask) setSelectedTask(newTask);

    onMappingChange(nextMapping, { positive: nextPos, negative: nextNeg }, nextTask);
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

      {/* Task Confirmation Bar */}
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
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <Compass size={15} style={{ color: 'var(--primary)' }} />
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Candidate Task Architecture:
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {[
            { id: 'binary_classification', label: 'Binary Classification' },
            { id: 'multiclass_classification', label: 'Multiclass' },
            { id: 'regression', label: 'Regression' },
            { id: 'raw_features_no_predictions', label: 'Dataset Intelligence (No Predictions)' },
          ].map((t) => {
            const isSelected = selectedTask === t.id;
            return (
              <button
                key={t.id}
                type="button"
                disabled={disabled}
                onClick={() => handleUpdate({}, undefined, undefined, t.id as TaskType)}
                className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-ghost'}`}
                style={{
                  fontSize: '12px',
                  height: '28px',
                  padding: '0 10px',
                  fontWeight: isSelected ? 600 : 400,
                }}
              >
                {t.label} {isSelected ? '✓' : ''}
              </button>
            );
          })}
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
              Dataset Intelligence & Quality Profiling Mode
            </div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              No prediction column mapped. WhyLab will execute autonomous investigations on data hygiene,
              unsupervised missingness, feature distribution shifts, and potential feature-target leakage.
              To audit model decision performance, map a model prediction column below.
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
            <div>
              <strong style={{ color: 'var(--text-primary)' }}>Unique Identifier (Key):</strong>
              <p style={{ color: 'var(--text-secondary)', margin: '2px 0 0' }}>
                Unique record key (e.g. id, patient_id) used to audit entity uniqueness and prevent sample contamination.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Mapping Selectors Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-3)' }}>
        {/* Target Column */}
        <div className="form-group">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <label htmlFor="select-target-column" className="form-label" style={{ margin: 0 }}>
              Ground Truth (Target)
            </label>
            {mapping.targetColumn && (
              <button
                type="button"
                onClick={() => handleUpdate({ targetColumn: null })}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '11px' }}
                title="Clear target column"
              >
                Clear
              </button>
            )}
          </div>
          <select
            id="select-target-column"
            disabled={disabled}
            value={mapping.targetColumn ?? ''}
            onChange={(e) => handleUpdate({ targetColumn: e.target.value || null })}
            className="select-control"
          >
            <option value="">-- None (Unsupervised / Unlabeled) --</option>
            {columnNames.map((col) => (
              <option key={col} value={col}>
                {col}
              </option>
            ))}
          </select>
          <span className="form-helper">Ground-truth label column</span>
        </div>

        {/* Prediction Column */}
        <div className="form-group">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <label htmlFor="select-prediction-column" className="form-label" style={{ margin: 0 }}>
              <span>Model Prediction</span>
              {hasNoPredictions && (
                <span className="badge badge-neutral" style={{ fontSize: '10px', textTransform: 'none', marginLeft: '4px' }}>
                  Optional
                </span>
              )}
            </label>
            {mapping.predictionColumn && (
              <button
                type="button"
                onClick={() => handleUpdate({ predictionColumn: null })}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '11px' }}
                title="Clear prediction column"
              >
                Clear
              </button>
            )}
          </div>
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
            {hasNoPredictions ? 'None: Profiling data quality' : 'Discrete classifier output'}
          </span>
        </div>

        {/* Probability Column */}
        <div className="form-group">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <label htmlFor="select-prob-column" className="form-label" style={{ margin: 0 }}>
              Probability Score
            </label>
            {mapping.probabilityColumn && (
              <button
                type="button"
                onClick={() => handleUpdate({ probabilityColumn: null })}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '11px' }}
                title="Clear probability column"
              >
                Clear
              </button>
            )}
          </div>
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
          <span className="form-helper">Continuous confidence [0.0, 1.0]</span>
        </div>

        {/* Slice / Partition Column */}
        <div className="form-group">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <label htmlFor="select-slice-column" className="form-label" style={{ margin: 0 }}>
              Subgroup Slice
            </label>
            {mapping.sliceColumns.length > 0 && (
              <button
                type="button"
                onClick={() => handleUpdate({ sliceColumns: [] })}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '11px' }}
                title="Clear slice column"
              >
                Clear
              </button>
            )}
          </div>
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
          <span className="form-helper">Metadata for fairness audits</span>
        </div>

        {/* Candidate Key / Identifier Column */}
        <div className="form-group">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <label htmlFor="select-id-column" className="form-label" style={{ margin: 0 }}>
              Identifier (Key)
            </label>
            {mapping.idColumn && (
              <button
                type="button"
                onClick={() => handleUpdate({ idColumn: null })}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '11px' }}
                title="Clear ID column"
              >
                Clear
              </button>
            )}
          </div>
          <select
            id="select-id-column"
            disabled={disabled}
            value={mapping.idColumn ?? ''}
            onChange={(e) => handleUpdate({ idColumn: e.target.value || null })}
            className="select-control"
          >
            <option value="">-- None (No ID Column) --</option>
            {columnNames.map((col) => (
              <option key={col} value={col}>
                {col}
              </option>
            ))}
          </select>
          <span className="form-helper">Entity key for uniqueness checks</span>
        </div>
      </div>

      {/* Positive Class Selection (when ground-truth has binary candidates) */}
      {mapping.targetColumn && targetCandidates.length > 0 && (
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
      )}

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
                  const isId = col === mapping.idColumn;

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
                        {isId && (
                          <span className="badge badge-neutral" style={{ fontSize: '11px', padding: '2px 6px' }}>
                            ID
                          </span>
                        )}
                        {!isTarget && !isPred && !isProb && !isSlice && !isId && (
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                            Feature
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
