import { withAuth } from '../../../../../../../server/auth/guard.ts';
import { getStorageProvider } from '../../../../../../../server/storage/index.ts';
import { getDatasetRegistry } from '../../../../../../../server/datasets/registry.ts';
import { validateDatasetContent } from '../../../../../../../server/datasets/validator.ts';
import { recordAuditEvent } from '../../../../../../../server/audit/audit-logger.ts';
import { badRequest } from '../../../../../../../server/api/errors.ts';
import type { TenantContext } from '../../../../../../../server/auth/types.ts';
import type { CompleteUploadRequest } from '../../../../../../../server/datasets/types.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const POST = withAuth(
  async (req: Request, context: TenantContext) => {
    const body = (await req.json()) as CompleteUploadRequest;

    if (!body.projectId) {
      throw badRequest('projectId is required', 'MISSING_PROJECT_ID');
    }
    if (!body.datasetId) {
      throw badRequest('datasetId is required', 'MISSING_DATASET_ID');
    }
    if (!body.objectKey) {
      throw badRequest('objectKey is required', 'MISSING_OBJECT_KEY');
    }

    // Verify tenant scoping of objectKey to prevent path traversal / cross-tenant hijacking
    const expectedPrefix = `org_${context.organizationId}/proj_${body.projectId}/`;
    if (!body.objectKey.startsWith(expectedPrefix)) {
      throw badRequest('Invalid object key prefix for tenant workspace', 'TENANT_MISMATCH');
    }

    const storage = getStorageProvider();
    const buffer = await storage.getObject(body.objectKey);
    if (!buffer) {
      throw badRequest(`Uploaded object not found at key: ${body.objectKey}`, 'OBJECT_NOT_FOUND');
    }

    // Validate uploaded dataset contents
    const validation = validateDatasetContent(buffer, {
      filename: body.objectKey,
      sanitizeFormulas: body.sanitizeFormulas ?? true,
    });

    if (!validation.isValid) {
      return Response.json(
        {
          error: 'Dataset content validation failed',
          code: 'DATASET_VALIDATION_FAILED',
          issues: validation.issues,
        },
        { status: 422 }
      );
    }

    // Verify expected SHA-256 integrity if client provided it
    if (body.expectedSha256 && body.expectedSha256.toLowerCase() !== validation.sha256.toLowerCase()) {
      throw badRequest(
        `Cryptographic integrity checksum mismatch. Expected: ${body.expectedSha256}, Computed: ${validation.sha256}`,
        'CHECKSUM_MISMATCH'
      );
    }

    const registry = getDatasetRegistry();
    const { dataset, version, isDuplicate } = await registry.registerDatasetVersion({
      orgId: context.organizationId,
      projectId: body.projectId,
      datasetId: body.datasetId,
      objectKey: body.objectKey,
      sha256: validation.sha256,
      rowCount: validation.rowCount,
      columnCount: validation.columnCount,
      sizeBytes: validation.sizeBytes,
      schemaJson: {
        columns: validation.columns,
      },
      summaryJson: validation,
    });

    // Record immutable audit event
    await recordAuditEvent({
      organizationId: context.organizationId,
      actorId: context.user.id,
      action: isDuplicate ? 'DATASET_VERSION_DEDUPLICATED' : 'DATASET_VERSION_CREATED',
      objectType: 'dataset_version',
      objectId: version.id,
      metadata: {
        datasetId: dataset.id,
        datasetName: dataset.name,
        versionNumber: version.versionNumber,
        sha256: version.sha256,
        rowCount: version.rowCount,
        isDuplicate,
      },
    });

    return Response.json(
      {
        dataset,
        version,
        isDuplicate,
        validation: {
          isValid: validation.isValid,
          sha256: validation.sha256,
          sizeBytes: validation.sizeBytes,
          rowCount: validation.rowCount,
          columnCount: validation.columnCount,
          columns: validation.columns,
          injectedCellsCount: validation.injectedCellsCount,
        },
      },
      { status: 201 }
    );
  },
  { requiredRole: 'editor' }
);
