import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ingestEvaluationCsv } from '@/core/diagnostics/evaluation-ingestion';
import { runAdversarialReview } from '@/core/falsification/adversarial-review';
import { analyzeMultiSiteShift } from '@/core/diagnostics/multi-site-shift';
import { apiRateLimiter, getClientIp } from '@/server/security/rate-limiter';
import { sanitizeFileName } from '@/server/security/sanitizer';

export async function POST(req: Request) {
  try {
    const clientIp = getClientIp(req);
    const rateCheck = apiRateLimiter.check(clientIp, { maxRequests: 60, windowMs: 60_000 });
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please retry after a brief moment.' },
        { status: 429, headers: rateCheck.headers }
      );
    }

    const body = await req.json().catch(() => ({}));
    const rawFixture = typeof body.fixture === 'string' ? body.fixture : 'melanoma-synthetic.csv';
    const fixtureFile = sanitizeFileName(rawFixture);
    const floor = typeof body.sampleSizeFloor === 'number' ? body.sampleSizeFloor : 30;
    const positiveLabel = typeof body.positiveLabel === 'string' ? body.positiveLabel : '1';
    const negativeLabel = typeof body.negativeLabel === 'string' ? body.negativeLabel : '0';

    const fixturesDir = join(process.cwd(), 'public', 'fixtures');
    const fixturePath = join(fixturesDir, fixtureFile);

    let csvContent: string;
    if (typeof body.csv === 'string' && body.csv.length > 0) {
      csvContent = body.csv;
    } else if (existsSync(fixturePath)) {
      csvContent = readFileSync(fixturePath, 'utf8');
    } else {
      csvContent = readFileSync(join(fixturesDir, 'melanoma-synthetic.csv'), 'utf8');
    }

    const dataset = ingestEvaluationCsv(csvContent, fixtureFile, {
      labels: { positive: positiveLabel, negative: negativeLabel },
    });

    const auditReport = runAdversarialReview({
      dataset,
      minimumSampleSizeFloor: floor,
    });

    const multiSiteReport = analyzeMultiSiteShift(dataset, {
      column: typeof body.column === 'string' ? body.column : undefined,
      sampleSizeFloor: floor,
    });

    return NextResponse.json(
      {
        auditReport,
        multiSiteReport,
      },
      { headers: rateCheck.headers }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error during adversarial review';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
