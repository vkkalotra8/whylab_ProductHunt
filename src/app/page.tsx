import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Cpu,
  FileSpreadsheet,
  ShieldAlert,
  Terminal,
} from 'lucide-react';

export default function HomePage() {
  return (
    <div style={{ paddingBottom: 'var(--space-16)' }}>
      {/* Hero Section */}
      <section style={{ padding: 'var(--space-12) 0 var(--space-8)' }}>
        <div className="container">
          <div style={{ textAlign: 'center', maxWidth: '820px', margin: '0 auto var(--space-8)' }}>
            <div
              className="badge badge-info"
              style={{ marginBottom: 'var(--space-4)', padding: '4px 10px' }}
            >
              <Cpu size={12} />
              AI Incident Investigator & Reliability Workbench
            </div>
            <h1
              style={{
                fontSize: 'clamp(2rem, 4vw, 3rem)',
                fontWeight: 800,
                letterSpacing: '-0.03em',
                lineHeight: 1.15,
                marginBottom: 'var(--space-4)',
                color: 'var(--text-primary)',
              }}
            >
              Find why your ML model fails in production, prove the cause, and repair it.
            </h1>
            <p
              style={{
                fontSize: 'var(--text-lg)',
                color: 'var(--text-secondary)',
                lineHeight: 1.6,
                maxWidth: '720px',
                margin: '0 auto var(--space-6)',
              }}
            >
              WhyLab moves machine learning beyond passive metrics. An autonomous investigation loop
              dispatches deterministic diagnostic tools, tests counterfactual hypotheses to falsify diagnoses,
              and verifies policy remediation on real evaluation data.
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-4)', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link href="/investigate" className="btn btn-primary btn-lg">
                <Activity size={16} />
                Start Investigation
                <ArrowRight size={16} />
              </Link>
              <Link href="/workspace" className="btn btn-secondary btn-lg">
                <FileSpreadsheet size={16} />
                Explore Preloaded Benchmarks
              </Link>
            </div>
          </div>

          {/* Flagship Tension Card */}
          <div
            className="card card-elevated"
            style={{
              maxWidth: '960px',
              margin: '0 auto',
              overflow: 'hidden',
              border: '1px solid var(--border-default)',
            }}
          >
            <div className="card-header" style={{ backgroundColor: 'var(--bg-surface-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <span className="badge badge-accent">FLAGSHIP BENCHMARK</span>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', fontWeight: 500 }}>
                  Dermatology Clinic Melanoma Classifier (n=20,000 cases)
                </span>
              </div>
              <span className="badge badge-danger">
                <AlertTriangle size={12} />
                CRITICAL ACCURACY PARADOX DETECTED
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              }}
            >
              {/* Left Column: What Offline Metrics Reported */}
              <div
                style={{
                  padding: 'var(--space-6)',
                  borderRight: '1px solid var(--border-subtle)',
                  backgroundColor: 'rgba(16, 185, 129, 0.02)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
                  <CheckCircle2 size={16} style={{ color: 'var(--status-success)' }} />
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--status-success)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    What The Model Reported
                  </span>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-4xl)', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 'var(--space-2)' }}>
                  94.2%
                </div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-4)' }}>
                  Overall Validation Accuracy
                </div>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  Offline test metrics look production-ready. Leadership approved rollout based on high aggregate accuracy.
                </p>
              </div>

              {/* Right Column: What WhyLab Discovered */}
              <div
                style={{
                  padding: 'var(--space-6)',
                  backgroundColor: 'rgba(239, 68, 68, 0.03)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
                  <ShieldAlert size={16} style={{ color: 'var(--status-danger)' }} />
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--status-danger)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    What WhyLab Measured
                  </span>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-4xl)', fontWeight: 800, color: 'var(--status-danger)', marginBottom: 'var(--space-2)' }}>
                  22.4%
                </div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-4)' }}>
                  Malignant Recall (Minority Class)
                </div>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  Prevalence is only 5.8%. The model is missing <strong>776 out of 1,000 malignant cases</strong> while boasting 94% accuracy.
                </p>
              </div>
            </div>

            <div
              className="card-footer"
              style={{
                backgroundColor: 'var(--bg-surface-elevated)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 'var(--space-3)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                <span className="badge badge-accent">REPAIR LAB RESULT</span>
                <span>Optimizing decision threshold (0.50 → 0.19) recovers recall to <strong>84.1%</strong> with measured costs.</span>
              </div>
              <Link href="/investigate" className="btn btn-primary btn-sm">
                Run Flagship Investigation
                <ArrowRight size={13} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Mental Model Section */}
      <section style={{ padding: 'var(--space-8) 0' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: 'var(--space-8)' }}>
            <h2 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
              A New Category for Production Machine Learning
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
              How engineering teams conceptualize system reliability:
            </p>
          </div>

          <div className="grid-cols-3">
            <div className="card" style={{ padding: 'var(--space-6)' }}>
              <div style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>
                SOFTWARE FAILURES
              </div>
              <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 'var(--space-2)' }}>
                Sentry
              </div>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Captures uncaught exceptions, stack traces, and deterministic code crashes.
              </p>
            </div>

            <div className="card" style={{ padding: 'var(--space-6)' }}>
              <div style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>
                INFRASTRUCTURE FAILURES
              </div>
              <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 'var(--space-2)' }}>
                Datadog
              </div>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Monitors CPU utilization, memory leaks, latencies, and service mesh health.
              </p>
            </div>

            <div className="card card-elevated" style={{ padding: 'var(--space-6)', borderColor: 'var(--primary-border)' }}>
              <div style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--primary)', marginBottom: 'var(--space-2)' }}>
                MACHINE-LEARNING FAILURES
              </div>
              <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 'var(--space-2)' }}>
                WhyLab
              </div>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Investigates accuracy contradictions, class imbalance, calibration drift, target leakage, and cost misalignments.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Six-Stage Investigation Workflow */}
      <section style={{ padding: 'var(--space-8) 0' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: 'var(--space-8)' }}>
            <span className="badge badge-accent" style={{ marginBottom: 'var(--space-2)' }}>
              EVIDENCE-FIRST WORKBENCH
            </span>
            <h2 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
              The 6-Stage Investigation Pipeline
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', maxWidth: '640px', margin: '0 auto' }}>
              WhyLab never collapses diagnostic complexity into an unverified paragraph. Every claim is rooted in deterministic measurements and falsification experiments.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 'var(--space-3)',
            }}
          >
            {[
              { num: '01', title: 'Ingest', desc: 'Validate evaluation CSV columns, types, and labels' },
              { num: '02', title: 'Profile', desc: 'Compute prevalence, missingness, and baseline metrics' },
              { num: '03', title: 'Investigate', desc: 'Astra dispatches deterministic diagnostic tools' },
              { num: '04', title: 'Verify', desc: 'Falsification experiments attempt to disprove root cause' },
              { num: '05', title: 'Repair', desc: '101-point threshold sweep optimizes operating policy' },
              { num: '06', title: 'Report', desc: 'Export executive ML reliability & incident report' },
            ].map((stage) => (
              <div
                key={stage.num}
                className="card"
                style={{ padding: 'var(--space-4)', backgroundColor: 'var(--bg-surface)' }}
              >
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--primary)', fontWeight: 700, marginBottom: 'var(--space-1)' }}>
                  STAGE {stage.num}
                </div>
                <div style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 'var(--space-1)' }}>
                  {stage.title}
                </div>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  {stage.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Primary Principle Callout */}
      <section style={{ padding: 'var(--space-8) 0' }}>
        <div className="container">
          <div
            className="card card-elevated"
            style={{
              padding: 'var(--space-6)',
              borderLeft: '4px solid var(--primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 'var(--space-4)',
            }}
          >
            <div style={{ maxWidth: '780px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                <Terminal size={16} style={{ color: 'var(--primary)' }} />
                <span style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--primary)' }}>
                  CORE ARCHITECTURAL INVARIANT
                </span>
              </div>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                &ldquo;WhyLab does not just guess why your model failed. AI decides what to investigate,
                deterministic tools measure what happened, experiments challenge the diagnosis, and repairs are re-tested
                against the exact evaluation data.&rdquo;
              </p>
            </div>
            <Link href="/learn" className="btn btn-secondary btn-sm">
              Read Methodology
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
