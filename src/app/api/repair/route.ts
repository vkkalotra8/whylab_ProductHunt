import { NextResponse } from 'next/server';
import { getFlagshipEvaluationData } from '@/core/diagnostics/flagship-melanoma';
import { ingestEvaluationCsv } from '@/core/diagnostics/evaluation-ingestion';
import { runThresholdSweep } from '@/core/diagnostics/threshold-sweep';
import { generateRepairCandidate } from '@/core/diagnostics/repair-candidates';
import { reEvaluateRepair } from '@/core/diagnostics/repair-reevaluation';
import { createId } from '@/core/domain/primitives';
import type { Evidence } from '@/core/domain/types';
import { apiRateLimiter, getClientIp } from '@/server/security/rate-limiter';
import { getInvestigation, getInvestigationCsv } from '@/core/investigation/store';

export async function POST(req: Request) {
  try {
    const clientIp = getClientIp(req);
    const rateCheck = apiRateLimiter.check(clientIp, { maxRequests: 60, windowMs: 60_000 });
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { status: 'error', message: 'Rate limit exceeded. Please slow down.' },
        { status: 429, headers: rateCheck.headers }
      );
    }

    const body = await req.json().catch(() => ({}));
    const fnCost = typeof body.falseNegativeCost === 'number' ? body.falseNegativeCost : 20;
    const fpCost = typeof body.falsePositiveCost === 'number' ? body.falsePositiveCost : 1;
    const targetRecall = typeof body.targetRecall === 'number' ? body.targetRecall : 0.8;

    // Load evaluation data dynamically
    let evalData = getFlagshipEvaluationData();

    if (body.investigationId) {
      const csv = getInvestigationCsv(body.investigationId);
      const inv = getInvestigation(body.investigationId);
      if (csv && inv && inv.datasets[0]) {
        evalData = ingestEvaluationCsv(csv, inv.datasets[0].name, {
          datasetId: inv.datasets[0].id,
          sourceId: inv.sources[0]?.id,
          labels: body.labels,
          columnMapping: {
            targetColumn: inv.datasets[0].targetColumn ?? undefined,
            predictionColumn: inv.datasets[0].predictionColumn ?? undefined,
            probabilityColumn: inv.datasets[0].probabilityColumn,
          },
        });
      }
    } else if (body.csvContent) {
      evalData = ingestEvaluationCsv(body.csvContent, body.fileName ?? 'custom-dataset.csv', {
        columnMapping: body.columnMapping,
        labels: body.labels,
      });
    }

    // Verify probability capability exists
    if (evalData.metadata.probabilityColumn === null) {
      return NextResponse.json(
        {
          status: 'error',
          message:
            'Threshold optimization requires continuous prediction probability scores. The current dataset only contains discrete prediction labels.',
        },
        { status: 400 }
      );
    }

    const positiveLabel =
      typeof body.positiveLabel === 'string'
        ? body.positiveLabel
        : evalData.labels.positive;

    const dsId = evalData.metadata.id;
    const srcId = evalData.source.id;

    // Create cost assumption evidence node
    const costAssumpId = createId('evidence');
    const costAssumption: Evidence = {
      id: costAssumpId,
      kind: 'assumption',
      description: `Domain cost policy: False Negative penalty = ${fnCost}x, False Positive penalty = ${fpCost}x.`,
      measurements: [],
      provenance: {
        kind: 'source',
        sourceId: srcId,
        datasetId: null,
        rows: null,
        columns: [],
      },
    };

    // 101-point threshold sweep
    const thresholds101 = Array.from({ length: 101 }, (_, i) => Math.round(i) / 100);
    const sweep = runThresholdSweep(
      evalData,
      {
        datasetId: dsId,
        positiveLabel,
        thresholds: thresholds101,
        costs: {
          falseNegativeCost: fnCost,
          falsePositiveCost: fpCost,
          assumptionEvidenceId: costAssumpId,
        },
      },
      [costAssumption]
    );

    // Generate repair candidate
    const repair = generateRepairCandidate(
      evalData,
      {
        datasetId: dsId,
        hypothesisId: createId('hypothesis'),
        positiveLabel,
        targetMetric: 'cost',
        targetValue: null,
        costs: {
          falseNegativeCost: fnCost,
          falsePositiveCost: fpCost,
          assumptionEvidenceId: costAssumpId,
        },
        criterion: {
          metric: 'recall',
          operator: 'at_least',
          value: targetRecall,
          unit: 'ratio',
        },
      },
      [costAssumption]
    );

    const selectedThreshold =
      typeof body.selectedThreshold === 'number'
        ? body.selectedThreshold
        : repair.output.selectedThreshold;

    // Re-evaluate against baseline 0.50
    const reevaluation = reEvaluateRepair(evalData, {
      datasetId: dsId,
      repairId: createId('repair'),
      positiveLabel,
      baselineThreshold: 0.5,
      repairedThreshold: selectedThreshold,
      criterion: {
        metric: 'recall',
        operator: 'at_least',
        value: targetRecall,
        unit: 'ratio',
      },
      baselineEvidenceIds: [],
    });

    return NextResponse.json(
      {
        status: 'ok',
        selectedThreshold,
        optimalThreshold: sweep.output.selectedThreshold,
        points: sweep.output.points,
        policy: repair.output.policy,
        rationale: repair.output.rationale,
        reevaluation: reevaluation.output,
      },
      { headers: rateCheck.headers }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to execute repair re-evaluation';
    return NextResponse.json({ status: 'error', message }, { status: 400 });
  }
}
