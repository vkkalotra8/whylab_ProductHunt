import { withAuth } from '../../../../../../server/auth/guard.ts';
import { getMonitorEngine } from '../../../../../../server/monitoring/monitor-engine.ts';
import { badRequest } from '../../../../../../server/api/errors.ts';
import type { TenantContext } from '../../../../../../server/auth/types.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const POST = withAuth<{ params: Promise<{ id: string }> | { id: string } }>(
  async (
    req: Request,
    context: TenantContext,
    props?: { params: Promise<{ id: string }> | { id: string } }
  ) => {
    const params = props?.params ? await props.params : null;
    let ruleId = params?.id;

    if (!ruleId) {
      const parts = new URL(req.url).pathname.split('/');
      // /api/v1/monitors/[id]/evaluate
      const monitorsIdx = parts.indexOf('monitors');
      if (monitorsIdx !== -1 && parts.length > monitorsIdx + 1) {
        ruleId = parts[monitorsIdx + 1];
      }
    }

    if (!ruleId) {
      throw badRequest('Rule ID parameter is required', 'MISSING_RULE_ID');
    }

    const body = (await req.json().catch(() => ({}))) as {
      csvContent?: string;
      batchName?: string;
    };

    if (!body.csvContent || body.csvContent.trim().length === 0) {
      throw badRequest('csvContent is required for batch drift evaluation', 'MISSING_CSV_CONTENT');
    }

    const engine = getMonitorEngine();
    const result = await engine.evaluateBatch(
      ruleId,
      context.organizationId,
      body.csvContent,
      body.batchName ?? 'production_batch.csv'
    );

    return Response.json({
      ok: true,
      result,
    });
  },
  { requiredRole: 'editor' }
);
