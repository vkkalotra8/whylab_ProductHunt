import { withAuth } from '../../../../../../server/auth/guard.ts';
import { getRepairRegistry } from '../../../../../../server/repair/repair-registry.ts';
import { badRequest } from '../../../../../../server/api/errors.ts';
import type { TenantContext } from '../../../../../../server/auth/types.ts';
import type { ApproveRepairPolicyParams } from '../../../../../../server/repair/types.ts';

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
      // /api/v1/repairs/[id]/approve
      const repairsIdx = parts.indexOf('repairs');
      if (repairsIdx !== -1 && parts.length > repairsIdx + 1) {
        policyId = parts[repairsIdx + 1];
      }
    }

    if (!policyId) {
      throw badRequest('Policy ID parameter is required', 'MISSING_POLICY_ID');
    }

    const body = (await req.json().catch(() => ({}))) as Partial<ApproveRepairPolicyParams>;

    if (!body.comments || typeof body.comments !== 'string' || body.comments.trim().length < 8) {
      throw badRequest(
        'Human rationale comment of at least 8 characters is required for policy approval',
        'APPROVAL_COMMENT_REQUIRED'
      );
    }

    if (typeof body.expectedVersion !== 'number') {
      throw badRequest('expectedVersion number is required for optimistic concurrency locking', 'MISSING_EXPECTED_VERSION');
    }

    const registry = getRepairRegistry();
    const result = await registry.approvePolicy(policyId, context.organizationId, {
      approvedBy: context.user.id,
      approvedByName: context.user.name,
      comments: body.comments,
      expectedVersion: body.expectedVersion,
      signature: body.signature,
    });

    return Response.json({
      ok: true,
      policy: result.policy,
      auditEventId: result.auditEventId,
      message: 'Repair policy successfully approved for production staging. Automated deployment is prohibited.',
    });
  },
  { requiredRole: 'editor' }
);
