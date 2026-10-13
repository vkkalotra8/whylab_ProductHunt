import { withAuth } from '../../../../server/auth/guard.ts';
import { getDatasetRegistry } from '../../../../server/datasets/registry.ts';
import { badRequest } from '../../../../server/api/errors.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = withAuth(
  async (req, context) => {
    const url = new URL(req.url);
    const projectId = url.searchParams.get('projectId');

    if (!projectId || projectId.trim().length === 0) {
      throw badRequest('projectId query parameter is required', 'MISSING_PROJECT_ID');
    }

    const registry = getDatasetRegistry();
    const datasets = await registry.listDatasets(context.organizationId, projectId);

    const enriched = await Promise.all(
      datasets.map(async (ds) => {
        const versions = await registry.listVersions(context.organizationId, projectId, ds.id);
        return {
          ...ds,
          versionCount: versions.length,
          latestVersion: versions.length > 0 ? versions[versions.length - 1] : null,
        };
      })
    );

    return Response.json({
      organizationId: context.organizationId,
      projectId,
      datasets: enriched,
      count: enriched.length,
    });
  },
  { requiredRole: 'viewer' }
);
