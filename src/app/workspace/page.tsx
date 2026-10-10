import Link from 'next/link';
import Breadcrumbs from '@/ui/components/shell/breadcrumbs';
import { listInvestigations } from '@/core/investigation/store';
import {
  Activity,
  ArrowRight,
  FolderOpen,
  Plus,
} from 'lucide-react';

const goldenFixtures = [
  {
    id: 'melanoma-synthetic',
    title: 'Melanoma Classification (Flagship)',
    category: 'Class Imbalance & Threshold Failure',
    rows: '20,000 rows',
    observedMetric: '94.2% Accuracy, 22.4% Recall',
    description: 'High-stakes clinical diagnostics exhibiting severe accuracy paradox due to 5.8% malignant prevalence.',
    primaryTool: 'run_counterfactual_test',
  },
  {
    id: 'kaggle-icu-sepsis',
    title: 'ICU Sepsis Early Detection Benchmark',
    category: 'Cost Sensitivity & Minority Risk',
    rows: '10,000 rows',
    observedMetric: '91.8% Accuracy, 18.2% Sepsis Recall',
    description: 'Critical care benchmark where false negatives carry 20x higher penalty than false alarms.',
    primaryTool: 'threshold_sweep',
  },
  {
    id: 'kaggle-stroke-dataset',
    title: 'Cerebrovascular Stroke Risk Classifier',
    category: 'Extreme Imbalance (1.8% Prevalence)',
    rows: '5,110 rows',
    observedMetric: '98.2% Accuracy, 4.3% Sensitivity',
    description: 'Near-zero minority recall masked by overwhelming negative majority in patient health records.',
    primaryTool: 'compute_classification_metrics',
  },
  {
    id: 'overconfident-classifier',
    title: 'Overconfident Clinical Predictor',
    category: 'Probability Miscalibration',
    rows: '8,400 rows',
    observedMetric: 'Brier Score: 0.182, ECE: 0.141',
    description: 'Model outputs probabilities clustered near 0.95 despite empirical accuracy hovering near 60%.',
    primaryTool: 'check_calibration',
  },
  {
    id: 'site-failure',
    title: 'Multi-Site Acquisition Shift',
    category: 'Subgroup & Slice Failure',
    rows: '12,500 rows',
    observedMetric: 'Site A: 96% Acc | Site B: 61% Acc',
    description: 'High aggregate metrics masking complete breakdown on imaging hardware from secondary clinical site.',
    primaryTool: 'slice_evaluation',
  },
  {
    id: 'kaggle-disaster-tweets',
    title: 'Disaster Message Intent Classifier',
    category: 'Distribution Drift & Leakage',
    rows: '7,613 rows',
    observedMetric: 'KS Distance: 0.38, PSI: 0.29',
    description: 'NLP evaluation showing substantial vocabulary drift between reference training and live test sets.',
    primaryTool: 'run_drift_tests',
  },
];

