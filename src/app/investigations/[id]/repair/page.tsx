import { getInvestigation, getInvestigationCsv, saveInvestigation } from '@/core/investigation/store';
import { runFlagshipMelanomaInvestigation } from '@/core/diagnostics/flagship-melanoma';
import { ingestEvaluationCsv } from '@/core/diagnostics/evaluation-ingestion';
import { runThresholdSweep } from '@/core/diagnostics/threshold-sweep';
import { createId } from '@/core/domain/primitives';
import type { DiagnosticToolCall, DiagnosticToolResult } from '@/core/domain/tool-contracts';
import RepairWorkbench from '@/ui/components/repair/repair-workbench';
import { AlertTriangle } from 'lucide-react';

export default async function InvestigationRepairPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let investigation = getInvestigation(id);

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
        <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600 }}>Investigation Not Found</h2>
      </div>
    );
  }

  // Ensure 101-point threshold sweep is dynamically computed from this investigation's exact dataset
  const hasSweepInResults = investigation.toolResults.some(
    (r) =>
      r.tool === 'threshold_sweep' &&
      r.status === 'completed' &&
      Array.isArray((r.output as { points?: unknown[] })?.points) &&
      ((r.output as { points: unknown[] }).points.length > 0)
  );

  let initialPoints = undefined;

  if (!hasSweepInResults) {
    const csvContent = getInvestigationCsv(investigation.id);
    const targetDataset = investigation.datasets[0];
    if (csvContent && targetDataset) {
      try {
        const positiveLabel = targetDataset.positiveLabel ?? '1';
        const negativeLabel = positiveLabel === '1' ? '0' : '0';
        const evalData = ingestEvaluationCsv(csvContent, targetDataset.name ?? 'dataset.csv', {
          datasetId: targetDataset.id,
          labels: { positive: positiveLabel, negative: negativeLabel },
          columnMapping: {
            targetColumn: targetDataset.targetColumn ?? undefined,
            predictionColumn: targetDataset.predictionColumn ?? undefined,
            probabilityColumn: targetDataset.probabilityColumn,
          },
        });

        if (evalData.metadata.probabilityColumn !== null) {
          const thresholds101 = Array.from({ length: 101 }, (_, i) => Math.round(i) / 100);
          const sweepReport = runThresholdSweep(evalData, {
            datasetId: evalData.metadata.id,
            positiveLabel: evalData.labels.positive,
            thresholds: thresholds101,
            costs: null,
          });

          initialPoints = sweepReport.output.points;

          const sweepCallId = createId('call');
          const sweepResId = createId('result');
          const now = new Date().toISOString();

          const sweepCall: DiagnosticToolCall = {
            id: sweepCallId,
            investigationId: investigation.id,
            tool: 'threshold_sweep',
            toolVersion: 1,
            requestedAt: now,
            input: {
              datasetId: evalData.metadata.id,
              positiveLabel: evalData.labels.positive,
              thresholds: thresholds101,
              costs: null,
            },
          };

          const sweepResult: DiagnosticToolResult = {
            id: sweepResId,
            callId: sweepCallId,
            tool: 'threshold_sweep',
            toolVersion: 1,
            completedAt: now,
            datasetIds: [evalData.metadata.id],
            evidenceIds: [],
            limitations: sweepReport.limitations,
            status: 'completed',
            output: sweepReport.output,
          };

          investigation = {
            ...investigation,
            toolCalls: [...investigation.toolCalls, sweepCall],
            toolResults: [...investigation.toolResults, sweepResult],
            updatedAt: now,
          };

          saveInvestigation(investigation);
        }
      } catch (err) {
        console.warn('Dynamic threshold sweep calculation from dataset CSV deferred:', err);
      }
    }
  }

  return <RepairWorkbench investigation={investigation} initialPoints={initialPoints} />;
}
