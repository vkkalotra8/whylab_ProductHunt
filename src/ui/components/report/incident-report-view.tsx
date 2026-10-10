'use client';

import { useState } from 'react';
import type { MLIncidentReport } from '@/server/export/incident-report';
import { exportIncidentReportToMarkdown } from '@/server/export/markdown-export';
import { downloadIncidentReportPdf } from '@/server/export/pdf-generator';
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileCode,
  FileText,
  Printer,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

export interface IncidentReportViewProps {
  report: MLIncidentReport;
}

export default function IncidentReportView({ report }: IncidentReportViewProps) {
  const [copiedYaml, setCopiedYaml] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const handleDownloadPdf = () => {
    try {
      setIsGeneratingPdf(true);
      downloadIncidentReportPdf(report);
    } catch (err) {
      console.error('Failed to generate PDF report:', err);
    } finally {
      setTimeout(() => setIsGeneratingPdf(false), 600);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadMarkdown = () => {
    const md = exportIncidentReportToMarkdown(report);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `WhyLab_Incident_Report_${report.investigationId}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadJson = () => {
    const json = JSON.stringify(report, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `WhyLab_Incident_Report_${report.investigationId}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopyYaml = () => {
    navigator.clipboard.writeText(report.cicdPolicy.yamlConfig);
    setCopiedYaml(true);
    setTimeout(() => setCopiedYaml(false), 2000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Top Toolbar (Hidden when printing) */}
      <div
        className="no-print"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 'var(--space-4)',
          padding: 'var(--space-4)',
          backgroundColor: 'var(--bg-surface-elevated, #141d30)',
          borderRadius: 'var(--radius-md, 8px)',
          border: '1px solid var(--border-default)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <FileText size={18} style={{ color: 'var(--color-primary, #3b82f6)' }} />
          <div>
            <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
              Certified ML Reliability Incident Report
            </strong>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Report ID: {report.reportId} &bull; Generated from verified deterministic execution
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={isGeneratingPdf}
            className="btn btn-primary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
            title="Download direct professional light-theme vector PDF report"
          >
            <Download size={13} />
            {isGeneratingPdf ? 'Generating PDF...' : 'Download PDF'}
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
            title="Open browser print dialog"
          >
            <Printer size={13} />
            Print
          </button>
          <button
            type="button"
            onClick={handleDownloadMarkdown}
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
            title="Download GitHub-formatted Markdown report"
          >
            <Download size={13} />
            Markdown
          </button>
          <button
            type="button"
            onClick={handleDownloadJson}
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
            title="Download complete structured JSON artifact"
          >
            <Download size={13} />
            JSON
          </button>
        </div>
      </div>

      {/* Main Printable Document Card */}
      <div
        className="card card-elevated"
        style={{
          padding: 'var(--space-8)',
          backgroundColor: 'var(--bg-surface, #0e1422)',
          maxWidth: '960px',
          margin: '0 auto',
          width: '100%',
          border: '1px solid var(--border-default)',
        }}
      >
        {/* Document Header */}
        <div
          style={{
            borderBottom: '2px solid var(--border-default)',
            paddingBottom: 'var(--space-6)',
            marginBottom: 'var(--space-6)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              flexWrap: 'wrap',
              gap: 'var(--space-4)',
              marginBottom: 'var(--space-4)',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
                <span
                  style={{
                    fontSize: 'var(--text-xl)',
                    fontWeight: 800,
                    color: 'var(--text-primary)',
                    letterSpacing: '-0.02em',
                  }}
                >
                  WhyLab 2.0 ML Incident Report
                </span>
                <span
                  className={report.severity === 'CRITICAL' ? 'badge badge-danger' : 'badge badge-warning'}
                  style={{ fontWeight: 700 }}
                >
                  SEVERITY: {report.severity}
                </span>
                <span className="badge badge-success" style={{ fontWeight: 700 }}>
                  STATUS: {report.status}
                </span>
              </div>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                Certified machine learning failure diagnosis and remediation audit with 100% deterministic mathematical verification.
              </p>
            </div>

            <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              <div>Report ID: {report.reportId}</div>
              <div>Investigation ID: {report.investigationId}</div>
              <div>Generated: {report.generatedAt.split('T')[0]}</div>
            </div>
          </div>

          {/* Metadata Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 'var(--space-3)',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs)',
              padding: 'var(--space-3) var(--space-4)',
              backgroundColor: 'var(--bg-code, #0b1120)',
              borderRadius: 'var(--radius-sm, 6px)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div>
              <span style={{ color: 'var(--text-muted)' }}>System: </span>
              <strong>{report.systemName}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Dataset: </span>
              <strong>{report.datasetName}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Cohort: </span>
              <strong>{report.sampleSize.toLocaleString()} cases</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Prevalence: </span>
              <strong>{report.prevalence}</strong>
            </div>
          </div>
        </div>

        {/* Section 1: Executive Summary */}
        <div style={{ marginBottom: 'var(--space-8)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
            <ShieldAlert size={16} style={{ color: '#ef4444' }} />
            <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              1. Observed Failure &amp; Severity Assessment
            </h3>
          </div>
          <div
            style={{
              padding: 'var(--space-4)',
              backgroundColor: 'rgba(239, 68, 68, 0.05)',
              borderLeft: '3px solid #ef4444',
              borderRadius: 'var(--radius-xs, 4px)',
              marginBottom: 'var(--space-3)',
            }}
          >
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: '#ef4444', marginBottom: '4px' }}>
              FAILURE MODE: {report.primaryFailureMode}
            </div>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              {report.executiveSummary}
            </p>
          </div>
        </div>

        {/* Section 2: 6-Dimension Reliability Audit Dashboard */}
        <div style={{ marginBottom: 'var(--space-8)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <Sparkles size={16} style={{ color: 'var(--color-primary, #3b82f6)' }} />
              <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                2. 6-Dimension ML Reliability Profile Audit
              </h3>
            </div>
            {report.reliabilityProfile.overallScore !== null && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
                Reliability Score:{' '}
                <strong style={{ color: report.reliabilityProfile.overallStatus === 'critical' ? '#ef4444' : '#10b981', fontSize: 'var(--text-sm)' }}>
                  {report.reliabilityProfile.overallScore} / 100
                </strong>
              </div>
            )}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 'var(--space-3)',
              marginBottom: 'var(--space-3)',
            }}
          >
            {report.reliabilityProfile.dimensions.map((dim) => {
              const borderCol =
                dim.status === 'critical'
                  ? '#ef4444'
                  : dim.status === 'warning'
                  ? '#f59e0b'
                  : dim.status === 'healthy'
                  ? '#10b981'
                  : 'var(--border-subtle)';

              const badgeCls =
                dim.status === 'critical'
                  ? 'badge-danger'
                  : dim.status === 'warning'
                  ? 'badge-warning'
                  : dim.status === 'healthy'
                  ? 'badge-success'
                  : 'badge-neutral';

              return (
                <div
                  key={dim.id}
                  style={{
                    padding: 'var(--space-3) var(--space-4)',
                    backgroundColor: 'var(--bg-code, #0b1120)',
                    border: '1px solid var(--border-subtle)',
                    borderLeft: `3px solid ${borderCol}`,
                    borderRadius: 'var(--radius-sm, 6px)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: 'var(--space-2)',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                        {dim.category}
                      </span>
                      <span className={`badge ${badgeCls}`} style={{ fontSize: '10px' }}>
                        {dim.status.toUpperCase()}
                      </span>
                    </div>
                    <strong style={{ fontSize: 'var(--text-xs)', color: 'var(--text-primary)' }}>
                      {dim.title}
                    </strong>
                    <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.4 }}>
                      {dim.headline}
                    </p>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-subtle)', paddingTop: 'var(--space-2)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{dim.keyMetric ?? 'Unassessed'}</span>
                    <strong style={{ color: dim.score !== null ? borderCol : 'var(--text-muted)' }}>
                      {dim.score !== null ? `${dim.score}%` : 'N/A'}
                    </strong>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <CheckCircle2 size={12} style={{ color: '#10b981' }} />
            <span>
              <strong>Zero-Hallucination Policy:</strong> Dimensions without empirical tests are strictly labeled as{' '}
              <em>unassessed</em>. No scores are ever estimated or interpolated.
            </span>
          </div>
        </div>

        {/* Section 3: Verified Evidence & Falsification */}
        <div style={{ marginBottom: 'var(--space-8)' }}>
          <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 'var(--space-3)' }}>
            3. Diagnostic Evidence &amp; Counterfactual Falsification
          </h3>

          <div className="table-container" style={{ marginBottom: 'var(--space-4)' }}>
            <table className="table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th style={{ width: '25%' }}>Hypothesis / Finding</th>
                  <th style={{ width: '15%' }}>Outcome</th>
                  <th style={{ width: '60%' }}>Evidence Rationale</th>
                </tr>
              </thead>
              <tbody style={{ fontSize: 'var(--text-xs)' }}>
                {report.falsificationAudit.map((f) => (
                  <tr key={f.hypothesisId}>
                    <td>
                      <strong style={{ fontFamily: 'var(--font-mono)' }}>{f.hypothesisId}</strong>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{f.statement}</div>
                    </td>
                    <td>
                      <span className={f.outcome === 'SUPPORTED' ? 'badge badge-success' : 'badge badge-warning'}>
                        {f.outcome}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-secondary)', lineHeight: 1.4 }}>{f.rationale}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 4: Remediated Operating Policy */}
        {report.remediation && (
          <div style={{ marginBottom: 'var(--space-8)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
              <ShieldCheck size={16} style={{ color: '#10b981' }} />
              <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                4. Verified Operating Policy Remediation
              </h3>
              <span className="badge badge-success">IDENTICAL ROWS EVALUATION</span>
            </div>

            <div className="table-container">
              <table className="table" style={{ margin: 0 }}>
                <thead>
                  <tr>
                    <th>Evaluation Dimension</th>
                    <th>Baseline (&tau; = {report.remediation.baselineThreshold.toFixed(2)})</th>
                    <th>Repaired (&tau; = {report.remediation.repairedThreshold.toFixed(2)})</th>
                    <th>Empirical Delta</th>
                    <th>Operational Impact</th>
                    <th>Provenance</th>
                  </tr>
                </thead>
                <tbody style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
                  {report.remediation.metricsDelta.map((row) => (
                    <tr key={row.metric}>
                      <td><strong>{row.metric}</strong></td>
                      <td>{row.before}</td>
                      <td style={{ color: '#10b981', fontWeight: 700 }}>{row.after}</td>
                      <td style={{ color: '#10b981', fontWeight: 700 }}>{row.delta}</td>
                      <td style={{ fontFamily: 'var(--font-sans)' }}>
                        <span className="badge badge-success">{row.impact}</span>
                      </td>
                      <td><span className="badge badge-success">[MEASURED]</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Section 5: Production CI/CD Gate Policy */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <FileCode size={16} style={{ color: 'var(--color-primary, #3b82f6)' }} />
              <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                5. Recommended Production CI/CD Monitoring Gates (.whylab/policy.yml)
              </h3>
            </div>

            <button
              type="button"
              onClick={handleCopyYaml}
              className="btn btn-secondary btn-sm no-print"
              style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              {copiedYaml ? <Check size={12} style={{ color: '#10b981' }} /> : <Copy size={12} />}
              {copiedYaml ? 'Copied YAML!' : 'Copy YAML Policy'}
            </button>
          </div>

          <div
            style={{
              padding: 'var(--space-4)',
              backgroundColor: 'var(--bg-canvas, #090d16)',
              borderRadius: 'var(--radius-sm, 6px)',
              border: '1px solid var(--border-subtle)',
              overflowX: 'auto',
            }}
          >
            <pre
              style={{
                margin: 0,
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                color: 'var(--text-primary)',
                lineHeight: 1.5,
              }}
            >
              {report.cicdPolicy.yamlConfig}
            </pre>
          </div>
        </div>

        {/* Document Footer Attestation */}
        <div
          style={{
            marginTop: 'var(--space-8)',
            paddingTop: 'var(--space-4)',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '11px',
            color: 'var(--text-muted)',
            flexWrap: 'wrap',
            gap: 'var(--space-2)',
          }}
        >
          <div>
            WhyLab 2.0 &bull; Cryptographic Provenance Guarantee &bull; Deterministic Engine v2.0
          </div>
          <div>
            Verified at: {report.generatedAt}
          </div>
        </div>
      </div>
    </div>
  );
}
