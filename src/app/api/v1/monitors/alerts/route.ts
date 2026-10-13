import { withAuth } from '../../../../../server/auth/guard.ts';
import { getMonitorEngine } from '../../../../../server/monitoring/monitor-engine.ts';
import type { TenantContext } from '../../../../../server/auth/types.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = withAuth(
  async (req: Request, context: TenantContext) => {
    const url = new URL(req.url);
    const projectId = url.searchParams.get('projectId') ?? undefined;
    const severity = url.searchParams.get('severity') ?? undefined;
    const ackParam = url.searchParams.get('acknowledged');
    const acknowledged = ackParam !== null ? ackParam === 'true' : undefined;

    const engine = getMonitorEngine();
    const alerts = await engine.listAlerts(context.organizationId, {
      projectId,
      severity,
      acknowledged,
    });

    return Response.json({
      organizationId: context.organizationId,
      alerts,
      count: alerts.length,
    });
  },
  { requiredRole: 'viewer' }
);
