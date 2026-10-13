import path from 'node:path';
import crypto from 'node:crypto';
import { withAuth } from '../../../../../server/auth/guard.ts';
import { getStorageProvider } from '../../../../../server/storage/index.ts';
import { getDatasetRegistry } from '../../../../../server/datasets/registry.ts';
import { badRequest } from '../../../../../server/api/errors.ts';
import type { InitiateUploadRequest, InitiateUploadResponse, DatasetRole } from '../../../../../server/datasets/types.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const POST = withAuth(
  async (req, context) => {
    const body = (await req.json()) as InitiateUploadRequest;

    if (!body.projectId || body.projectId.trim().length === 0) {
      throw badRequest('projectId is required', 'MISSING_PROJECT_ID');
    }
    if (!body.datasetName || body.datasetName.trim().length === 0) {
      throw badRequest('datasetName is required', 'MISSING_DATASET_NAME');
    }
    if (!body.filename || body.filename.trim().length === 0) {
      throw badRequest('filename is required', 'MISSING_FILENAME');
    }

    const safeFilename = path.basename(body.filename).replace(/[^a-zA-Z0-9._-]/g, '_');
    const lowerFilename = safeFilename.toLowerCase();
    const disallowedExtensions = ['.pkl', '.pickle', '.joblib', '.pt', '.bin', '.h5', '.exe', '.sh', '.bat'];
    for (const ext of disallowedExtensions) {
      if (lowerFilename.endsWith(ext)) {
        throw badRequest(
          `Uploading file with extension ${ext} is strictly prohibited (CWE-502).`,
          'PROHIBITED_FILE_TYPE'
        );
      }
    }

    const role: DatasetRole = body.role || 'production_evaluation';
    const validRoles: DatasetRole[] = ['production_evaluation', 'reference_baseline', 'holdout_golden'];
    if (!validRoles.includes(role)) {
      throw badRequest(`Invalid dataset role: ${role}`, 'INVALID_ROLE');
    }

    const registry = getDatasetRegistry();
    let existingDataset = await registry.getDatasetByName(
      context.organizationId,
      body.projectId,
      body.datasetName.trim()
    );

    let datasetId: string;
    if (existingDataset) {
      datasetId = existingDataset.id;
    } else {
      const created = await registry.createDataset(
        context.organizationId,
        body.projectId,
        body.datasetName.trim(),
        role
      );
      datasetId = created.id;
    }

    const versionId = `dsv_${crypto.randomUUID().slice(0, 12)}`;
    // Tenant-isolated storage path prefix
    const objectKey = `org_${context.organizationId}/proj_${body.projectId}/datasets/${datasetId}/${versionId}_${safeFilename}`;

    const storage = getStorageProvider();
    const contentType = body.contentType || 'text/csv';
    const presigned = await storage.createPresignedUploadUrl(objectKey, contentType, 900); // 15 mins

    const responsePayload: InitiateUploadResponse = {
      uploadId: presigned.uploadId,
      datasetId,
      versionId,
      objectKey,
      presignedUrl: presigned.url,
      method: 'PUT',
      headers: presigned.headers,
      expiresAt: presigned.expiresAt,
    };

    return Response.json(responsePayload, { status: 200 });
  },
  { requiredRole: 'editor' }
);
