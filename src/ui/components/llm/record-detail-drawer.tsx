'use client';

import React, { useEffect } from 'react';
import { X, CheckCircle2, AlertTriangle, Clock, Zap, FileCode, Tag } from 'lucide-react';
import type { LlmRecord } from '@/core/domain/llm-types';
import type { TextMatchRecordResult } from '@/core/diagnostics/llm/text-metrics';
import type { JsonRecordValidationResult } from '@/core/diagnostics/llm/schema-validator';

interface RecordDetailDrawerProps {
  record: LlmRecord | null;
  textResult?: TextMatchRecordResult;
  jsonResult?: JsonRecordValidationResult;
  onClose: () => void;
}

export function RecordDetailDrawer({
  record,
  textResult,
  jsonResult,
  onClose,
}: RecordDetailDrawerProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!record) return null;

  const isEm = textResult?.exactMatch;
  const isNem = textResult?.normalizedExactMatch;
  const f1 = textResult?.tokenF1 !== undefined ? (textResult.tokenF1 * 100).toFixed(0) : null;
  const isJsonValid = jsonResult?.isJsonParseValid;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(5, 7, 12, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        justifyContent: 'flex-end',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '680px',
          height: '100%',
          background: 'var(--bg-surface)',
          borderLeft: '1px solid var(--border-default)',
          boxShadow: 'var(--shadow-xl)',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          padding: 'var(--space-4)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingBottom: 'var(--space-3)',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                {record.caseId}
              </span>
              {record.modelVersion && (
                <span className="badge badge-neutral" style={{ fontSize: '0.75rem' }}>
                  {record.modelVersion}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)', flexWrap: 'wrap' }}>
              {record.latencyMs !== null && record.latencyMs !== undefined && (
                <span className="badge badge-warning" style={{ fontSize: '0.75rem' }}>
                  <Clock size={11} style={{ marginRight: '4px' }} />
                  {record.latencyMs} ms
                </span>
              )}
              {record.tokenUsage?.totalTokens && (
                <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>
                  <Zap size={11} style={{ marginRight: '4px' }} />
                  {record.tokenUsage.totalTokens} tokens
                </span>
              )}
              {isEm ? (
                <span className="badge badge-success" style={{ fontSize: '0.75rem' }}>
                  <CheckCircle2 size={11} style={{ marginRight: '4px' }} />
                  Exact Match
                </span>
              ) : isNem ? (
                <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>
                  Normalized Match
                </span>
              ) : textResult?.hasReference ? (
                <span className="badge badge-danger" style={{ fontSize: '0.75rem' }}>
                  Mismatch (F1: {f1}%)
                </span>
              ) : null}
              {jsonResult && !isJsonValid && (
                <span className="badge badge-danger" style={{ fontSize: '0.75rem' }}>
                  <AlertTriangle size={11} style={{ marginRight: '4px' }} />
                  Syntax Error
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn btn-ghost"
            style={{ padding: '6px', cursor: 'pointer' }}
            aria-label="Close record inspection"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
          {/* Prompt Section */}
          <div>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 'var(--space-1)' }}>
              Input Prompt
            </div>
            <div
              style={{
                padding: 'var(--space-3)',
                background: 'var(--bg-code)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-sm)',
                lineHeight: 1.5,
                color: 'var(--text-primary)',
                whiteSpace: 'pre-wrap',
                fontFamily: 'var(--font-sans)',
              }}
            >
              {record.prompt}
            </div>
          </div>

          {/* Model Response Section */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-1)' }}>
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Model Response
              </span>
              {jsonResult?.wasMarkdownWrapped && (
                <span style={{ fontSize: '0.75rem', color: 'var(--color-warning)' }}>
                  (Markdown Code Fence Stripped)
                </span>
              )}
            </div>
            <div
              style={{
                padding: 'var(--space-3)',
                background: 'var(--bg-code)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-sm)',
                lineHeight: 1.5,
                color: 'var(--text-primary)',
                whiteSpace: 'pre-wrap',
                fontFamily: isJsonValid ? 'var(--font-mono)' : 'var(--font-sans)',
              }}
            >
              {jsonResult?.isJsonParseValid && jsonResult.parsedObject
                ? JSON.stringify(jsonResult.parsedObject, null, 2)
                : record.response}
            </div>
          </div>

          {/* Reference Answer Section */}
          {record.referenceAnswer && (
            <div>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 'var(--space-1)' }}>
                Ground Truth Reference Answer
              </div>
              <div
                style={{
                  padding: 'var(--space-3)',
                  background: 'var(--bg-code)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-sm)',
                  lineHeight: 1.5,
                  color: 'var(--color-success)',
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                {record.referenceAnswer}
              </div>
            </div>
          )}

          {/* Schema Violations */}
          {jsonResult?.violations && jsonResult.violations.length > 0 && (
            <div>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-danger)', textTransform: 'uppercase', marginBottom: 'var(--space-1)' }}>
                Schema Violations ({jsonResult.violations.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {jsonResult.violations.map((v, i) => (
                  <div
                    key={i}
                    style={{
                      padding: 'var(--space-2)',
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 'var(--text-xs)',
                      color: 'var(--color-danger)',
                    }}
                  >
                    <strong>{v.path}:</strong> {v.message}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Metadata Section */}
          {record.metadata && Object.keys(record.metadata).length > 0 && (
            <div>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 'var(--space-1)' }}>
                Metadata Attributes
              </div>
              <table style={{ width: '100%', fontSize: 'var(--text-xs)', borderCollapse: 'collapse' }}>
                <tbody>
                  {Object.entries(record.metadata).map(([k, v]) => (
                    <tr key={k} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '6px 8px', color: 'var(--text-secondary)', width: '35%' }}>{k}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                        {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