export default function WorkspacePage() {
  const recentInvestigations = listInvestigations();
  return (
    <div style={{ paddingBottom: 'var(--space-16)' }}>
      <Breadcrumbs items={[{ label: 'workspace' }]} />

      <div className="container" style={{ paddingTop: 'var(--space-8)' }}>
        {/* Workspace Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 'var(--space-4)',
            marginBottom: 'var(--space-8)',
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 'var(--text-3xl)',
                fontWeight: 700,
                color: 'var(--text-primary)',
                letterSpacing: '-0.02em',
                marginBottom: 'var(--space-1)',
              }}
            >
              Investigation Workspace
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
              Manage active ML debugging sessions, load saved cases, or explore calibrated benchmark fixtures.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <Link href="/investigate" className="btn btn-primary">
              <Plus size={15} />
              New Investigation
            </Link>
          </div>
        </div>

        {/* Golden Benchmark Fixtures Gallery */}
        <div style={{ marginBottom: 'var(--space-12)' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 'var(--space-4)',
            }}
          >
            <div>
              <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-primary)' }}>
                Golden Diagnostic Benchmarks
              </h2>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                Pre-calibrated empirical datasets demonstrating signature ML failure modes. Click any benchmark to launch an instant investigation.
              </p>
            </div>
            <span className="badge badge-accent">6 Deterministic Fixtures</span>
          </div>

          <div className="grid-cols-3">
            {goldenFixtures.map((fixture) => (
              <div
                key={fixture.id}
                className="card"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  padding: 'var(--space-5)',
                  backgroundColor: 'var(--bg-surface)',
                  transition: 'border-color var(--transition-fast)',
                }}
              >
                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 'var(--space-2)',
                    }}
                  >
                    <span className="badge badge-warning" style={{ fontSize: '11px' }}>
                      {fixture.category}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 'var(--text-xs)',
                        color: 'var(--text-dim)',
                      }}
                    >
                      {fixture.rows}
                    </span>
                  </div>

                  <h3
                    style={{
                      fontSize: 'var(--text-base)',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      marginBottom: 'var(--space-2)',
                    }}
                  >
                    {fixture.title}
                  </h3>

                  <div
                    style={{
                      backgroundColor: 'var(--bg-surface-subtle)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-xs)',
                      padding: 'var(--space-2) var(--space-3)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--text-xs)',
                      color: 'var(--status-danger)',
                      marginBottom: 'var(--space-3)',
                    }}
                  >
                    {fixture.observedMetric}
                  </div>

                  <p
                    style={{
                      fontSize: 'var(--text-xs)',
                      color: 'var(--text-secondary)',
                      lineHeight: 1.5,
                      marginBottom: 'var(--space-4)',
                    }}
                  >
                    {fixture.description}
                  </p>
                </div>

                <div
                  style={{
                    borderTop: '1px solid var(--border-subtle)',
                    paddingTop: 'var(--space-3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                    }}
                  >
                    Tool: {fixture.primaryTool}
                  </span>
                  <Link
                    href={`/investigate?fixture=${fixture.id}`}
                    className="btn btn-secondary btn-sm"
                  >
                    Load Case
                    <ArrowRight size={12} />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Investigations Section */}
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 'var(--space-4)',
            }}
          >
            <div>
              <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-primary)' }}>
                Recent Investigations
              </h2>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                Locally persisted investigation sessions on this machine.
              </p>
            </div>
            <span className="badge badge-neutral">
              {recentInvestigations.length} Session{recentInvestigations.length === 1 ? '' : 's'} Available
            </span>
          </div>

          {recentInvestigations.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 'var(--space-4)' }}>
              {recentInvestigations.map((inv) => (
                <div
                  key={inv.id}
                  className="card card-elevated"
                  style={{
                    padding: 'var(--space-5)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  <div>
                    {/* Header Badges */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                      <span
                        className={`badge ${
                          inv.sourceKind === 'fixture' ? 'badge-info' : 'badge-accent'
                        }`}
                        style={{ fontSize: '10px' }}
                      >
                        {inv.sourceKind === 'fixture' ? 'Golden Benchmark' : 'Custom Upload'}
                      </span>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                        <span className="badge badge-neutral" style={{ fontSize: '10px', textTransform: 'uppercase' }}>
                          Stage: {inv.stage}
                        </span>
                        <span
                          className={`badge ${
                            inv.status === 'completed'
                              ? 'badge-success'
                              : inv.status === 'failed'
                              ? 'badge-danger'
                              : 'badge-warning'
                          }`}
                          style={{ fontSize: '10px' }}
                        >
                          {inv.status}
                        </span>
                      </div>
                    </div>

                    {/* Dataset Title & Objective */}
                    <h3
                      style={{
                        fontSize: 'var(--text-base)',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        marginBottom: 'var(--space-1)',
                      }}
                    >
                      {inv.datasetName || 'Untitled Dataset'}
                    </h3>
                    <p
                      style={{
                        fontSize: 'var(--text-xs)',
                        color: 'var(--text-muted)',
                        lineHeight: 1.5,
                        marginBottom: 'var(--space-3)',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {inv.objective}
                    </p>

                    {/* Investigation Metadata Chips */}
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 'var(--space-2)',
                        marginBottom: 'var(--space-4)',
                        fontSize: '11px',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {inv.rowCount !== null && (
                        <span
                          style={{
                            padding: '2px 8px',
                            backgroundColor: 'var(--bg-card)',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border-subtle)',
                          }}
                        >
                          {inv.rowCount.toLocaleString()} rows
                        </span>
                      )}
                      <span
                        style={{
                          padding: '2px 8px',
                          backgroundColor: 'var(--bg-card)',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        {inv.evidenceCount} evidence items
                      </span>
                      <span
                        style={{
                          padding: '2px 8px',
                          backgroundColor: 'var(--bg-card)',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        {inv.hypothesisCount} hypotheses
                      </span>
                      {inv.artifactCount !== undefined && (
                        <span
                          style={{
                            padding: '2px 8px',
                            backgroundColor: 'rgba(59, 130, 246, 0.1)',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid rgba(59, 130, 246, 0.3)',
                            color: 'var(--primary)',
                          }}
                        >
                          {inv.artifactCount} artifacts
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Footer: ID + Action */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingTop: 'var(--space-3)',
                      borderTop: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div style={{ fontSize: '10px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                      {new Date(inv.updatedAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>

                    <Link
                      href={`/investigations/${inv.id}`}
                      className="btn btn-primary btn-sm"
                      style={{ fontSize: '11px', padding: '4px 10px' }}
                    >
                      Open Investigation
                      <ArrowRight size={12} />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div
              className="card"
              style={{
                padding: 'var(--space-10) var(--space-6)',
                textAlign: 'center',
                backgroundColor: 'var(--bg-surface)',
                border: '1px dashed var(--border-default)',
              }}
            >
              <FolderOpen
                size={36}
                style={{ color: 'var(--text-dim)', margin: '0 auto var(--space-3)' }}
              />
              <h3
                style={{
                  fontSize: 'var(--text-base)',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  marginBottom: 'var(--space-1)',
                }}
              >
                No active investigation in session
              </h3>
              <p
                style={{
                  fontSize: 'var(--text-sm)',
                  color: 'var(--text-muted)',
                  maxWidth: '460px',
                  margin: '0 auto var(--space-4)',
                }}
              >
                Upload your model evaluation CSV to start an autonomous investigation, or select one of the preloaded golden benchmarks above.
              </p>
              <Link href="/investigate" className="btn btn-primary btn-sm">
                <Activity size={14} />
                Launch Studio
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
