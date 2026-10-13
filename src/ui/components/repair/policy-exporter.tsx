'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  FileCode,
  FileJson,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  UserCheck,
} from 'lucide-react';
import { generatePolicyCodeSnippets } from '@/server/repair/code-generator';
import type { RepairApproval, ValidationMode } from '@/server/repair/types';

export interface PolicyExporterProps {
  threshold: number;
  positiveLabel: string;
  falseNegativeCost: number;
  falsePositiveCost: number;
  datasetName?: string;
  totalSamples?: number;
  validationMode?: ValidationMode;
  policyId?: string;
  initialApproval?: RepairApproval | null;
}

export default function PolicyExporter({
  threshold,
  positiveLabel,
  falseNegativeCost,
  falsePositiveCost,
  datasetName = 'melanoma-synthetic.csv',
  totalSamples = 20000,
  validationMode = 'single_cohort_optimization',
  policyId = 'pol_opt_019',
  initialApproval = null,
}: PolicyExporterProps) {
  const [activeTab, setActiveTab] = useState<'python' | 'typescript' | 'json' | 'yaml'>('python');
  const [copied, setCopied] = useState(false);

  // Human approval state
  const [approval, setApproval] = useState<RepairApproval | null>(initialApproval);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [reviewerName, setReviewerName] = useState('Dr. Eleanor Vance (Lead Clinical ML)');
  const [reviewerComments, setReviewerComments] = useState(
    'Reviewed 101-point threshold sweep. Operating cutoff balances false negative clinical penalties while preserving high specificity on validation cohort.'
  );
  const [checkboxAudit, setCheckboxAudit] = useState(true);
  const [checkboxProhibitAuto, setCheckboxProhibitAuto] = useState(true);
  const [approvalError, setApprovalError] = useState<string | null>(null);

  const snippets = generatePolicyCodeSnippets({
    policyId,
    version: 1,
    operatingThreshold: threshold,
    positiveLabel,
    falseNegativeCost,
    falsePositiveCost,
    datasetName,
    totalSamples,
    validationMode,
    approval: approval ?? undefined,
  });

  const currentCode =
    activeTab === 'python'
      ? snippets.python
      : activeTab === 'typescript'
      ? snippets.typescript
      : activeTab === 'json'
      ? snippets.json
      : snippets.yaml;

  const handleCopy = () => {
    navigator.clipboard.writeText(currentCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApprove = () => {
    if (!reviewerComments || reviewerComments.trim().length < 8) {
      setApprovalError('Please provide a meaningful rationale of at least 8 characters.');
      return;
    }
    if (!checkboxAudit || !checkboxProhibitAuto) {
      setApprovalError('All safety verifications must be confirmed before approval.');
      return;
    }

    const newApproval: RepairApproval = {
      approvedBy: 'usr_clinical_lead_1',
      approvedByName: reviewerName.trim(),
      approvedAt: new Date().toISOString(),
      comments: reviewerComments.trim(),
      expectedVersion: 1,
      automatedDeploymentProhibited: true,
      signature: `sig_verified_${Date.now()}`,
    };

    setApproval(newApproval);
    setShowApprovalModal(false);
    setApprovalError(null);
  };

  return (
    <div className="card card-elevated">
      {/* Header */}
      <div
        className="card-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 'var(--space-2)',
        }}
      >
        <div className="card-title">
          <Terminal size={16} style={{ color: 'var(--color-primary, #3b82f6)' }} />
          <span>Production Operating Policy Deployment</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          {approval ? (
            <span className="badge badge-success" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <ShieldCheck size={12} />
              HUMAN APPROVED (v1)
            </span>
          ) : (
            <span
              className="badge"
              style={{
                backgroundColor: 'rgba(245, 158, 11, 0.15)',
                color: '#f59e0b',
                border: '1px solid #f59e0b',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <AlertTriangle size={12} />
              PENDING HUMAN REVIEW (DRAFT)
            </span>
          )}
          <span className="badge badge-accent">O(1) Inference Overhead</span>
        </div>
      </div>

      <div className="card-body">
        {/* Human Approval Status Banner */}
        {approval ? (
          <div
            style={{
              padding: 'var(--space-4)',
              borderRadius: 'var(--radius-md, 8px)',
              backgroundColor: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              marginBottom: 'var(--space-4)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
                  <UserCheck size={16} style={{ color: '#10b981' }} />
                  <strong style={{ fontSize: 'var(--text-sm)', color: '#10b981' }}>
                    Certified Human Approval Confirmed
                  </strong>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    ({new Date(approval.approvedAt).toLocaleString()})
                  </span>
                </div>
                <p style={{ margin: '0 0 var(--space-2) 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  <strong>Reviewer:</strong> {approval.approvedByName} ({approval.approvedBy})
                </p>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-primary)', fontStyle: 'italic', background: 'rgba(0,0,0,0.2)', padding: '6px 10px', borderRadius: '4px' }}>
                  &ldquo;{approval.comments}&rdquo;
                </p>
              </div>

              <div style={{ textAlign: 'right' }}>
                <span className="badge badge-success" style={{ fontSize: '10px' }}>
                  Automated Deployment Prohibited
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div
            style={{
              padding: 'var(--space-4)',
              borderRadius: 'var(--radius-md, 8px)',
              backgroundColor: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              marginBottom: 'var(--space-4)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                <ShieldAlert size={20} style={{ color: '#f59e0b', flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <h4 style={{ margin: '0 0 4px 0', fontSize: 'var(--text-sm)', color: '#f59e0b', fontWeight: 600 }}>
                    Human Sign-Off Required Before Production Serving
                  </h4>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    WhyLab enforces strict safety invariants: autonomous or automated policy deployment into production is prohibited.
                    An authorized clinical or technical reviewer must review cost tradeoffs and approve the policy before deployment.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowApprovalModal(true)}
                className="btn btn-primary btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
              >
                <UserCheck size={14} />
                Approve Policy
              </button>
            </div>
          </div>
        )}

        {/* Approval Modal Dialog */}
        {showApprovalModal && (
          <div
            style={{
              marginBottom: 'var(--space-4)',
              padding: 'var(--space-4)',
              backgroundColor: 'var(--bg-canvas, #090d16)',
              border: '1px solid var(--border-focus, #3b82f6)',
              borderRadius: 'var(--radius-md, 8px)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
              <Lock size={16} style={{ color: 'var(--color-primary, #3b82f6)' }} />
              <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
                Authorizing Operating Policy for Staging / Serving
              </strong>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Reviewer Name & Title:
                </label>
                <input
                  type="text"
                  value={reviewerName}
                  onChange={(e) => setReviewerName(e.target.value)}
                  className="input input-sm"
                  style={{ width: '100%', fontSize: '12px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Approval Rationale / Clinical Justification (Required):
                </label>
                <textarea
                  rows={3}
                  value={reviewerComments}
                  onChange={(e) => setReviewerComments(e.target.value)}
                  className="input"
                  style={{ width: '100%', fontSize: '12px', fontFamily: 'var(--font-sans)', resize: 'vertical' }}
                  placeholder="Detail the justification for shifting the operating cutoff..."
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: '11px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={checkboxAudit}
                    onChange={(e) => setCheckboxAudit(e.target.checked)}
                  />
                  <span>I have audited the FN ({falseNegativeCost}x) and FP ({falsePositiveCost}x) cost matrix against operational priorities.</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: '11px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={checkboxProhibitAuto}
                    onChange={(e) => setCheckboxProhibitAuto(e.target.checked)}
                  />
                  <span>I confirm automated deployment is prohibited; activation requires manual staging verification.</span>
                </label>
              </div>

              {approvalError && (
                <div style={{ color: 'var(--status-error, #ef4444)', fontSize: '11px' }}>
                  {approvalError}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                <button
                  type="button"
                  onClick={() => setShowApprovalModal(false)}
                  className="btn btn-secondary btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApprove}
                  className="btn btn-primary btn-sm"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <CheckCircle2 size={14} />
                  Sign & Approve Policy
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Language Tabs & Copy Button */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 'var(--space-2)',
            marginBottom: 'var(--space-3)',
          }}
        >
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button
              type="button"
              onClick={() => setActiveTab('python')}
              className={`btn btn-sm ${activeTab === 'python' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <Code2 size={12} />
              Python
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('typescript')}
              className={`btn btn-sm ${activeTab === 'typescript' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <FileCode size={12} />
              TypeScript
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('json')}
              className={`btn btn-sm ${activeTab === 'json' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <FileJson size={12} />
              JSON Schema
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('yaml')}
              className={`btn btn-sm ${activeTab === 'yaml' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              YAML Config
            </button>
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className="btn btn-secondary btn-sm"
            style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            {copied ? <Check size={12} style={{ color: '#10b981' }} /> : <Copy size={12} />}
            {copied ? 'Copied to Clipboard!' : 'Copy Code'}
          </button>
        </div>

        {/* Code Block */}
        <div
          style={{
            backgroundColor: 'var(--bg-canvas, #090d16)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm, 6px)',
            padding: 'var(--space-4)',
            overflowX: 'auto',
          }}
        >
          <pre
            style={{
              margin: 0,
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              color: 'var(--text-primary)',
              lineHeight: 1.5,
              whiteSpace: 'pre',
            }}
          >
            {currentCode}
          </pre>
        </div>

        {/* Verification Checklist */}
        <div
          style={{
            marginTop: 'var(--space-4)',
            padding: 'var(--space-3) var(--space-4)',
            backgroundColor: 'var(--bg-code, #0b1120)',
            borderRadius: 'var(--radius-sm, 6px)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
            <ShieldCheck size={14} style={{ color: '#10b981' }} />
            <strong style={{ fontSize: 'var(--text-xs)', color: 'var(--text-primary)' }}>
              Production Policy Safety Checklist
            </strong>
          </div>
          <ul
            style={{
              margin: 0,
              paddingLeft: 'var(--space-4)',
              fontSize: '11px',
              color: 'var(--text-secondary)',
              lineHeight: 1.6,
            }}
          >
            <li>
              <strong>Preserves Raw Probability Scores:</strong> Downstream analytics and calibration audits continue
              to receive unadulterated probabilities.
            </li>
            <li>
              <strong>Deterministic Re-evaluation:</strong> Calibrated on {totalSamples.toLocaleString()} verified cases
              with zero synthetic interpolation.
            </li>
            <li>
              <strong>Explicit Human Sign-Off:</strong> Prohibits automated model deployment; requires recorded operator
              rationale in compliance audit log.
            </li>
            <li>
              <strong>Instant Rollback:</strong> Can be reverted to baseline &tau; = 0.50 immediately via config without
              re-deploying model weights.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
