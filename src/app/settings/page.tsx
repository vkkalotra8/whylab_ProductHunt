import Breadcrumbs from '@/ui/components/shell/breadcrumbs';
import AppearanceCard from '@/ui/components/settings/appearance-card';
import {
  Cpu,
  Key,
  Server,
  Settings as SettingsIcon,
  Shield,
} from 'lucide-react';

export default function SettingsPage() {
  return (
    <div style={{ paddingBottom: 'var(--space-16)' }}>
      <Breadcrumbs items={[{ label: 'settings' }]} />

      <div className="container" style={{ paddingTop: 'var(--space-8)' }}>
        <div style={{ maxWidth: '780px', marginBottom: 'var(--space-8)' }}>
          <div className="badge badge-accent" style={{ marginBottom: 'var(--space-2)' }}>
            <SettingsIcon size={12} />
            System Configuration
          </div>
          <h1
            style={{
              fontSize: 'var(--text-3xl)',
              fontWeight: 700,
              color: 'var(--text-primary)',
              letterSpacing: '-0.02em',
              marginBottom: 'var(--space-2)',
            }}
          >
            Diagnostics & Environment Controls
          </h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            Configure visual themes, server environment keys, active diagnostic providers, and execution parameters.
          </p>
        </div>

        {/* Appearance & Theme Selector */}
        <AppearanceCard />

        {/* Engine Status Grid */}
        <div className="grid-cols-2" style={{ marginBottom: 'var(--space-8)' }}>
          <div className="card" style={{ padding: 'var(--space-5)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
              <Cpu size={16} style={{ color: 'var(--status-success)' }} />
              <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
                Deterministic Mathematical Engine
              </strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
              <span className="badge badge-success">ACTIVE & VERIFIED</span>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>100% In-Process TypeScript</span>
            </div>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              All classification metrics, confusion matrices, 101-point threshold sweeps, Wilson score confidence intervals, and KS drift tests run deterministically without cloud API dependencies.
            </p>
          </div>

          <div className="card" style={{ padding: 'var(--space-5)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
              <Server size={16} style={{ color: 'var(--status-info)' }} />
              <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
                Astra Agentic Orchestrator
              </strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
              <span className="badge badge-info">MULTI-PROVIDER READY</span>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Gemini & OpenAI & Offline</span>
            </div>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Governs tool dispatch, hypothesis ranking, and falsification experiments. Supports Google Gemini (Free / Pay-as-you-go) and OpenAI with automatic deterministic offline fallback when credentials are not configured.
            </p>
          </div>
        </div>

        {/* Environment Variable Specification */}
        <div className="card card-elevated" style={{ marginBottom: 'var(--space-8)' }}>
          <div className="card-header">
            <div className="card-title">
              <Key size={16} />
              Server Environment Variables
            </div>
            <span className="badge badge-accent">.env.local</span>
          </div>

          <div className="card-body">
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-4)' }}>
              WhyLab isolates all secrets server-side. Never prefix credentials with <code>NEXT_PUBLIC_</code>.
            </p>

            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Variable</th>
                    <th>Required</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
                  <tr>
                    <td>WHYLAB_AI_ENABLED</td>
                    <td>Optional</td>
                    <td>Set to <code>true</code> to enable autonomous cloud AI orchestration.</td>
                  </tr>
                  <tr>
                    <td>WHYLAB_AI_PROVIDER</td>
                    <td>Optional</td>
                    <td>Active AI provider: <code>gemini</code>, <code>openai</code>, or <code>offline</code>. Defaults to <code>gemini</code> when key present.</td>
                  </tr>
                  <tr>
                    <td>GEMINI_API_KEY</td>
                    <td>Conditional</td>
                    <td>API key for Google Gemini (Google AI Studio Free tier). Kept strictly server-side.</td>
                  </tr>
                  <tr>
                    <td>GEMINI_MODEL</td>
                    <td>Optional</td>
                    <td>Target Gemini model identifier (default: <code>gemini-3.8-flash</code>).</td>
                  </tr>
                  <tr>
                    <td>OPENAI_API_KEY</td>
                    <td>Conditional</td>
                    <td>API key for OpenAI Responses provider (kept strictly server-side).</td>
                  </tr>
                  <tr>
                    <td>OPENAI_MODEL</td>
                    <td>Optional</td>
                    <td>Target OpenAI model supporting function calling (e.g., <code>gpt-4o</code>).</td>
                  </tr>
                  <tr>
                    <td>WHYLAB_ACCESS_TOKEN</td>
                    <td>Optional</td>
                    <td>Deployment secret required for authorized paid endpoints.</td>
                  </tr>
                  <tr>
                    <td>WHYLAB_SESSION_REST_URL</td>
                    <td>Optional</td>
                    <td>Upstash / Redis REST endpoint for durable 24h multi-instance session caching.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Security & Provenance Invariants */}
        <div className="card" style={{ padding: 'var(--space-5)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
            <Shield size={16} style={{ color: 'var(--status-success)' }} />
            <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
              Data & Provenance Protection Guarantee
            </strong>
          </div>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Raw evaluation dataset rows are never transmitted to LLM prompt channels. Only aggregate metadata and measured diagnostic tool outputs are processed by the orchestrator. All statistical claims carry cryptographic or UUID provenance references to the executing tool result.
          </p>
        </div>
      </div>
    </div>
  );
}
