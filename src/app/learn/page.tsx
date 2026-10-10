import Link from 'next/link';
import Breadcrumbs from '@/ui/components/shell/breadcrumbs';
import { ArrowRight, BookOpen } from 'lucide-react';

const lessons = [
  {
    id: 'accuracy-paradox',
    title: 'The Accuracy Paradox',
    subtitle: 'Why 99% accuracy can conceal a catastrophic failure',
    level1: 'A model can report high accuracy by simply predicting the majority class all the time, completely missing the rare event you care about.',
    level2: 'When fraud occurs in 1% of transactions, a naive dummy model that approves every transaction gets 99% accuracy. In production, this model prevents zero fraud and loses millions of dollars.',
    formula: 'Accuracy = (TP + TN) / (P + N) vs Balanced Accuracy = (Recall_pos + Recall_neg) / 2',
    countermeasure: 'Evaluate Balanced Accuracy, Precision-Recall AUC, and minority recall instead of raw accuracy.',
  },
  {
    id: 'calibration-drift',
    title: 'Probability Miscalibration',
    subtitle: 'When confidence scores do not reflect actual empirical likelihoods',
    level1: 'When a model says it is 95% confident, does it actually get the answer right 95% of the time? Often it does not.',
    level2: 'Deep neural networks with cross-entropy loss tend to become overconfident after training, outputting probabilities near 0.99 for borderline predictions. In safety-critical decisions, overconfidence triggers automated actions when human review is needed.',
    formula: 'Expected Calibration Error (ECE) = sum_m (|acc(B_m) - conf(B_m)| * |B_m| / N); Brier Score = (1/N) * sum((p_i - y_i)^2)',
    countermeasure: 'Inspect reliability diagrams and calibration bins; apply Platt scaling or isotonic regression on a held-out set.',
  },
  {
    id: 'cost-sensitive-thresholds',
    title: 'Cost-Sensitive Thresholds',
    subtitle: 'Why default 0.50 decision thresholds fail in production',
    level1: 'The standard 0.50 cutoff treats missing a disease and sending an unnecessary test as equally costly. In reality, one error is far worse than the other.',
    level2: 'If missing cancer (False Negative) is 50x worse than a biopsy recommendation (False Positive), your operating threshold must shift from 0.50 down to ~0.15 to maximize patient safety and minimize total expected clinical cost.',
    formula: 'Expected Cost = (C_FN * FN) + (C_FP * FP) + (C_TP * TP) + (C_TN * TN)',
    countermeasure: 'Use WhyLab 101-point threshold sweeper with explicit cost ratios to find the cost-optimal operating point.',
  },
  {
    id: 'target-leakage',
    title: 'Target Leakage & Temporal Contamination',
    subtitle: 'Why lab metrics look superhuman but fail upon deployment',
    level1: 'Target leakage occurs when your training features accidentally include clues from the future that will not be available when the model actually makes predictions.',
    level2: 'Examples include patient discharge codes used to predict hospital readmission, or post-transaction fraud flags recorded after an alert. In the lab, accuracy reaches 99.8%; in production, performance collapses immediately.',
    formula: 'Mutual Information I(X; Y) -> 1.0 or Correlation r(X, Y) near 1.0 with feature timestamps >= prediction timestamp.',
    countermeasure: 'Audit feature timestamps against prediction points and run automated feature-target correlation scans.',
  },
];

export default function LearnPage() {
  return (
    <div style={{ paddingBottom: 'var(--space-16)' }}>
      <Breadcrumbs items={[{ label: 'learn' }]} />

      <div className="container" style={{ paddingTop: 'var(--space-8)' }}>
        {/* Knowledge Center Header */}
        <div style={{ maxWidth: '780px', marginBottom: 'var(--space-10)' }}>
          <div className="badge badge-accent" style={{ marginBottom: 'var(--space-2)' }}>
            <BookOpen size={12} />
            ML Reliability Knowledge Center
          </div>
          <h1
            style={{
              fontSize: 'var(--text-3xl)',
              fontWeight: 700,
              color: 'var(--text-primary)',
              letterSpacing: '-0.02em',
              marginBottom: 'var(--space-3)',
            }}
          >
            Why Machine Learning Models Fail in Production
          </h1>
          <p style={{ fontSize: 'var(--text-base)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            A technical guide explaining failure mechanisms, statistical contradictions, and empirical remediation
            using WhyLab&apos;s 3-level progressive disclosure system.
          </p>
        </div>

        {/* Lesson Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          {lessons.map((lesson) => (
            <div key={lesson.id} className="card card-elevated" style={{ overflow: 'hidden' }}>
              <div
                className="card-header"
                style={{ backgroundColor: 'var(--bg-surface-subtle)', flexWrap: 'wrap', gap: 'var(--space-2)' }}
              >
                <div>
                  <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {lesson.title}
                  </h2>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                    {lesson.subtitle}
                  </div>
                </div>
                <span className="badge badge-info">Level 1 → 2 → 3 Explanation</span>
              </div>

              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                {/* Level 1: Plain Language */}
                <div
                  style={{
                    padding: 'var(--space-4)',
                    backgroundColor: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
                    <span className="badge badge-accent">LEVEL 1: PLAIN LANGUAGE</span>
                    <strong style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                      What is happening?
                    </strong>
                  </div>
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', lineHeight: 1.6 }}>
                    {lesson.level1}
                  </p>
                </div>

                {/* Level 2: Why It Matters Here */}
                <div
                  style={{
                    padding: 'var(--space-4)',
                    backgroundColor: 'var(--bg-surface-subtle)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
                    <span className="badge badge-warning">LEVEL 2: WHY IT MATTERS</span>
                    <strong style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                      Real-world failure context
                    </strong>
                  </div>
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    {lesson.level2}
                  </p>
                </div>

                {/* Level 3: Technical Details & Formulas */}
                <div
                  style={{
                    padding: 'var(--space-4)',
                    backgroundColor: 'var(--bg-code)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                    <span className="badge badge-info">LEVEL 3: TECHNICAL SPECIFICATION</span>
                    <strong style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                      Mathematical formulation
                    </strong>
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-primary)', marginBottom: 'var(--space-2)' }}>
                    <code>{lesson.formula}</code>
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--status-success)' }}>
                    Remediation: {lesson.countermeasure}
                  </div>
                </div>
              </div>

              <div
                className="card-footer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  Ready to test this failure mode?
                </span>
                <Link href="/workspace" className="btn btn-secondary btn-sm">
                  Inspect in Workspace
                  <ArrowRight size={13} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
