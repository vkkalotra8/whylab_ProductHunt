'use client';

import React, { useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  Edit3,
  ThumbsUp,
  ThumbsDown,
  Info,
  ShieldAlert,
} from 'lucide-react';
import type { StructuredJudgeResult } from '@/core/diagnostics/llm/structured-judge';
import { applyHumanReview } from '@/core/diagnostics/llm/structured-judge';

interface HumanReviewQueueProps {
  initialResults: StructuredJudgeResult[];
  onReviewUpdated?: (updated: StructuredJudgeResult[]) => void;
}

export function HumanReviewQueue({ initialResults, onReviewUpdated }: HumanReviewQueueProps) {
  const [results, setResults] = useState<StructuredJudgeResult[]>(initialResults);
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [overrideScore, setOverrideScore] = useState<number>(3);
  const [notes, setNotes] = useState<string>('');

  const pendingReview = results.filter((r) => r.status === 'NEEDS_HUMAN_REVIEW');
  const reviewed = results.filter((r) => r.operatorReview !== undefined);

  const handleAction = (
    caseId: string,
    action: 'approved' | 'overridden' | 'rejected',
    score?: number
  ) => {
    const updated = results.map((r) => {
      if (r.caseId === caseId) {
        return applyHumanReview(r, 'Operator (Engineer)', action, score, notes);
      }
      return r;
    });
    setResults(updated);
    setActiveCaseId(null);
    setNotes('');
    onReviewUpdated?.(updated);
  };

  return (
    <div className="card" style={{ padding: 'var(--space-4)', background: 'var(--bg-surface)' }}>
      {/* Header & Epistemic Disclaimer Banner */}
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              Human Review & Gatekeeper Queue
            </h3>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
              {pendingReview.length} uncertain evaluations require engineer validation.
            </p>
          </div>
          <span className="badge badge-warning" style={{ fontSize: '12px' }}>
            <UserCheck size={13} style={{ marginRight: '5px' }} />
            {pendingReview.length} Pending Actions
          </span>
        </div>

        {/* Epistemic disclaimer card */}
        <div
          style={{
            marginTop: 'var(--space-3)',
            padding: 'var(--space-3)',
            background: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.25)',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-secondary)',
            display: 'flex',
            gap: 'var(--space-2)',
            alignItems: 'flex-start',
          }}
        >
          <Info size={16} color="var(--color-primary)" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <strong style={{ color: 'var(--text-primary)' }}>Scientific Integrity Standard:</strong> Model-as-judge scores represent simulated secondary opinions, not verified ground truth. Low-confidence (&lt; 70%) and borderline cases are systematically quarantined here for human sign-off.
          </div>
        </div>
      </div>

      {/* Pending Items List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {pendingReview.length === 0 ? (
          <div
            style={{
              padding: 'var(--space-6)',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: 'var(--text-xs)',
            }}
          >
            <CheckCircle2 size={32} color="var(--color-success)" style={{ margin: '0 auto var(--space-2)' }} />
            Queue is clear. All evaluation cases meet confidence criteria or have received operator sign-off.
          </div>
        ) : (
          pendingReview.map((item) => {
            const isEditing = activeCaseId === item.caseId;

            return (
              <div
                key={item.caseId}
                style={{
                  padding: 'var(--space-3)',
                  background: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)', fontSize: 'var(--text-xs)' }}>
                        {item.caseId}
                      </span>
                      <span className="badge badge-info" style={{ fontSize: '11px' }}>
                        {item.rubricTitle}
                      </span>
                      <span className="badge badge-neutral" style={{ fontSize: '11px' }}>
                        Score: {item.score} / 5
                      </span>
                      <span className="badge badge-warning" style={{ fontSize: '11px' }}>
                        Conf: {(item.confidence * 100).toFixed(0)}%
                      </span>
                    </div>

                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-warning)', marginTop: '4px' }}>
                      <AlertTriangle size={11} style={{ display: 'inline', marginRight: '4px' }} />
                      {item.humanReviewReason}
                    </div>

                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: '6px' }}>
                      <strong>Judge Rationale:</strong> {item.rationale}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => handleAction(item.caseId, 'approved')}
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '11px' }}
                    >
                      <ThumbsUp size={11} style={{ marginRight: '4px' }} />
                      Approve ({item.score}/5)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveCaseId(isEditing ? null : item.caseId);
                        setOverrideScore(item.score);
                      }}
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: '11px' }}
                    >
                      <Edit3 size={11} style={{ marginRight: '4px' }} />
                      Override
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAction(item.caseId, 'rejected')}
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: '11px', color: 'var(--color-danger)' }}
                    >
                      <ThumbsDown size={11} style={{ marginRight: '4px' }} />
                      Reject
                    </button>
                  </div>
                </div>

                {/* Inline Override Panel */}
                {isEditing && (
                  <div
                    style={{
                      marginTop: 'var(--space-3)',
                      padding: 'var(--space-3)',
                      background: 'var(--bg-code)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 'var(--space-2)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>Override Score:</span>
                      <input
                        type="range"
                        min={1}
                        max={5}
                        step={1}
                        value={overrideScore}
                        onChange={(e) => setOverrideScore(Number(e.target.value))}
                        style={{ width: '120px' }}
                      />
                      <strong style={{ fontSize: 'var(--text-xs)', color: 'var(--color-primary)' }}>
                        {overrideScore} / 5
                      </strong>
                    </div>
                    <input
                      type="text"
                      placeholder="Optional justification note for audit log..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="input"
                      style={{ fontSize: 'var(--text-xs)', height: '28px' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
                      <button
                        type="button"
                        onClick={() => setActiveCaseId(null)}
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: '11px' }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAction(item.caseId, 'overridden', overrideScore)}
                        className="btn btn-primary btn-sm"
                        style={{ fontSize: '11px' }}
                      >
                        Save Override
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Completed Reviews Counter */}
      {reviewed.length > 0 && (
        <div style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--border-subtle)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          <CheckCircle2 size={12} style={{ display: 'inline', marginRight: '4px', color: 'var(--color-success)' }} />
          {reviewed.length} evaluation cases reviewed and signed off by engineer.
        </div>
      )}
    </div>
  );
}
