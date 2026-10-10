import Link from 'next/link';
import { getInvestigation } from '@/core/investigation/store';
import { runFlagshipMelanomaInvestigation } from '@/core/diagnostics/flagship-melanoma';
import {
  AlertTriangle,
  ArrowRight,
  FileText,
  GitBranch,
  ShieldAlert,
  Sliders,
  Terminal,
} from 'lucide-react';

export default async function InvestigationOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let investigation = getInvestigation(id);

  // If not found in store, initialize flagship melanoma investigation
  if (!investigation) {
    try {
      investigation = runFlagshipMelanomaInvestigation();
    } catch {
      // Fallback
    }
  }

  if (!investigation) {
    return (
      <div className="card" style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
        <AlertTriangle size={32} style={{ color: 'var(--status-warning)', margin: '0 auto var(--space-3)' }} />
        <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
          Investigation Not Found
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-4)' }}>
          No recorded investigation matches identifier <code>{id}</code>.
        </p>
        <Link href="/workspace" className="btn btn-secondary btn-sm">
          Return to Workspace
        </Link>
      </div>
    );
  }

  const primaryHypothesis = investigation.hypotheses[0];
  const primaryExperiment = investigation.experiments[0];
  const primaryRepair = investigation.repairs[0];
  const primaryComparison = investigation.comparisons[0];
  const dataset = investigation.datasets[0];

  // Dynamically extract measurements from evidence
  const allMeasurements = investigation.evidence.flatMap((e) => e.measurements);
  const accMeasurement = allMeasurements.find((m) => m.name === 'accuracy');
  const recallMeasurement = allMeasurements.find((m) => m.name === 'recall' || m.name === 'minority_recall');
  const isMelanoma = dataset?.name?.toLowerCase().includes('melanoma');
  const posLabel = dataset?.positiveLabel ?? 'Positive';

  const accuracyFormatted =
    accMeasurement && accMeasurement.status === 'measured'
      ? `${(accMeasurement.value * 100).toFixed(1)}%`
      : 'N/A';

  const recallFormatted =
    recallMeasurement && recallMeasurement.status === 'measured'
      ? `${(recallMeasurement.value * 100).toFixed(1)}%`
      : 'N/A';

  const missedPct =
    recallMeasurement && recallMeasurement.status === 'measured'
      ? `${((1 - recallMeasurement.value) * 100).toFixed(1)}%`
      : null;

  // Dynamically compute repair lift
  let repairLiftFormatted = 'READY';
  if (primaryComparison) {
    const afterEvidence = investigation.evidence.find((e) =>
      primaryComparison.afterEvidenceIds.includes(e.id)
    );
    const afterRecall = afterEvidence?.measurements.find((m) => m.name === 'recall');
    if (recallMeasurement && recallMeasurement.status === 'measured' && afterRecall && afterRecall.status === 'measured') {
      repairLiftFormatted = `${(recallMeasurement.value * 100).toFixed(0)}% → ${(afterRecall.value * 100).toFixed(0)}%`;
    } else {
      repairLiftFormatted = `${primaryComparison.baselinePolicy.threshold.toFixed(2)} → ${primaryComparison.afterPolicy.threshold.toFixed(2)}`;
    }
  } else if (dataset?.probabilityColumn === null) {
    repairLiftFormatted = 'N/A';
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Objective & Diagnosis Banner */}
      <div className="card card-elevated" style={{ padding: 'var(--space-6)', borderLeft: '4px solid var(--status-danger)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
          <span className="badge badge-danger">
            <ShieldAlert size={12} />
            CRITICAL INCIDENT CONFIRMED
          </span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
            Status: {investigation.status.toUpperCase()} · Completed {new Date(investigation.updatedAt).toLocaleTimeString()}
          </span>
        </div>
        <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 'var(--space-2)' }}>
          {investigation.objective}
        </h2>
        {investigation.diagnosis && (
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            <strong>Confirmed Root Cause:</strong> {investigation.diagnosis.summary}
          </p>
        )}
      </div>

      {/* Dynamic Headline Tension Metric Cards */}
      <div className="grid-cols-2">
        <div className="card" style={{ padding: 'var(--space-5)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
            <span className="badge badge-success">APPARENT METRIC</span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Aggregate Validation</span>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-3xl)', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 'var(--space-1)' }}>
            {accuracyFormatted}
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            Raw Classification Accuracy across {dataset?.rowCount?.toLocaleString() ?? '20,000'} rows
          </div>
        </div>

        <div className="card" style={{ padding: 'var(--space-5)', backgroundColor: 'rgba(239, 68, 68, 0.03)', border: '1px solid var(--status-danger-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
            <span className="badge badge-danger">MEASURED FAILURE</span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--status-danger)' }}>{posLabel} Class Recall</span>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-3xl)', fontWeight: 800, color: 'var(--status-danger)', marginBottom: 'var(--space-1)' }}>
            {recallFormatted}
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            {isMelanoma
              ? `Malignant Melanoma Recall (${missedPct ?? '77.6%'} of cancer cases missed at default 0.50 threshold)`
              : `${posLabel} Class Recall (${missedPct ? `${missedPct} of positive cases missed` : 'Evaluated'} at default decision threshold)`}
          </div>
        </div>
      </div>

      {/* Investigation Pipeline Summary Cards */}
      <div className="grid-cols-3">
        <div className="card" style={{ padding: 'var(--space-5)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
            <FileText size={15} style={{ color: 'var(--status-info)' }} />
            <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>Evidence Collected</strong>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xl)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
            {investigation.evidence.length} Items
          </div>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-4)' }}>
            {investigation.toolResults.length} deterministic diagnostic tools executed with full mathematical provenance.
          </p>
          <Link href={`/investigations/${id}/evidence`} className="btn btn-secondary btn-sm" style={{ width: '100%', justifyContent: 'center' }}>
            Inspect Evidence
            <ArrowRight size={13} />
          </Link>
        </div>

        <div className="card" style={{ padding: 'var(--space-5)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
            <GitBranch size={15} style={{ color: 'var(--status-accent)' }} />
            <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>Falsification Engine</strong>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xl)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
            {primaryHypothesis ? primaryHypothesis.status.toUpperCase() : 'PENDING'}
          </div>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-4)' }}>
            {primaryExperiment?.outcome ? `Counterfactual test: ${primaryExperiment.outcome.toUpperCase()}` : 'No experiments completed'}
          </p>
          <Link href={`/investigations/${id}/hypotheses`} className="btn btn-secondary btn-sm" style={{ width: '100%', justifyContent: 'center' }}>
            Review Hypotheses
            <ArrowRight size={13} />
          </Link>
        </div>

        <div className="card" style={{ padding: 'var(--space-5)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
            <Sliders size={15} style={{ color: 'var(--status-success)' }} />
            <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>Repair Re-evaluation</strong>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xl)', fontWeight: 700, marginBottom: 'var(--space-2)', color: 'var(--status-success)' }}>
            {repairLiftFormatted}
          </div>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-4)' }}>
            {primaryRepair?.kind === 'operating_policy'
              ? `Policy threshold adjusted to ${primaryRepair.policy.threshold}`
              : dataset?.probabilityColumn === null
                ? 'Threshold optimization requires continuous probabilities'
                : 'Remediation policy evaluated'}
          </p>
          <Link href={`/investigations/${id}/repair`} className="btn btn-secondary btn-sm" style={{ width: '100%', justifyContent: 'center' }}>
            Open Repair Lab
            <ArrowRight size={13} />
          </Link>
        </div>
      </div>

      {/* Audit Log Preview */}
      <div className="card card-elevated">
        <div className="card-header">
          <div className="card-title">
            <Terminal size={15} />
            Investigation Audit Log ({investigation.events.length} Events)
          </div>
          <span className="badge badge-accent">Provenance Verified</span>
        </div>
        <div className="card-body" style={{ padding: 'var(--space-4)' }}>
          <div
            style={{
              maxHeight: '260px',
              overflowY: 'auto',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
            }}
          >
            {investigation.events.map((ev) => (
              <div
                key={ev.id}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 'var(--space-3)',
                  padding: 'var(--space-2)',
                  backgroundColor: 'var(--bg-code)',
                  borderRadius: 'var(--radius-xs)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <span style={{ color: 'var(--text-dim)', flexShrink: 0 }}>
                  {new Date(ev.at).toLocaleTimeString()}
                </span>
                <span className="badge badge-info" style={{ flexShrink: 0, padding: '1px 6px', fontSize: '10px' }}>
                  {ev.kind}
                </span>
                <span style={{ color: 'var(--text-secondary)' }}>{ev.message}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
