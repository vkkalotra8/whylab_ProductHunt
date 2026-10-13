'use client';

import React, { useState, useMemo } from 'react';
import { Search, Filter, AlertTriangle, CheckCircle2, ChevronRight, Eye } from 'lucide-react';
import type { LlmRecord } from '@/core/domain/llm-types';
import type { TextMetricsSummary } from '@/core/diagnostics/llm/text-metrics';
import type { JsonMetricsSummary } from '@/core/diagnostics/llm/schema-validator';
import { RecordDetailDrawer } from './record-detail-drawer';

interface LlmFailureExplorerProps {
  records: LlmRecord[];
  textMetrics: TextMetricsSummary;
  jsonMetrics?: JsonMetricsSummary;
}

type FilterMode = 'all' | 'defects' | 'mismatches' | 'json_errors' | 'low_f1' | 'slow';

export function LlmFailureExplorer({ records, textMetrics, jsonMetrics }: LlmFailureExplorerProps) {
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);

  // Quick lookup maps
  const textMap = useMemo(() => {
    const map = new Map();
    textMetrics.perRecordResults.forEach((r) => map.set(r.caseId, r));
    return map;
  }, [textMetrics]);

  const jsonMap = useMemo(() => {
    const map = new Map();
    jsonMetrics?.perRecordResults.forEach((r) => map.set(r.caseId, r));
    return map;
  }, [jsonMetrics]);

  // Tag records with failure flags
  const annotatedRecords = useMemo(() => {
    return records.map((rec) => {
      const textRes = textMap.get(rec.caseId);
      const jsonRes = jsonMap.get(rec.caseId);

      const isMismatch = textRes?.hasReference && !textRes.normalizedExactMatch;
      const isJsonError = jsonRes && !jsonRes.isJsonParseValid;
      const isSchemaViolation = jsonRes?.schemaEvaluated && !jsonRes.isSchemaCompliant;
      const isLowF1 = textRes?.hasReference && (textRes.tokenF1 ?? 1) < 0.5;
      const isSlow = (rec.latencyMs ?? 0) > 1000;
      const isDefect = isMismatch || isJsonError || isSchemaViolation;

      return {
        rec,
        textRes,
        jsonRes,
        isMismatch,
        isJsonError,
        isSchemaViolation,
        isLowF1,
        isSlow,
        isDefect,
      };
    });
  }, [records, textMap, jsonMap]);

  // Filtered dataset
  const filtered = useMemo(() => {
    return annotatedRecords.filter((item) => {
      // Filter tab
      if (filterMode === 'defects' && !item.isDefect) return false;
      if (filterMode === 'mismatches' && !item.isMismatch) return false;
      if (filterMode === 'json_errors' && !item.isJsonError) return false;
      if (filterMode === 'low_f1' && !item.isLowF1) return false;
      if (filterMode === 'slow' && !item.isSlow) return false;

      // Search query
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesId = item.rec.caseId.toLowerCase().includes(q);
        const matchesPrompt = item.rec.prompt.toLowerCase().includes(q);
        const matchesResponse = item.rec.response.toLowerCase().includes(q);
        return matchesId || matchesPrompt || matchesResponse;
      }

      return true;
    });
  }, [annotatedRecords, filterMode, search]);

  const defectCount = useMemo(
    () => annotatedRecords.filter((a) => a.isDefect).length,
    [annotatedRecords]
  );
  const mismatchCount = useMemo(
    () => annotatedRecords.filter((a) => a.isMismatch).length,
    [annotatedRecords]
  );
  const jsonErrorCount = useMemo(
    () => annotatedRecords.filter((a) => a.isJsonError).length,
    [annotatedRecords]
  );

  const selectedRecord = useMemo(() => {
    if (!selectedCaseId) return null;
    return records.find((r) => r.caseId === selectedCaseId) ?? null;
  }, [records, selectedCaseId]);

  return (
    <div className="card" style={{ padding: 'var(--space-4)', background: 'var(--bg-surface)' }}>
      {/* Title & Toolbar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              Evaluation Failure Explorer
            </h3>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Showing {filtered.length} of {records.length} evaluation cases
            </div>
          </div>

          {/* Search bar */}
          <div style={{ position: 'relative', width: '280px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search case ID, prompt, output..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input"
              style={{
                width: '100%',
                paddingLeft: '32px',
                fontSize: 'var(--text-xs)',
                height: '34px',
                borderRadius: 'var(--radius-md)',
              }}
            />
          </div>
        </div>

        {/* Filter Pills */}
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <button
            onClick={() => setFilterMode('all')}
            className={`btn ${filterMode === 'all' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: 'var(--text-xs)', padding: '4px 10px', height: 'auto' }}
          >
            All Cases ({records.length})
          </button>
          <button
            onClick={() => setFilterMode('defects')}
            className={`btn ${filterMode === 'defects' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: 'var(--text-xs)', padding: '4px 10px', height: 'auto' }}
          >
            All Defects ({defectCount})
          </button>
          <button
            onClick={() => setFilterMode('mismatches')}
            className={`btn ${filterMode === 'mismatches' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: 'var(--text-xs)', padding: '4px 10px', height: 'auto' }}
          >
            Mismatches ({mismatchCount})
          </button>
          {jsonErrorCount > 0 && (
            <button
              onClick={() => setFilterMode('json_errors')}
              className={`btn ${filterMode === 'json_errors' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: 'var(--text-xs)', padding: '4px 10px', height: 'auto' }}
            >
              JSON Syntax Errors ({jsonErrorCount})
            </button>
          )}
          <button
            onClick={() => setFilterMode('low_f1')}
            className={`btn ${filterMode === 'low_f1' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: 'var(--text-xs)', padding: '4px 10px', height: 'auto' }}
          >
            Low F1 (&lt; 0.5)
          </button>
          <button
            onClick={() => setFilterMode('slow')}
            className={`btn ${filterMode === 'slow' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: 'var(--text-xs)', padding: '4px 10px', height: 'auto' }}
          >
            High Latency (&gt; 1s)
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-default)', textAlign: 'left', background: 'var(--bg-surface-elevated)' }}>
              <th style={{ padding: '8px 12px', color: 'var(--text-secondary)', width: '110px' }}>Case ID</th>
              <th style={{ padding: '8px 12px', color: 'var(--text-secondary)', width: '130px' }}>Quality Status</th>
              <th style={{ padding: '8px 12px', color: 'var(--text-secondary)', width: '35%' }}>Prompt Snippet</th>
              <th style={{ padding: '8px 12px', color: 'var(--text-secondary)', width: '35%' }}>Model Output Snippet</th>
              <th style={{ padding: '8px 12px', color: 'var(--text-secondary)', width: '90px' }}>Timing</th>
              <th style={{ padding: '8px 12px', textAlign: 'center', width: '50px' }}>Inspect</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No evaluation cases matched your filter or search query.
                </td>
              </tr>
            ) : (
              filtered.map(({ rec, textRes, jsonRes, isMismatch, isJsonError, isSchemaViolation }) => {
                const f1Pct = textRes?.tokenF1 !== undefined ? (textRes.tokenF1 * 100).toFixed(0) : null;

                return (
                  <tr
                    key={rec.caseId}
                    onClick={() => setSelectedCaseId(rec.caseId)}
                    style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      cursor: 'pointer',
                      transition: 'background 0.15s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-surface-hover)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {rec.caseId}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      {isJsonError ? (
                        <span className="badge badge-danger" style={{ fontSize: '11px', padding: '2px 6px' }}>
                          JSON Syntax
                        </span>
                      ) : isSchemaViolation ? (
                        <span className="badge badge-danger" style={{ fontSize: '11px', padding: '2px 6px' }}>
                          Schema Fail
                        </span>
                      ) : isMismatch ? (
                        <span className="badge badge-warning" style={{ fontSize: '11px', padding: '2px 6px' }}>
                          F1: {f1Pct}%
                        </span>
                      ) : textRes?.exactMatch ? (
                        <span className="badge badge-success" style={{ fontSize: '11px', padding: '2px 6px' }}>
                          Exact Match
                        </span>
                      ) : textRes?.normalizedExactMatch ? (
                        <span className="badge badge-info" style={{ fontSize: '11px', padding: '2px 6px' }}>
                          Normalized
                        </span>
                      ) : (
                        <span className="badge badge-neutral" style={{ fontSize: '11px', padding: '2px 6px' }}>
                          Unsupervised
                        </span>
                      )}
                    </td>
                    <td
                      style={{
                        padding: '8px 12px',
                        color: 'var(--text-secondary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: '240px',
                      }}
                      title={rec.prompt}
                    >
                      {rec.prompt}
                    </td>
                    <td
                      style={{
                        padding: '8px 12px',
                        color: 'var(--text-primary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: '240px',
                      }}
                      title={rec.response}
                    >
                      {rec.response}
                    </td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>
                      {rec.latencyMs ? `${rec.latencyMs}ms` : '—'}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedCaseId(rec.caseId);
                        }}
                        className="btn btn-ghost"
                        style={{ padding: '4px', height: 'auto' }}
                        aria-label={`Inspect case ${rec.caseId}`}
                      >
                        <Eye size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Record Inspection Drawer */}
      <RecordDetailDrawer
        record={selectedRecord}
        textResult={selectedRecord ? textMap.get(selectedRecord.caseId) : undefined}
        jsonResult={selectedRecord ? jsonMap.get(selectedRecord.caseId) : undefined}
        onClose={() => setSelectedCaseId(null)}
      />
    </div>
  );
}
