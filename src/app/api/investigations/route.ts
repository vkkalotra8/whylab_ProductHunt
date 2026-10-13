import { NextRequest, NextResponse } from 'next/server';
import { listInvestigations, saveInvestigation } from '../../../core/investigation/store.ts';
import { getTenantContext } from '../../../server/auth/session.ts';
import { recordAuditEvent } from '../../../server/audit/audit-logger.ts';
import { unauthorized, errorResponse } from '../../../server/api/errors.ts';
import type { Investigation } from '../../../core/domain/types.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const requestId = req.headers.get('x-request-id') || `req_${crypto.randomUUID()}`;
  try {
    const context = await getTenantContext(req.headers);
    if (!context && process.env.AUTH_REQUIRED === 'true') {
      return errorResponse(unauthorized('Valid session credentials required'), requestId, req.url);
    }

    const list = listInvestigations();
    return NextResponse.json({
      investigations: list,
      count: list.length,
      organizationId: context?.organizationId || 'org_default',
    });
  } catch (err: unknown) {
    return errorResponse(err, requestId, req.url);
  }
}

export async function POST(req: NextRequest) {
  const requestId = req.headers.get('x-request-id') || `req_${crypto.randomUUID()}`;
  try {
    const context = await getTenantContext(req.headers);
    if (!context && process.env.AUTH_REQUIRED === 'true') {
      return errorResponse(unauthorized('Valid session credentials required'), requestId, req.url);
    }

    const body = (await req.json()) as {
      investigation?: Investigation;
      csvContent?: string;
    };

    if (!body || !body.investigation || !body.investigation.id) {
      return NextResponse.json(
        { error: 'Valid investigation payload is required.' },
        { status: 400 }
      );
    }

    saveInvestigation(body.investigation, body.csvContent);

    // Record audit event
    if (context) {
      await recordAuditEvent({
        organizationId: context.organizationId,
        actorId: context.user.id,
        action: 'INVESTIGATION_SAVED',
        objectType: 'investigation',
        objectId: body.investigation.id,
        metadata: {
          objective: body.investigation.objective,
          datasetName: body.investigation.datasets[0]?.name ?? null,
        },
      });
    }

    return NextResponse.json({
      success: true,
      id: body.investigation.id,
    });
  } catch (err: unknown) {
    return errorResponse(err, requestId, req.url);
  }
}
