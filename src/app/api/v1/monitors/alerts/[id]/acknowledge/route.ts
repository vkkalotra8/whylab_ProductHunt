import { withAuth } from '../../../../../../../server/auth/guard.ts';
import { getMonitorEngine } from '../../../../../../../server/monitoring/monitor-engine.ts';
import { badRequest } from '../../../../../../../server/api/errors.ts';
import type { TenantContext } from '../../../../../../../server/auth/types.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const POST = withAuth<{ params: Promise<{ id: string }> | { id: string } }>(
  async (
    req: Request,
    context: TenantContext,
    props?: { params: Promise<{ id: string }> | { id: string } }
  ) => {
    const params = props?.params ? await props.params : null;
    let alertId = params?.id;

    if (!alertId) {
      const parts = new URL(req.url).pathname.split('/');
      // /api/v1/monitors/alerts/[id]/acknowledge
      const alertsIdx = parts.indexOf('alerts');
      if (alertsIdx !== -1 && parts.length > alertsIdx + 1) {
        alertId = parts[alertsIdx + 1];
      }
    }

    if (!alertId) {
      throw badRequest('Alert ID parameter is required', 'MISSING_ALERT_ID');
    }

    const engine = getMonitorEngine();
    const alert = await engine.acknowledgeAlert(alertId, context.organizationId, context.user.name || context.user.id);

    return Response.json({
      ok: true,
      alert,
      message: 'Monitor alert successfully acknowledged.',
    });
  },
  { requiredRole: 'editor' }
);
