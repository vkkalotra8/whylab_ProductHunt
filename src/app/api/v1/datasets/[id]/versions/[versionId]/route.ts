import { withAuth } from '../../../../../../../server/auth/guard.ts';
import { getDatasetRegistry } from '../../../../../../../server/datasets/registry.ts';
import { badRequest, notFound } from '../../../../../../../server/api/errors.ts';
import type { TenantContext } from '../../../../../../../server/auth/types.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = withAuth<{ params: Promise<{ id: string; versionId: string }> | { id: string; versionId: string } }>(
  async (
    req: Request,
    context: TenantContext,
    props?: { params: Promise<{ id: string; versionId: string }> | { id: string; versionId: string } }
  ) => {
    const params = props?.params ? await props.params : null;
    const url = new URL(req.url);

    // Fallback URL segment parsing if props not directly passed
    let datasetId = params?.id;
    let versionId = params?.versionId;

    if (!datasetId || !versionId) {
      const parts = url.pathname.split('/');
      // /api/v1/datasets/[id]/versions/[versionId]
      const dsIdx = parts.indexOf('datasets');
      if (dsIdx !== -1 && parts.length > dsIdx + 3) {
        datasetId = parts[dsIdx + 1];
        versionId = parts[dsIdx + 3];
      }
    }

    if (!datasetId || !versionId) {
      throw badRequest('Invalid route parameters', 'INVALID_PARAMS');
    }

    const projectId = url.searchParams.get('projectId');
    if (!projectId) {
      throw badRequest('projectId query parameter is required', 'MISSING_PROJECT_ID');
    }

    const registry = getDatasetRegistry();
    const dataset = await registry.getDataset(context.organizationId, projectId, datasetId);
    if (!dataset) {
      throw notFound(`Dataset not found: ${datasetId}`, 'DATASET_NOT_FOUND');
    }

    const version = await registry.getVersion(context.organizationId, projectId, datasetId, versionId);
    if (!version) {
      throw notFound(`Dataset version not found: ${versionId}`, 'VERSION_NOT_FOUND');
    }

    return Response.json({
      dataset,
      version,
    });
  },
  { requiredRole: 'viewer' }
);
