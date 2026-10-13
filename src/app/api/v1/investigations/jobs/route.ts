import { withAuth } from '../../../../../server/auth/guard.ts';
import { getInvestigationQueue } from '../../../../../server/queue/investigation-queue.ts';
import { getInvestigationWorker } from '../../../../../server/worker/investigation-worker.ts';
import { recordAuditEvent } from '../../../../../server/audit/audit-logger.ts';
import { badRequest } from '../../../../../server/api/errors.ts';
import { createId } from '../../../../../core/domain/primitives.ts';
import type { TenantContext } from '../../../../../server/auth/types.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const POST = withAuth(
  async (req: Request, context: TenantContext) => {
    const body = (await req.json().catch(() => ({}))) as {
      projectId?: string;
      datasetId?: string;
      csvContent?: string;
      fixtureName?: string;
      columnMapping?: any;
      labels?: { positive: string; negative: string };
      objective?: string;
      userDirectives?: string[];
      offlineOnly?: boolean;
      artifacts?: any[];
      autoStart?: boolean;
    };

    if (!body.projectId || body.projectId.trim().length === 0) {
      throw badRequest('projectId is required', 'MISSING_PROJECT_ID');
    }

    const investigationId = createId('investigation');
    const queue = getInvestigationQueue();

    const job = await queue.enqueue({
      investigationId,
      organizationId: context.organizationId,
      projectId: body.projectId.trim(),
      datasetId: body.datasetId,
      csvContent: body.csvContent,
      fixtureName: body.fixtureName,
      columnMapping: body.columnMapping,
      labels: body.labels,
      objective: body.objective,
      userDirectives: body.userDirectives,
      offlineOnly: body.offlineOnly,
      artifacts: body.artifacts,
      autoStart: body.autoStart,
    });

    // Record audit event
    await recordAuditEvent({
      organizationId: context.organizationId,
      actorId: context.user.id,
      action: 'INVESTIGATION_JOB_QUEUED',
      objectType: 'investigation_job',
      objectId: job.id,
      metadata: {
        investigationId,
        projectId: body.projectId,
        objective: body.objective,
      },
    });

    // Trigger worker asynchronously to immediately start processing unless disabled
    if (body.autoStart !== false) {
      const worker = getInvestigationWorker();
      setImmediate(() => {
        worker.processNextJob().catch((err) => {
          console.error('Asynchronous job execution error:', err);
        });
      });
    }

    return Response.json(
      {
        jobId: job.id,
        investigationId,
        status: job.status,
        createdAt: job.createdAt,
        eventsUrl: `/api/v1/investigations/${investigationId}/events`,
        jobUrl: `/api/v1/investigations/jobs/${job.id}`,
      },
      { status: 202 }
    );
  },
  { requiredRole: 'editor' }
);

export const GET = withAuth(
  async (req: Request, context: TenantContext) => {
    const url = new URL(req.url);
    const projectId = url.searchParams.get('projectId') ?? undefined;

    const queue = getInvestigationQueue();
    const jobs = await queue.listJobs(context.organizationId, projectId);
    const stats = await queue.getStats();

    return Response.json({
      organizationId: context.organizationId,
      projectId,
      jobs,
      stats,
      count: jobs.length,
    });
  },
  { requiredRole: 'viewer' }
);
