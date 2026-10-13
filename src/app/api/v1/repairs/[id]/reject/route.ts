import { withAuth } from '../../../../../../server/auth/guard.ts';
import { getRepairRegistry } from '../../../../../../server/repair/repair-registry.ts';
import { badRequest } from '../../../../../../server/api/errors.ts';
import type { TenantContext } from '../../../../../../server/auth/types.ts';
import type { RejectRepairPolicyParams } from '../../../../../../server/repair/types.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const POST = withAuth<{ params: Promise<{ id: string }> | { id: string } }>(
  async (
    req: Request,
    context: TenantContext,
    props?: { params: Promise<{ id: string }> | { id: string } }
  ) => {
    const params = props?.params ? await props.params : null;
    let policyId = params?.id;

    if (!policyId) {
      const parts = new URL(req.url).pathname.split('/');
      // /api/v1/repairs/[id]/reject
      const repairsIdx = parts.indexOf('repairs');
      if (repairsIdx !== -1 && parts.length > repairsIdx + 1) {
        policyId = parts[repairsIdx + 1];
      }
    }

    if (!policyId) {
      throw badRequest('Policy ID parameter is required', 'MISSING_POLICY_ID');
    }

    const body = (await req.json().catch(() => ({}))) as Partial<RejectRepairPolicyParams>;

    const registry = getRepairRegistry();
    const policy = await registry.rejectPolicy(policyId, context.organizationId, {
      rejectedBy: context.user.id,
      rejectedByName: context.user.name,
      reason: body.reason ?? 'Rejected by human reviewer',
      expectedVersion: body.expectedVersion,
    });

    return Response.json({
      ok: true,
      policy,
      message: 'Repair policy rejected and logged in audit ledger.',
    });
  },
  { requiredRole: 'editor' }
);
