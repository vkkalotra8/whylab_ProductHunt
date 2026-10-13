import { withAuth } from '../../../../server/auth/guard.ts';
import { getAuditEvents } from '../../../../server/audit/audit-logger.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = withAuth(
  async (req, context) => {
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);
    const action = url.searchParams.get('action') || undefined;

    const result = await getAuditEvents(context.organizationId, { limit, offset, action });

    return Response.json({
      organizationId: context.organizationId,
      events: result.events,
      total: result.total,
      limit,
      offset,
    });
  },
  { requiredRole: 'admin' }
);
