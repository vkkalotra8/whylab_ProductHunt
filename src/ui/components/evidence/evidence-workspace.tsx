'use client';

import { useState } from 'react';
import type { Investigation, Evidence } from '@/core/domain/types';
import EvidenceGraph from './evidence-graph';
import ProgressiveDisclosureCard from './progressive-disclosure';
import ProvenanceDrawer from './provenance-drawer';
import {
  Database,
  Eye,
  GitBranch,
  Table as TableIcon,
} from 'lucide-react';

export interface EvidenceWorkspaceProps {
  investigation: Investigation;
}

type WorkspaceView = 'graph' | 'cards' | 'table';

export default function EvidenceWorkspace({ investigation }: EvidenceWorkspaceProps) {
  const [activeView, setActiveView] = useState<WorkspaceView>('graph');
  const [selectedEvidence, setSelectedEvidence] = useState<Evidence | null>(null);

  // Extract measurements from all evidence nodes
  const allMeasurements = investigation.evidence.flatMap((e) => e.measurements);
  const getMeasurement = (name: string) => allMeasurements.find((m) => m.name === name);

  const acc = getMeasurement('accuracy');
  const recall = getMeasurement('recall') ?? getMeasurement('minority_recall');
  const bacc = getMeasurement('balanced_accuracy');
  const prec = getMeasurement('precision');

  // Confusion matrix from baseline metrics tool result if available
  const baselineResult = investigation.toolResults.find(
    (r) => r.tool === 'compute_classification_metrics' && r.status === 'completed'
  );
  const confusion =
    baselineResult && 'confusion' in (baselineResult.output as Record<string, unknown>)
      ? (baselineResult.output as { confusion: { truePositive: number; falsePositive: number; trueNegative: number; falseNegative: number } }).confusion
      : undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Evidence Command Header */}
      <div className="card" style={{ padding: 'var(--space-5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
              <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--text-primary)' }}>
                Evidence Graph & Progressive Disclosure
              </h2>
              <span className="badge badge-accent">Phase 5 UX</span>
            </div>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              Interactive provenance visualizer with 3-level progressive disclosure (L1 Summary, L2 Significance, L3 Formula).
            </p>
          </div>

          {/* View Mode Switcher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <button
              onClick={() => setActiveView('graph')}
              className={`btn btn-sm ${activeView === 'graph' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              <GitBranch size={13} />
              Interactive DAG
            </button>
            <button
              onClick={() => setActiveView('cards')}
              className={`btn btn-sm ${activeView === 'cards' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              <Eye size={13} />
              Progressive Metrics (L1-L3)
            </button>
            <button
              onClick={() => setActiveView('table')}
              className={`btn btn-sm ${activeView === 'table' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              <TableIcon size={13} />
              Audit Log ({investigation.toolResults.length})
            </button>
          </div>
        </div>
      </div>

      {/* Main View Area */}
      {activeView === 'graph' && (
        <EvidenceGraph
          investigation={investigation}
          onSelectEvidence={(ev) => setSelectedEvidence(ev)}
        />
      )}

      {activeView === 'cards' && (() => {
        const isMelanoma = investigation.datasets[0]?.name?.toLowerCase().includes('melanoma');
        const posLabel = investigation.datasets[0]?.positiveLabel ?? 'Positive';
        const totalSamples = confusion
          ? confusion.truePositive + confusion.falsePositive + confusion.trueNegative + confusion.falseNegative
          : (investigation.datasets[0]?.rowCount ?? 0);
        const negSamples = confusion ? confusion.trueNegative + confusion.falsePositive : 0;
        const negRatio = totalSamples > 0 && confusion ? (negSamples / totalSamples) * 100 : null;
        const negRatioStr = negRatio !== null ? `${negRatio.toFixed(1)}%` : 'the majority';

        const specRatio = confusion && (confusion.trueNegative + confusion.falsePositive) > 0
          ? `${((confusion.trueNegative / (confusion.trueNegative + confusion.falsePositive)) * 100).toFixed(1)}%`
          : 'N/A';
        const sensRatio = recall && recall.status === 'measured'
          ? `${(recall.value * 100).toFixed(1)}%`
          : 'N/A';

        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--space-4)' }}>
            {/* Accuracy Card */}
            <ProgressiveDisclosureCard
              name="Raw Overall Accuracy"
              value={acc && acc.status === 'measured' ? `${(acc.value * 100).toFixed(1)}%` : 'N/A'}
              badge="AGGREGATE METRIC"
              status={acc && acc.status === 'measured' && recall && recall.status === 'measured' && acc.value - recall.value > 0.3 ? 'warning' : 'neutral'}
              level1="Aggregate accuracy across all evaluation rows."
              level2={`Because ${negRatioStr} of evaluation samples are negative, a naive model that always predicts negative achieves ${negRatioStr} accuracy while detecting zero true positive events.`}
              level3={{
                formula: 'Accuracy = (TP + TN) / (TP + FP + TN + FN)',
                calculation: confusion
                  ? `(${confusion.truePositive} + ${confusion.trueNegative}) / ${totalSamples}`
                  : undefined,
                sampleSize: acc && acc.status === 'measured' ? acc.sampleSize : undefined,
                confusion,
                limitations: ['Misleading in severe class imbalance (>90% negative).'],
              }}
              onInspectProvenance={() => {
                if (investigation.evidence[0]) setSelectedEvidence(investigation.evidence[0]);
              }}
            />

            {/* Minority Recall Card */}
            <ProgressiveDisclosureCard
              name={isMelanoma ? 'Malignant Minority Recall (Sensitivity)' : `${posLabel} Class Recall (Sensitivity)`}
              value={recall && recall.status === 'measured' ? `${(recall.value * 100).toFixed(1)}%` : 'N/A'}
              badge={recall && recall.status === 'measured' && recall.value < 0.5 ? 'CRITICAL FAILURE' : 'TARGET METRIC'}
              status={recall && recall.status === 'measured' && recall.value < 0.5 ? 'critical' : 'good'}
              level1={isMelanoma
                ? 'Severe false-negative rate: Only a small fraction of true malignant cases is detected under default threshold.'
                : `Minority sensitivity: Proportion of actual ${posLabel} cases correctly classified.`}
              level2={isMelanoma
                ? 'Clinical hazard: actual malignant cases receive a false-negative classification, potentially delaying life-saving biopsy or treatment.'
                : `Operational risk: false-negative errors in the ${posLabel} class can lead to missed detections and unmitigated incidents.`}
              level3={{
                formula: 'Recall = TP / (TP + FN)',
                calculation: confusion && (confusion.truePositive + confusion.falseNegative) > 0
                  ? `${confusion.truePositive} / (${confusion.truePositive} + ${confusion.falseNegative}) = ${(confusion.truePositive / (confusion.truePositive + confusion.falseNegative)).toFixed(4)}`
                  : undefined,
                sampleSize: recall && recall.status === 'measured' ? recall.sampleSize : undefined,
                confusion,
                limitations: ['Evaluated at default 0.50 decision threshold.'],
              }}
              onInspectProvenance={() => {
                if (investigation.evidence[0]) setSelectedEvidence(investigation.evidence[0]);
              }}
            />

            {/* Balanced Accuracy Card */}
            <ProgressiveDisclosureCard
              name="Balanced Accuracy"
              value={bacc && bacc.status === 'measured' ? `${(bacc.value * 100).toFixed(1)}%` : 'N/A'}
              badge="PARADOX EXPOSED"
              status={bacc && bacc.status === 'measured' && bacc.value < 0.65 ? 'critical' : 'warning'}
              level1="Arithmetic mean of recall across all classes reveals true performance unbiased by class imbalance."
              level2="Balanced accuracy weights classes equally (50/50), preventing the dominant majority class from artificially inflating the reported score."
              level3={{
                formula: 'Balanced Accuracy = (Sensitivity + Specificity) / 2',
                calculation: `Average of sensitivity (${sensRatio}) and specificity (${specRatio})`,
                sampleSize: bacc && bacc.status === 'measured' ? bacc.sampleSize : undefined,
                confusion,
                limitations: ['Assumes equal domain importance between positive and negative classes.'],
              }}
              onInspectProvenance={() => {
                if (investigation.evidence[0]) setSelectedEvidence(investigation.evidence[0]);
              }}
            />

            {/* Precision Card */}
            <ProgressiveDisclosureCard
              name="Positive Predictive Value (Precision)"
              value={prec && prec.status === 'measured' ? `${(prec.value * 100).toFixed(1)}%` : 'N/A'}
              badge="OPERATING TRADE-OFF"
              status="warning"
              level1={isMelanoma
                ? 'Proportion of predicted positive cases that are truly malignant.'
                : `Proportion of predicted positive cases that are truly ${posLabel}.`}
              level2="When precision is moderate and recall is low, the model is overly conservative, only predicting positive when extreme certainty exists."
              level3={{
                formula: 'Precision = TP / (TP + FP)',
                calculation: confusion && (confusion.truePositive + confusion.falsePositive) > 0
                  ? `${confusion.truePositive} / (${confusion.truePositive} + ${confusion.falsePositive}) = ${(confusion.truePositive / (confusion.truePositive + confusion.falsePositive)).toFixed(4)}`
                  : undefined,
                sampleSize: prec && prec.status === 'measured' ? prec.sampleSize : undefined,
                confusion,
              }}
              onInspectProvenance={() => {
                if (investigation.evidence[0]) setSelectedEvidence(investigation.evidence[0]);
              }}
            />
          </div>
        );
      })()}

      {activeView === 'table' && (
        <div className="card card-elevated">
          <div className="card-header">
            <div className="card-title">
              <Database size={15} />
              Diagnostic Tool Results & Provenance Log ({investigation.toolResults.length})
            </div>
            <span className="badge badge-info">Deterministic TypeScript Execution</span>
          </div>
          <div className="card-body">
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Tool</th>
                    <th>Version</th>
                    <th>Result ID</th>
                    <th>Call ID</th>
                    <th>Completed At</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
                  {investigation.toolResults.map((res) => (
                    <tr key={res.id}>
                      <td>
                        <code style={{ color: 'var(--primary)' }}>{res.tool}</code>
                      </td>
                      <td>v{res.toolVersion}</td>
                      <td style={{ color: 'var(--text-dim)' }}>{res.id}</td>
                      <td style={{ color: 'var(--text-dim)' }}>{res.callId}</td>
                      <td>{new Date(res.completedAt).toLocaleTimeString()}</td>
                      <td>
                        <span className="badge badge-success" style={{ textTransform: 'uppercase' }}>
                          {res.status}
                        </span>
                      </td>
                      <td>
                        <button
                          onClick={() => {
                            const matchingEv = investigation.evidence.find(
                              (e) =>
                                e.provenance.kind === 'tool_result' &&
                                (e.provenance as { resultId: string }).resultId === res.id
                            );
                            if (matchingEv) setSelectedEvidence(matchingEv);
                          }}
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '10px', padding: '2px 6px' }}
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Slide-Over Provenance Inspector Drawer */}
      <ProvenanceDrawer
        evidence={selectedEvidence}
        investigation={investigation}
        onClose={() => setSelectedEvidence(null)}
      />
    </div>
  );
}
