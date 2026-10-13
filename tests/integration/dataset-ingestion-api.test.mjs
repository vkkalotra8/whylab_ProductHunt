import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createSessionToken } from '../../src/server/auth/session.ts';
import { POST as initUpload } from '../../src/app/api/v1/datasets/uploads/route.ts';
import { PUT as uploadRawFile } from '../../src/app/api/v1/storage/upload/[token]/route.ts';
import { POST as completeUpload } from '../../src/app/api/v1/datasets/uploads/[id]/complete/route.ts';
import { GET as listDatasets } from '../../src/app/api/v1/datasets/route.ts';
import { GET as getVersion } from '../../src/app/api/v1/datasets/[id]/versions/[versionId]/route.ts';
import { getAuditEvents, _resetAuditEventsForTest } from '../../src/server/audit/audit-logger.ts';
import { getDatasetRegistry } from '../../src/server/datasets/registry.ts';

const TEST_SECRET = 'whylab-dev-insecure-secret-key-32-chars-min!';

test('Dataset Ingestion API: full presigned upload, validation, deduplication, and inspection cycle', async () => {
  _resetAuditEventsForTest();
  getDatasetRegistry().resetForTesting();

  const orgId = 'org_biomed';
  const projectId = 'proj_oncology';

  const editorToken = await createSessionToken(
    {
      sub: 'usr_editor_1',
      email: 'dr.smith@biomed.org',
      name: 'Dr. Smith',
      organizationId: orgId,
      role: 'editor',
    },
    TEST_SECRET
  );

  const viewerToken = await createSessionToken(
    {
      sub: 'usr_viewer_1',
      email: 'auditor@biomed.org',
      name: 'Auditor Jane',
      organizationId: orgId,
      role: 'viewer',
    },
    TEST_SECRET
  );

  // 1. Viewer attempt to initiate upload should be rejected (403 Forbidden)
  const viewerInitReq = new Request('http://localhost:3000/api/v1/datasets/uploads', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${viewerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      projectId,
      datasetName: 'Skin Lesion Batch 2026',
      filename: 'evaluation.csv',
      role: 'production_evaluation',
    }),
  });

  const viewerInitRes = await initUpload(viewerInitReq);
  assert.equal(viewerInitRes.status, 403);
  const viewerInitErr = await viewerInitRes.json();
  assert.equal(viewerInitErr.code, 'FORBIDDEN');

  // 2. Editor initiates upload
  const editorInitReq = new Request('http://localhost:3000/api/v1/datasets/uploads', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${editorToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      projectId,
      datasetName: 'Skin Lesion Batch 2026',
      filename: 'evaluation.csv',
      role: 'production_evaluation',
    }),
  });

  const editorInitRes = await initUpload(editorInitReq);
  assert.equal(editorInitRes.status, 200);
  const initData = await editorInitRes.json();

  assert.ok(initData.uploadId.startsWith('upl_'));
  assert.ok(initData.datasetId.startsWith('ds_'));
  assert.ok(initData.versionId.startsWith('dsv_'));
  assert.ok(initData.objectKey.startsWith(`org_${orgId}/proj_${projectId}/`));
  assert.ok(initData.presignedUrl.includes('/api/v1/storage/upload/'));

  // Extract signed token from URL
  const signedToken = initData.presignedUrl.split('/api/v1/storage/upload/')[1];

  // 3. Raw file upload via PUT receiver
  const sampleCsv = [
    'patient_id,actual,prediction,probability,age,site',
    'p001,malignant,malignant,0.91,52,clinic_a',
    'p002,benign,benign,0.08,44,clinic_a',
    'p003,malignant,benign,0.42,67,clinic_b',
    'p004,benign,malignant,0.68,39,clinic_b',
  ].join('\n');

  const uploadReq = new Request(`http://localhost:3000/api/v1/storage/upload/${signedToken}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'text/csv',
    },
    body: sampleCsv,
  });

  const uploadRes = await uploadRawFile(uploadReq, {
    params: Promise.resolve({ token: signedToken }),
  });
  assert.equal(uploadRes.status, 200);
  const uploadResult = await uploadRes.json();
  assert.equal(uploadResult.ok, true);
  assert.equal(uploadResult.key, initData.objectKey);

  // 4. Complete upload
  const expectedSha256 = crypto.createHash('sha256').update(Buffer.from(sampleCsv)).digest('hex');

  const completeReq = new Request('http://localhost:3000/api/v1/datasets/uploads/upl_123/complete', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${editorToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      projectId,
      datasetId: initData.datasetId,
      objectKey: initData.objectKey,
      expectedSha256,
    }),
  });

  const completeRes = await completeUpload(completeReq);
  assert.equal(completeRes.status, 201);
  const completeData = await completeRes.json();

  assert.equal(completeData.isDuplicate, false);
  assert.equal(completeData.dataset.id, initData.datasetId);
  assert.equal(completeData.version.versionNumber, 1);
  assert.equal(completeData.version.rowCount, 4);
  assert.equal(completeData.version.columnCount, 6);
  assert.equal(completeData.version.sha256, expectedSha256);
  assert.equal(completeData.validation.isValid, true);

  // 5. Complete identical file upload triggers deduplication
  const duplicateReq = new Request('http://localhost:3000/api/v1/datasets/uploads/upl_123/complete', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${editorToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      projectId,
      datasetId: initData.datasetId,
      objectKey: initData.objectKey,
    }),
  });

  const dupRes = await completeUpload(duplicateReq);
  assert.equal(dupRes.status, 201);
  const dupData = await dupRes.json();
  assert.equal(dupData.isDuplicate, true);
  assert.equal(dupData.version.id, completeData.version.id);

  // 6. List datasets for project
  const listReq = new Request(`http://localhost:3000/api/v1/datasets?projectId=${projectId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${viewerToken}`,
    },
  });

  const listRes = await listDatasets(listReq);
  assert.equal(listRes.status, 200);
  const listData = await listRes.json();
  assert.equal(listData.organizationId, orgId);
  assert.equal(listData.count, 1);
  assert.equal(listData.datasets[0].id, initData.datasetId);
  assert.equal(listData.datasets[0].versionCount, 1);
  assert.equal(listData.datasets[0].latestVersion.sha256, expectedSha256);

  // 7. Inspect specific version details
  const getVersionReq = new Request(
    `http://localhost:3000/api/v1/datasets/${initData.datasetId}/versions/${completeData.version.id}?projectId=${projectId}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${viewerToken}`,
      },
    }
  );

  const getVersionRes = await getVersion(getVersionReq, {
    params: Promise.resolve({
      id: initData.datasetId,
      versionId: completeData.version.id,
    }),
  });
  assert.equal(getVersionRes.status, 200);
  const inspectData = await getVersionRes.json();
  assert.equal(inspectData.version.id, completeData.version.id);
  assert.equal(inspectData.version.sha256, expectedSha256);
  assert.equal(inspectData.version.rowCount, 4);

  // 8. Verify audit events recorded
  const { events } = await getAuditEvents(orgId);
  const createdEvent = events.find((e) => e.action === 'DATASET_VERSION_CREATED');
  assert.ok(createdEvent);
  assert.equal(createdEvent.actorId, 'usr_editor_1');
  assert.equal(createdEvent.objectType, 'dataset_version');
  assert.equal(createdEvent.objectId, completeData.version.id);
});
