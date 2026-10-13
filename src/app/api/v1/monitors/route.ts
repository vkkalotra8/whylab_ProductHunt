import { withAuth } from '../../../../server/auth/guard.ts';
import { getMonitorEngine } from '../../../../server/monitoring/monitor-engine.ts';
import { badRequest } from '../../../../server/api/errors.ts';
import type { TenantContext } from '../../../../server/auth/types.ts';
import type { CreateMonitorRuleParams } from '../../../../server/monitoring/types.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const POST = withAuth(
  async (req: Request, context: TenantContext) => {
    const body = (await req.json().catch(() => ({}))) as Partial<CreateMonitorRuleParams>;

    if (!body.projectId || body.projectId.trim().length === 0) {
      throw badRequest('projectId is required', 'MISSING_PROJECT_ID');
    }

    if (!body.name || body.name.trim().length === 0) {
      throw badRequest('name is required', 'MISSING_RULE_NAME');
    }

    if (!body.conditions || !Array.isArray(body.conditions) || body.conditions.length === 0) {
      throw badRequest('At least one condition is required', 'MISSING_CONDITIONS');
    }

    const engine = getMonitorEngine();
    const rule = await engine.createRule({
      organizationId: context.organizationId,
      projectId: body.projectId.trim(),
      name: body.name.trim(),
      description: body.description,
      referenceDatasetId: body.referenceDatasetId,
      referenceFixtureName: body.referenceFixtureName,
      referenceCsvContent: body.referenceCsvContent,
      columnMapping: body.columnMapping,
      labels: body.labels,
      conditions: body.conditions,
      cooldownMinutes: body.cooldownMinutes,
    });

    return Response.json(
      {
        ok: true,
        rule,
      },
      { status: 201 }
    );
  },
  { requiredRole: 'editor' }
);

export const GET = withAuth(
  async (req: Request, context: TenantContext) => {
    const url = new URL(req.url);
    const projectId = url.searchParams.get('projectId') ?? undefined;

    const engine = getMonitorEngine();
    const rules = await engine.listRules(context.organizationId, projectId);

    return Response.json({
      organizationId: context.organizationId,
      projectId,
      rules,
      count: rules.length,
    });
  },
  { requiredRole: 'viewer' }
);
