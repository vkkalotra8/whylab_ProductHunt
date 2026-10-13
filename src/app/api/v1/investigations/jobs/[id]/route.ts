import { withAuth } from '../../../../../../server/auth/guard.ts';
import { getInvestigationQueue } from '../../../../../../server/queue/investigation-queue.ts';
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
    let jobId = params?.id;

    if (!jobId) {
      const parts = new URL(req.url).pathname.split('/');
      jobId = parts[parts.length - 1];
    }

    if (!jobId) {
      throw badRequest('Job ID parameter is required', 'MISSING_JOB_ID');
    }

    const queue = getInvestigationQueue();
    const job = await queue.getJob(jobId);

    if (!job || job.data.organizationId !== context.organizationId) {
      throw notFound(`Job not found: ${jobId}`, 'JOB_NOT_FOUND');
    }

    return Response.json({ job });
  },
  { requiredRole: 'viewer' }
);
