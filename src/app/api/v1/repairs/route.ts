import { withAuth } from '../../../../server/auth/guard.ts';
import { getRepairRegistry } from '../../../../server/repair/repair-registry.ts';
import { badRequest } from '../../../../server/api/errors.ts';
import type { TenantContext } from '../../../../server/auth/types.ts';
import type { CreateRepairPolicyParams } from '../../../../server/repair/types.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const POST = withAuth(
  async (req: Request, context: TenantContext) => {
    const body = (await req.json().catch(() => ({}))) as Partial<CreateRepairPolicyParams>;

    if (!body.projectId || body.projectId.trim().length === 0) {
      throw badRequest('projectId is required', 'MISSING_PROJECT_ID');
    }

    if (typeof body.operatingThreshold !== 'number' || body.operatingThreshold < 0 || body.operatingThreshold > 1) {
      throw badRequest('operatingThreshold must be a float between 0.0 and 1.0', 'INVALID_THRESHOLD');
    }

    if (!body.positiveLabel) {
      throw badRequest('positiveLabel is required', 'MISSING_POSITIVE_LABEL');
    }

    const registry = getRepairRegistry();
    const policy = await registry.createPolicy({
      organizationId: context.organizationId,
      projectId: body.projectId.trim(),
      investigationId: body.investigationId,
      operatingThreshold: body.operatingThreshold,
      positiveLabel: body.positiveLabel,
      costWeights: body.costWeights ?? { falseNegative: 20, falsePositive: 1 },
      targetRecall: body.targetRecall ?? 0.8,
      validationMode: body.validationMode,
      datasetName: body.datasetName,
      totalSamples: body.totalSamples,
      baselineMetrics: body.baselineMetrics,
      projectedMetrics: body.projectedMetrics,
      createdBy: context.user.id,
    });

    return Response.json(
      {
        ok: true,
        policy,
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

    const registry = getRepairRegistry();
    const policies = await registry.listPolicies(context.organizationId, projectId);

    return Response.json({
      organizationId: context.organizationId,
      projectId,
      policies,
      count: policies.length,
    });
  },
  { requiredRole: 'viewer' }
);
