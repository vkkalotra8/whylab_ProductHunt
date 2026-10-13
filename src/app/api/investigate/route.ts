import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { ingestEvaluationCsv, type ColumnMapping } from '@/core/diagnostics/evaluation-ingestion';
import { runAutonomousInvestigation } from '@/server/orchestrator/investigator';
import { resolveInvestigatorProvider } from '@/server/orchestrator/provider-factory';
import { ProviderConfigurationError } from '@/server/orchestrator/ai-config';
import { createId } from '@/core/domain/primitives';
import { apiRateLimiter, getClientIp } from '@/server/security/rate-limiter';
import { sanitizeFileName, sanitizeInputText } from '@/server/security/sanitizer';
import { saveInvestigationCsv, saveInvestigationArtifacts } from '@/core/investigation/store';
import type { InvestigationArtifact } from '@/core/domain/artifacts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  return Response.json({
    status: 'ready',
    service: 'WhyLab Astra Autonomous Investigation Streamer',
    protocol: 'application/x-ndjson',
    supportedFixtures: [
      'melanoma-synthetic.csv',
      'kaggle_icu_sepsis_benchmark.csv',
      'kaggle_stroke_dataset.csv',
      'overconfident-classifier.csv',
      'site-failure.csv',
    ],
  });
}

export async function POST(req: NextRequest) {
  try {
    const clientIp = getClientIp(req);
    const rateCheck = apiRateLimiter.check(clientIp, { maxRequests: 30, windowMs: 60_000 });
    if (!rateCheck.allowed) {
      return Response.json(
        { error: 'Rate limit exceeded. Please retry after a brief moment.' },
        { status: 429, headers: rateCheck.headers }
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      fixtureName?: string;
      csvContent?: string;
      columnMapping?: ColumnMapping;
      labels?: { positive: string; negative: string };
      directives?: string[];
      objective?: string;
      offlineOnly?: boolean;
      artifacts?: InvestigationArtifact[];
    };

    let csvData = body.csvContent;
    let fileName = sanitizeFileName(
      body.fixtureName ?? (body.csvContent ? 'custom-dataset.csv' : 'melanoma-synthetic.csv')
    );

    // If artifacts provided and no explicit csvContent, find primary tabular artifact
    if (!csvData && body.artifacts && body.artifacts.length > 0) {
      const primaryArt =
        body.artifacts.find((a) => a.role === 'evaluation' || a.role === 'predictions') ??
        body.artifacts.find((a) => a.schema && a.schema.columns.length > 0);
      if (primaryArt && primaryArt.rawContent) {
        csvData = primaryArt.rawContent;
        fileName = sanitizeFileName(primaryArt.name);
      }
    }

    if (!csvData) {
      const fixturePath = join(process.cwd(), 'public', 'fixtures', fileName);
      try {
        csvData = readFileSync(fixturePath, 'utf8');
      } catch {
        // Fallback to melanoma-synthetic if requested fixture isn't directly on disk
        csvData = readFileSync(
          join(process.cwd(), 'public', 'fixtures', 'melanoma-synthetic.csv'),
          'utf8'
        );
        fileName = 'melanoma-synthetic.csv';
      }
    }

    const dsId = createId('dataset');
    const srcId = createId('source');
    const dataset = ingestEvaluationCsv(csvData, fileName, {
      datasetId: dsId,
      sourceId: srcId,
      columnMapping: body.columnMapping,
      labels: body.labels,
    });

    let provider;
    try {
      provider = resolveInvestigatorProvider({ offlineOnly: body.offlineOnly });
    } catch (configErr) {
      if (configErr instanceof ProviderConfigurationError) {
        return Response.json(
          { error: configErr.message, code: configErr.code },
          { status: 400 }
        );
      }
      throw configErr;
    }

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          const generator = runAutonomousInvestigation(dataset, {
            provider,
            objective: body.objective ? sanitizeInputText(body.objective, 500) : undefined,
            userDirectives: body.directives?.map((d) => sanitizeInputText(d, 500)),
          });

          for await (const event of generator) {
            if (event.type === 'started') {
              saveInvestigationCsv(event.investigationId, csvData!);
              if (body.artifacts && body.artifacts.length > 0) {
                saveInvestigationArtifacts(event.investigationId, body.artifacts);
              }
            }
            const line = JSON.stringify(event) + '\n';
            controller.enqueue(encoder.encode(line));
          }
          controller.close();
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          const errorLine =
            JSON.stringify({
              type: 'error',
              code: 'STREAM_ERROR',
              message: errorMsg,
              fatal: true,
            }) + '\n';
          controller.enqueue(encoder.encode(errorLine));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: 'Failed to initialize investigation', details: errorMsg },
      { status: 500 }
    );
  }
}
