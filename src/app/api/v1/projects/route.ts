import { withAuth } from '../../../../server/auth/guard.ts';
import { recordAuditEvent } from '../../../../server/audit/audit-logger.ts';
import { badRequest } from '../../../../server/api/errors.ts';
import type { Project } from '../../../../server/auth/types.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// In-memory project cache for local standalone mode
const projectCache = new Map<string, Project[]>();

function getProjectsForOrg(orgId: string): Project[] {
  if (!projectCache.has(orgId)) {
    // Seed default project for organization
    projectCache.set(orgId, [
      {
        id: `prj_${orgId}_default`,
        organizationId: orgId,
        name: 'Default Workspace',
        description: 'Primary ML reliability investigation workspace',
        ownerId: 'usr_default',
        createdAt: new Date().toISOString(),
      },
    ]);
  }
  return projectCache.get(orgId)!;
}

export const GET = withAuth(async (_req, context) => {
  const projects = getProjectsForOrg(context.organizationId);
  return Response.json({
    organizationId: context.organizationId,
    projects,
    count: projects.length,
  });
});

export const POST = withAuth(
  async (req, context) => {
    const body = (await req.json()) as { name?: string; description?: string };

    if (!body || !body.name || body.name.trim().length === 0) {
      throw badRequest('Project name is required', 'INVALID_PROJECT_NAME');
    }

    const newProject: Project = {
      id: `prj_${crypto.randomUUID()}`,
      organizationId: context.organizationId,
      name: body.name.trim(),
      description: body.description?.trim() || '',
      ownerId: context.user.id,
      createdAt: new Date().toISOString(),
    };

    const orgProjects = getProjectsForOrg(context.organizationId);
    orgProjects.push(newProject);
    projectCache.set(context.organizationId, orgProjects);

    // Record audit event
    await recordAuditEvent({
      organizationId: context.organizationId,
      actorId: context.user.id,
      action: 'PROJECT_CREATED',
      objectType: 'project',
      objectId: newProject.id,
      metadata: { name: newProject.name },
    });

    return Response.json({ project: newProject }, { status: 201 });
  },
  { requiredRole: 'editor' }
);
