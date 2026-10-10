'use client';

import React, { useState } from 'react';
import type { AdversarialAuditReport, AdversarialChallenge } from '@/core/falsification/adversarial-review';
import type { Investigation, Hypothesis } from '@/core/domain/types';
import type { FalsificationEvaluation } from '@/core/falsification/falsification-engine';
import {
  ShieldCheck,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Sparkles,
  GitBranch,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  CheckCircle2,
  TestTube,
} from 'lucide-react';
import Link from 'next/link';

interface RankedHypothesisItem {
  hypothesis: Hypothesis;
  evaluation: FalsificationEvaluation;
  isPrimaryCandidate: boolean;
  rank: number;
}

interface AdversarialWorkbenchProps {
  investigation: Investigation;
  auditReport: AdversarialAuditReport;
  rankedHypotheses: RankedHypothesisItem[];
}

export function AdversarialWorkbench({
  investigation,
  auditReport,
  rankedHypotheses,
}: AdversarialWorkbenchProps) {
  const [activeTab, setActiveTab] = useState<'hypotheses' | 'adversarial'>('hypotheses');
  const [verdictFilter, setVerdictFilter] = useState<string>('all');
  const [expandedLimitations, setExpandedLimitations] = useState<Record<string, boolean>>({});

  const toggleLimitation = (id: string) => {
    setExpandedLimitations((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredChallenges = auditReport.challenges.filter((c) => {
    if (verdictFilter === 'all') return true;
    return c.verdict === verdictFilter;
  });

  const getVerdictBadge = (verdict: AdversarialChallenge['verdict']) => {
    switch (verdict) {
      case 'refuted':
        return <span className="badge badge-success">DEFENDED / REFUTED</span>;
      case 'compound_factor':
        return <span className="badge badge-warning">COMPOUND FACTOR</span>;
      case 'upheld':
        return <span className="badge badge-danger">RIVAL UPHELD</span>;
      case 'inconclusive':
      default:
        return <span className="badge badge-neutral">INCONCLUSIVE</span>;
    }
  };

  const getVerdictIcon = (verdict: AdversarialChallenge['verdict']) => {
    switch (verdict) {
      case 'refuted':
        return <ShieldCheck size={18} style={{ color: 'var(--status-success)' }} />;
      case 'compound_factor':
        return <AlertTriangle size={18} style={{ color: 'var(--status-warning)' }} />;
      case 'upheld':
        return <XCircle size={18} style={{ color: 'var(--status-danger)' }} />;
      case 'inconclusive':
      default:
        return <HelpCircle size={18} style={{ color: 'var(--text-muted)' }} />;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Tab Navigation */}
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-2)',
          borderBottom: '1px solid var(--border-default)',
          paddingBottom: 'var(--space-2)',
        }}
      >
        <button
          onClick={() => setActiveTab('hypotheses')}
          className={`btn btn-sm ${activeTab === 'hypotheses' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}
        >
          <GitBranch size={15} />
          Falsification & Hypotheses ({rankedHypotheses.length})
        </button>

        <button
          onClick={() => setActiveTab('adversarial')}
          className={`btn btn-sm ${activeTab === 'adversarial' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}
        >
          <ShieldCheck size={15} />
          Challenge WhyLab: Adversarial Review ({auditReport.challenges.length})
          <span className="badge badge-accent" style={{ fontSize: '10px' }}>
            Phase 8
          </span>
        </button>
      </div>

      {/* TAB 1: RANKED HYPOTHESES & FALSIFICATION */}
      {activeTab === 'hypotheses' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          {/* Falsification Philosophy Banner */}
          <div className="card" style={{ padding: 'var(--space-5)', borderLeft: '4px solid var(--primary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <GitBranch size={22} style={{ color: 'var(--primary)', flexShrink: 0 }} />
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
                  <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Falsification-First Engine: Hypotheses Ranked & Verified
                  </h2>
                  <span className="badge badge-accent">Phase 4 Engine</span>
                </div>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  WhyLab rejects ungrounded AI guesses. Every candidate root cause is subjected to controlled counterfactual
                  experiments attempting to disprove it. Hypotheses are categorized strictly as <strong>SUPPORTED</strong>,
                  <strong> WEAKENED</strong>, <strong>REJECTED</strong>, or <strong>INCONCLUSIVE</strong> with deterministic next actions.
                </p>
              </div>
            </div>
          </div>

          {/* Hypotheses List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {rankedHypotheses.map((item) => {
              const { hypothesis: hyp, evaluation, isPrimaryCandidate, rank } = item;
              const verdictBadge =
                evaluation.verdict === 'supported'
                  ? 'badge-success'
                  : evaluation.verdict === 'weakened'
                  ? 'badge-warning'
                  : evaluation.verdict === 'rejected'
                  ? 'badge-danger'
                  : 'badge-neutral';

              return (
                <div
                  key={hyp.id}
                  className={`card card-elevated ${isPrimaryCandidate ? 'card-primary' : ''}`}
                  style={{
                    padding: 'var(--space-6)',
                    border: isPrimaryCandidate ? '1px solid var(--border-accent, #3b82f6)' : undefined,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 'var(--space-2)',
                      marginBottom: 'var(--space-3)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <span className="badge badge-neutral">RANK #{rank}</span>
                      <span className={`badge ${verdictBadge}`} style={{ textTransform: 'uppercase', fontWeight: 700 }}>
                        {evaluation.verdict === 'supported' && <CheckCircle2 size={11} />}
                        {evaluation.verdict === 'rejected' && <XCircle size={11} />}
                        VERDICT: {evaluation.verdict}
                      </span>
                      {isPrimaryCandidate && (
                        <span className="badge badge-info" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Sparkles size={11} />
                          PRIMARY ROOT CAUSE CANDIDATE
                        </span>
                      )}
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                        ID: {hyp.id}
                      </span>
                    </div>

                    <div className="badge badge-info">
                      Confidence: {hyp.confidence.level.toUpperCase()} (Score: {(evaluation.confidenceScore * 100).toFixed(0)}%)
                    </div>
                  </div>

                  <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 'var(--space-2)' }}>
                    {hyp.statement}
                  </h3>
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-4)' }}>
                    <strong>Evidence Rationale:</strong> {evaluation.decisionRationale}
                  </p>

                  {/* Actionable Next Step Box */}
                  <div
                    style={{
                      padding: 'var(--space-4)',
                      backgroundColor: 'rgba(59, 130, 246, 0.05)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-sm)',
                      marginBottom: 'var(--space-5)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 'var(--space-3)',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
                        <span className="badge badge-accent" style={{ fontSize: '10px' }}>
                          NEXT ACTION: {evaluation.nextAction.stage.toUpperCase()}
                        </span>
                        <strong style={{ fontSize: 'var(--text-xs)', color: 'var(--text-primary)' }}>
                          {evaluation.nextAction.title}
                        </strong>
                      </div>
                      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                        {evaluation.nextAction.description}
                      </p>
                    </div>

                    {evaluation.nextAction.stage === 'repair' && (
                      <Link href={`/investigations/${investigation.id}/repair`} className="btn btn-primary btn-sm">
                        Open Repair Lab
                        <ArrowRight size={12} />
                      </Link>
                    )}
                  </div>

                  {/* Supporting Evidence Relationships */}
                  <div style={{ marginBottom: 'var(--space-4)' }}>
                    <strong style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Linked Evidence Nodes ({hyp.evidence.length})
                    </strong>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                      {hyp.evidence.map((link) => (
                        <div
                          key={link.evidenceId}
                          style={{
                            padding: 'var(--space-2) var(--space-3)',
                            backgroundColor: 'var(--bg-surface-subtle)',
                            borderRadius: 'var(--radius-xs)',
                            border: '1px solid var(--border-subtle)',
                            fontSize: 'var(--text-xs)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 'var(--space-2)',
                          }}
                        >
                          <span className="badge badge-accent" style={{ fontFamily: 'var(--font-mono)' }}>
                            {link.evidenceId}
                          </span>
                          <span className="badge badge-success" style={{ textTransform: 'uppercase', fontSize: '10px' }}>
                            {link.relationship}
                          </span>
                          <span style={{ color: 'var(--text-secondary)' }}>{link.rationale}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Verification Experiments Section */}
          <div className="card card-elevated">
            <div className="card-header">
              <div className="card-title">
                <TestTube size={15} />
                Falsification Experiments ({investigation.experiments.length})
              </div>
              <span className="badge badge-success">Reproducible Counterfactuals</span>
            </div>
            <div className="card-body">
              {investigation.experiments.map((exp) => (
                <div
                  key={exp.id}
                  style={{
                    padding: 'var(--space-4)',
                    backgroundColor: 'var(--bg-surface-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                    marginBottom: 'var(--space-3)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                    <span className="badge badge-info" style={{ fontFamily: 'var(--font-mono)' }}>
                      Method: {exp.method}
                    </span>
                    <span className="badge badge-success" style={{ textTransform: 'uppercase' }}>
                      Outcome: {exp.outcome ?? 'In Progress'}
                    </span>
                  </div>
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-primary)', marginBottom: 'var(--space-2)' }}>
                    <strong>Test Prediction:</strong> {exp.prediction}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ADVERSARIAL REVIEW (CHALLENGE WHYLAB) */}
      {activeTab === 'adversarial' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          {/* Executive Defense Status Banner */}
          <div
            className="card card-elevated"
            style={{
              padding: 'var(--space-6)',
              borderLeft:
                auditReport.defenseStatus === 'defended'
                  ? '4px solid var(--status-success)'
                  : auditReport.defenseStatus === 'compound_risk'
                  ? '4px solid var(--status-warning)'
                  : '4px solid var(--status-danger)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
              <div style={{ maxWidth: '800px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
                  {auditReport.defenseStatus === 'defended' && (
                    <ShieldCheck size={28} style={{ color: 'var(--status-success)' }} />
                  )}
                  {auditReport.defenseStatus === 'compound_risk' && (
                    <AlertTriangle size={28} style={{ color: 'var(--status-warning)' }} />
                  )}
                  {auditReport.defenseStatus === 'vulnerable' && (
                    <XCircle size={28} style={{ color: 'var(--status-danger)' }} />
                  )}

                  <div>
                    <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {auditReport.defenseStatus === 'defended'
                        ? 'PRIMARY DIAGNOSIS DEFENDED'
                        : auditReport.defenseStatus === 'compound_risk'
                        ? 'COMPOUND RISK FACTORS DETECTED'
                        : 'DIAGNOSIS VULNERABLE TO RIVAL CAUSE'}
                    </h2>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                      Tested against 5 rival hypotheses: Covariate Shift, Leakage, Miscalibration, Subgroup Concentration, and Sample Noise
                    </span>
                  </div>
                </div>

                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: 'var(--space-3)' }}>
                  {auditReport.executiveSummary}
                </p>

                <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-4)', flexWrap: 'wrap' }}>
                  <span className="badge badge-success">
                    {auditReport.refutedCount} Rival(s) Refuted
                  </span>
                  {auditReport.compoundCount > 0 && (
                    <span className="badge badge-warning">
                      {auditReport.compoundCount} Compound Factor(s)
                    </span>
                  )}
                  {auditReport.upheldCount > 0 && (
                    <span className="badge badge-danger">
                      {auditReport.upheldCount} Rival(s) Upheld
                    </span>
                  )}
                  {auditReport.inconclusiveCount > 0 && (
                    <span className="badge badge-neutral">
                      {auditReport.inconclusiveCount} Inconclusive
                    </span>
                  )}
                </div>
              </div>

              {/* Defense Score Gauge */}
              <div
                style={{
                  textAlign: 'center',
                  padding: 'var(--space-4)',
                  backgroundColor: 'var(--bg-surface-subtle)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  minWidth: '150px',
                }}
              >
                <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: 'var(--space-1)' }}>
                  DEFENSE SCORE
                </div>
                <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                  {auditReport.defenseScore}%
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: 'var(--space-1)' }}>
                  Statistical Rigor
                </div>
              </div>
            </div>
          </div>

          {/* Filter Pills */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button
                onClick={() => setVerdictFilter('all')}
                className={`btn btn-xs ${verdictFilter === 'all' ? 'btn-primary' : 'btn-ghost'}`}
              >
                All Challenges ({auditReport.challenges.length})
              </button>
              <button
                onClick={() => setVerdictFilter('refuted')}
                className={`btn btn-xs ${verdictFilter === 'refuted' ? 'btn-primary' : 'btn-ghost'}`}
              >
                Defended / Refuted ({auditReport.refutedCount})
              </button>
              {auditReport.compoundCount > 0 && (
                <button
                  onClick={() => setVerdictFilter('compound_factor')}
                  className={`btn btn-xs ${verdictFilter === 'compound_factor' ? 'btn-primary' : 'btn-ghost'}`}
                >
                  Compound Factors ({auditReport.compoundCount})
                </button>
              )}
              {auditReport.upheldCount > 0 && (
                <button
                  onClick={() => setVerdictFilter('upheld')}
                  className={`btn btn-xs ${verdictFilter === 'upheld' ? 'btn-primary' : 'btn-ghost'}`}
                >
                  Upheld ({auditReport.upheldCount})
                </button>
              )}
            </div>

            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
              Audit ID: {auditReport.id}
            </span>
          </div>

          {/* The 5 Adversarial Challenge Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {filteredChallenges.map((challenge, idx) => {
              const isExpanded = expandedLimitations[challenge.id] ?? false;

              return (
                <div
                  key={challenge.id}
                  className="card card-elevated"
                  style={{
                    padding: 'var(--space-5)',
                    border:
                      challenge.verdict === 'upheld'
                        ? '1px solid var(--status-danger-border, #ef4444)'
                        : challenge.verdict === 'compound_factor'
                        ? '1px solid var(--status-warning-border, #f59e0b)'
                        : undefined,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <span className="badge badge-neutral" style={{ fontFamily: 'var(--font-mono)' }}>
                        CHALLENGE #{idx + 1}
                      </span>
                      {getVerdictIcon(challenge.verdict)}
                      <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {challenge.name}
                      </h3>
                      {challenge.sampleSizeFloorProtected && (
                        <span className="badge badge-warning" style={{ fontSize: '10px' }}>
                          FLOOR PROTECTED (N &lt; 30)
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      {getVerdictBadge(challenge.verdict)}
                    </div>
                  </div>

                  {/* Rival Hypothesis statement */}
                  <div
                    style={{
                      padding: 'var(--space-3) var(--space-4)',
                      backgroundColor: 'var(--bg-surface-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-subtle)',
                      marginBottom: 'var(--space-4)',
                      fontSize: 'var(--text-xs)',
                    }}
                  >
                    <strong style={{ color: 'var(--text-primary)' }}>Rival Alternative: </strong>
                    <span style={{ color: 'var(--text-secondary)' }}>&ldquo;{challenge.rivalHypothesis}&rdquo;</span>
                  </div>

                  {/* Test Statistics Panel */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: 'var(--space-3)',
                      marginBottom: 'var(--space-4)',
                    }}
                  >
                    <div
                      style={{
                        padding: 'var(--space-3)',
                        backgroundColor: 'var(--bg-surface-elevated)',
                        borderRadius: 'var(--radius-xs)',
                        border: '1px solid var(--border-default)',
                      }}
                    >
                      <div style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                        Diagnostic Tool
                      </div>
                      <div style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--primary)', fontWeight: 600, marginTop: '2px' }}>
                        {challenge.targetDiagnosticTool}
                      </div>
                    </div>

                    <div
                      style={{
                        padding: 'var(--space-3)',
                        backgroundColor: 'var(--bg-surface-elevated)',
                        borderRadius: 'var(--radius-xs)',
                        border: '1px solid var(--border-default)',
                      }}
                    >
                      <div style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                        Test Statistic ({challenge.testStatistic.name})
                      </div>
                      <div style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 700, marginTop: '2px' }}>
                        {challenge.testStatistic.value !== null
                          ? typeof challenge.testStatistic.value === 'number'
                            ? challenge.testStatistic.value.toFixed(4)
                            : challenge.testStatistic.value
                          : 'N/A'}{' '}
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                          {challenge.testStatistic.unit}
                        </span>
                      </div>
                    </div>

                    <div
                      style={{
                        padding: 'var(--space-3)',
                        backgroundColor: 'var(--bg-surface-elevated)',
                        borderRadius: 'var(--radius-xs)',
                        border: '1px solid var(--border-default)',
                      }}
                    >
                      <div style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                        Refutation Boundary
                      </div>
                      <div style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {challenge.testStatistic.threshold}
                      </div>
                    </div>
                  </div>

                  {/* Scientific Rationale & Recommendation */}
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-primary)', lineHeight: 1.6, marginBottom: 'var(--space-2)' }}>
                    <strong>Scientific Rationale: </strong> {challenge.rationale}
                  </p>
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 'var(--space-3)' }}>
                    <strong>Engineering Recommendation: </strong> {challenge.recommendation}
                  </p>

                  {/* Expandable Limitations */}
                  {challenge.limitations.length > 0 && (
                    <div>
                      <button
                        onClick={() => toggleLimitation(challenge.id)}
                        className="btn btn-ghost btn-xs"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', paddingLeft: 0 }}
                      >
                        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        {isExpanded ? 'Hide analytical caveats' : `Show caveats (${challenge.limitations.length})`}
                      </button>

                      {isExpanded && (
                        <ul
                          style={{
                            marginTop: 'var(--space-2)',
                            paddingLeft: 'var(--space-4)',
                            fontSize: '11px',
                            color: 'var(--text-dim)',
                            lineHeight: 1.5,
                          }}
                        >
                          {challenge.limitations.map((lim, lIdx) => (
                            <li key={lIdx}>{lim}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Multi-Site Distribution Shift & Disparity Table (if available) */}
          {auditReport.multiSiteReport && auditReport.multiSiteReport.sites.length > 0 && (
            <div className="card card-elevated" style={{ padding: 'var(--space-6)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
                <div>
                  <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Multi-Site Distribution Shift & Subgroup Disparity Analysis
                  </h3>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                    Partition Column: &ldquo;{auditReport.multiSiteReport.column}&rdquo; | Sample Size Protection Floor: {auditReport.multiSiteReport.sampleSizeFloor}
                  </span>
                </div>
                <span className="badge badge-accent">KS, PSI & Wasserstein</span>
              </div>

              {/* Site Performance Disparity Table */}
              <div style={{ overflowX: 'auto', marginBottom: 'var(--space-5)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-default)', color: 'var(--text-dim)', textAlign: 'left' }}>
                      <th style={{ padding: 'var(--space-2)' }}>Cohort / Site</th>
                      <th style={{ padding: 'var(--space-2)' }}>Sample Size (N)</th>
                      <th style={{ padding: 'var(--space-2)' }}>Accuracy</th>
                      <th style={{ padding: 'var(--space-2)' }}>Recall</th>
                      <th style={{ padding: 'var(--space-2)' }}>Precision</th>
                      <th style={{ padding: 'var(--space-2)' }}>Brier Score</th>
                      <th style={{ padding: 'var(--space-2)' }}>Floor Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditReport.multiSiteReport.sites.map((site) => (
                      <tr key={site.site} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: 'var(--space-2)', fontWeight: 600, color: 'var(--text-primary)' }}>
                          Site {site.site} {site.site === auditReport.multiSiteReport?.referenceSite && '(Baseline)'}
                        </td>
                        <td style={{ padding: 'var(--space-2)', fontFamily: 'var(--font-mono)' }}>{site.sampleSize}</td>
                        <td style={{ padding: 'var(--space-2)', fontFamily: 'var(--font-mono)' }}>
                          {site.accuracy !== null ? `${(site.accuracy * 100).toFixed(1)}%` : 'N/A'}
                        </td>
                        <td style={{ padding: 'var(--space-2)', fontFamily: 'var(--font-mono)' }}>
                          {site.recall !== null ? `${(site.recall * 100).toFixed(1)}%` : 'N/A'}
                        </td>
                        <td style={{ padding: 'var(--space-2)', fontFamily: 'var(--font-mono)' }}>
                          {site.precision !== null ? `${(site.precision * 100).toFixed(1)}%` : 'N/A'}
                        </td>
                        <td style={{ padding: 'var(--space-2)', fontFamily: 'var(--font-mono)' }}>
                          {site.brierScore !== null ? site.brierScore.toFixed(3) : 'N/A'}
                        </td>
                        <td style={{ padding: 'var(--space-2)' }}>
                          {site.sampleSizeProtected ? (
                            <span className="badge badge-warning" style={{ fontSize: '10px' }}>
                              Protected (&lt; 30)
                            </span>
                          ) : (
                            <span className="badge badge-success" style={{ fontSize: '10px' }}>
                              Adequate
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pairwise Drift Measurements */}
              {auditReport.multiSiteReport.pairwiseDrift.length > 0 && (
                <div>
                  <h4 style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 'var(--space-2)' }}>
                    Continuous Distribution Drift Measurements
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    {auditReport.multiSiteReport.pairwiseDrift.map((drift, dIdx) => (
                      <div
                        key={dIdx}
                        style={{
                          padding: 'var(--space-3)',
                          backgroundColor: 'var(--bg-surface-subtle)',
                          borderRadius: 'var(--radius-xs)',
                          border: '1px solid var(--border-subtle)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: 'var(--space-3)',
                          fontSize: 'var(--text-xs)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          <span className="badge badge-info" style={{ fontFamily: 'var(--font-mono)' }}>
                            {drift.siteA} vs {drift.siteB}
                          </span>
                          <span style={{ color: 'var(--text-secondary)' }}>
                            Feature: <strong>{drift.feature}</strong>
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', fontFamily: 'var(--font-mono)' }}>
                          <span>KS: <strong>{drift.ksStatistic?.toFixed(4) ?? 'N/A'}</strong></span>
                          <span>PSI: <strong>{drift.psiStatistic?.toFixed(4) ?? 'N/A'}</strong></span>
                          <span>Wasserstein: <strong>{drift.wassersteinDistance?.toFixed(4) ?? 'N/A'}</strong></span>
                          <span
                            className={`badge ${
                              drift.driftLevel === 'severe'
                                ? 'badge-danger'
                                : drift.driftLevel === 'moderate'
                                ? 'badge-warning'
                                : 'badge-neutral'
                            }`}
                          >
                            Drift: {drift.driftLevel.toUpperCase()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
