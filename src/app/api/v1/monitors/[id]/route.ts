import { withAuth } from '../../../../../server/auth/guard.ts';
import { getMonitorEngine } from '../../../../../server/monitoring/monitor-engine.ts';
import { notFound, badRequest } from '../../../../../server/api/errors.ts';
import type { TenantContext } from '../../../../../server/auth/types.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = withAuth<{ params: Promise<{ id: string }> | { id: string } }>(
  async (
    req: Request,
    context: TenantContext,
    props?: { params: Promise<{ id: string }> | { id: string } }
  ) => {
    const params = props?.params ? await props.params : null;
    let ruleId = params?.id;

    if (!ruleId) {
      const parts = new URL(req.url).pathname.split('/');
      // /api/v1/monitors/[id]
      const monitorsIdx = parts.indexOf('monitors');
      if (monitorsIdx !== -1 && parts.length > monitorsIdx + 1) {
        ruleId = parts[monitorsIdx + 1];
      }
    }

    if (!ruleId) {
      throw badRequest('Rule ID parameter is required', 'MISSING_RULE_ID');
    }

    const engine = getMonitorEngine();
    const rule = await engine.getRule(ruleId);

    if (!rule || rule.organizationId !== context.organizationId) {
      throw notFound(`Monitor rule '${ruleId}' not found`, 'RULE_NOT_FOUND');
    }

    return Response.json({
      rule,
    });
  },
  { requiredRole: 'viewer' }
);

export const DELETE = withAuth<{ params: Promise<{ id: string }> | { id: string } }>(
  async (
    req: Request,
    context: TenantContext,
    props?: { params: Promise<{ id: string }> | { id: string } }
  ) => {
    const params = props?.params ? await props.params : null;
    let ruleId = params?.id;

    if (!ruleId) {
      const parts = new URL(req.url).pathname.split('/');
      const monitorsIdx = parts.indexOf('monitors');
      if (monitorsIdx !== -1 && parts.length > monitorsIdx + 1) {
        ruleId = parts[monitorsIdx + 1];
      }
    }

    if (!ruleId) {
      throw badRequest('Rule ID parameter is required', 'MISSING_RULE_ID');
    }

    const engine = getMonitorEngine();
    const deleted = await engine.deleteRule(ruleId, context.organizationId);

    if (!deleted) {
      throw notFound(`Monitor rule '${ruleId}' not found`, 'RULE_NOT_FOUND');
    }

    return Response.json({
      ok: true,
      ruleId,
      message: 'Monitor rule deleted',
    });
  },
  { requiredRole: 'editor' }
);
