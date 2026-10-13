import { withAuth } from '../../../../../../../server/auth/guard.ts';
import { getInvestigationQueue } from '../../../../../../../server/queue/investigation-queue.ts';
import { recordAuditEvent } from '../../../../../../../server/audit/audit-logger.ts';
import { notFound, badRequest } from '../../../../../../../server/api/errors.ts';
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
    let jobId = params?.id;

    if (!jobId) {
      const parts = new URL(req.url).pathname.split('/');
      // /api/v1/investigations/jobs/[id]/cancel
      const jobsIdx = parts.indexOf('jobs');
      if (jobsIdx !== -1 && parts.length > jobsIdx + 1) {
        jobId = parts[jobsIdx + 1];
      }
    }

    if (!jobId) {
      throw badRequest('Job ID parameter is required', 'MISSING_JOB_ID');
    }

    const body = (await req.json().catch(() => ({}))) as { reason?: string };
    const queue = getInvestigationQueue();
    const job = await queue.getJob(jobId);

    if (!job || job.data.organizationId !== context.organizationId) {
      throw notFound(`Job not found: ${jobId}`, 'JOB_NOT_FOUND');
    }

    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
      throw badRequest(`Cannot cancel job with status '${job.status}'`, 'JOB_NOT_CANCELLABLE');
    }

    const reason = body.reason ?? 'Cancelled by user';
    const cancelled = await queue.cancelJob(jobId, reason);

    if (cancelled) {
      await recordAuditEvent({
        organizationId: context.organizationId,
        actorId: context.user.id,
        action: 'INVESTIGATION_JOB_CANCELLED',
        objectType: 'investigation_job',
        objectId: jobId,
        metadata: {
          investigationId: job.data.investigationId,
          reason,
        },
      });
    }

    return Response.json({
      ok: true,
      jobId,
      status: 'cancelled',
      reason,
    });
  },
  { requiredRole: 'editor' }
);
