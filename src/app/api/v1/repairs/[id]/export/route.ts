import { withAuth } from '../../../../../../server/auth/guard.ts';
import { getRepairRegistry } from '../../../../../../server/repair/repair-registry.ts';
import { notFound, badRequest } from '../../../../../../server/api/errors.ts';
import type { TenantContext } from '../../../../../../server/auth/types.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = withAuth<{ params: Promise<{ id: string }> | { id: string } }>(
  async (
    req: Request,
    context: TenantContext,
    props?: { params: Promise<{ id: string }> | { id: string } }
  ) => {
    const params = props?.params ? await props.params : null;
    let policyId = params?.id;

    if (!policyId) {
      const parts = new URL(req.url).pathname.split('/');
      // /api/v1/repairs/[id]/export
      const repairsIdx = parts.indexOf('repairs');
      if (repairsIdx !== -1 && parts.length > repairsIdx + 1) {
        policyId = parts[repairsIdx + 1];
      }
    }

    if (!policyId) {
      throw badRequest('Policy ID parameter is required', 'MISSING_POLICY_ID');
    }

    const registry = getRepairRegistry();
    const policy = await registry.getPolicy(policyId);

    if (!policy || policy.organizationId !== context.organizationId) {
      throw notFound(`Repair policy '${policyId}' not found`, 'REPAIR_POLICY_NOT_FOUND');
    }

    const url = new URL(req.url);
    const format = url.searchParams.get('format') ?? 'all';

    let snippet: unknown = policy.codeSnippets;
    if (format === 'python') snippet = policy.codeSnippets.python;
    else if (format === 'typescript') snippet = policy.codeSnippets.typescript;
    else if (format === 'json') snippet = policy.codeSnippets.json;
    else if (format === 'yaml') snippet = policy.codeSnippets.yaml;

    return Response.json({
      policyId: policy.id,
      version: policy.version,
      status: policy.status,
      operatingThreshold: policy.operatingThreshold,
      validationMode: policy.validationMode,
      isApproved: policy.status === 'approved',
      approval: policy.approval ?? null,
      automatedDeploymentProhibited: true,
      format,
      snippet,
    });
  },
  { requiredRole: 'viewer' }
);
