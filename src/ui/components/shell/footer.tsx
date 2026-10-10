import Link from 'next/link';

export default function Footer() {
  return (
    <footer
      style={{
        borderTop: '1px solid var(--border-subtle)',
        backgroundColor: 'var(--bg-surface-subtle)',
        padding: 'var(--space-6) 0',
        marginTop: 'auto',
      }}
      role="contentinfo"
    >
      <div
        className="container-wide"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 'var(--space-4)',
          fontSize: 'var(--text-xs)',
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>WhyLab 2.0</span>
          <span>·</span>
          <span>Deterministic ML Reliability & Incident Investigation</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          <span className="badge badge-accent">100% Deterministic Math</span>
          <span className="badge badge-info">Astra Tool Orchestration</span>
          <Link href="/learn" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>
            Docs & Theory
          </Link>
          <Link href="/settings" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>
            Diagnostics
          </Link>
        </div>
      </div>
    </footer>
  );
}
