import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatasetRegistry } from '../../src/server/datasets/registry.ts';

test('DatasetRegistry: tenant isolation, version incrementing, and SHA-256 deduplication', async () => {
  const tmpDir = path.join(os.tmpdir(), `whylab_registry_test_${Date.now()}`);
  const registry = new DatasetRegistry(tmpDir);

  const orgId = 'org_alpha';
  const projectId = 'proj_main';

  // 1. Create dataset
  const dataset = await registry.createDataset(
    orgId,
    projectId,
    'Clinical Evaluation Batch 2026',
    'production_evaluation',
    'Primary test cohort'
  );

  assert.ok(dataset.id.startsWith('ds_'));
  assert.equal(dataset.name, 'Clinical Evaluation Batch 2026');
  assert.equal(dataset.role, 'production_evaluation');
  assert.equal(dataset.organizationId, orgId);

  // 2. Register first version
  const hash1 = 'a1b2c3d4e5f67890123456789012345678901234567890123456789012345678';
  const v1Result = await registry.registerDatasetVersion({
    orgId,
    projectId,
    datasetId: dataset.id,
    objectKey: `org_alpha/proj_main/datasets/${dataset.id}/v1.csv`,
    sha256: hash1,
    rowCount: 500,
    columnCount: 10,
    sizeBytes: 25000,
    schemaJson: { columns: [] },
    summaryJson: { injectedCellsCount: 0, issues: [] },
  });

  assert.equal(v1Result.isDuplicate, false);
  assert.equal(v1Result.version.versionNumber, 1);
  assert.equal(v1Result.version.sha256, hash1);

  // 3. Register identical SHA-256 (Deduplication guarantee)
  const dupResult = await registry.registerDatasetVersion({
    orgId,
    projectId,
    datasetId: dataset.id,
    objectKey: `org_alpha/proj_main/datasets/${dataset.id}/v1_dup.csv`,
    sha256: hash1, // identical hash
    rowCount: 500,
    columnCount: 10,
    sizeBytes: 25000,
    schemaJson: { columns: [] },
    summaryJson: {},
  });

  assert.equal(dupResult.isDuplicate, true);
  assert.equal(dupResult.version.id, v1Result.version.id);
  assert.equal(dupResult.version.versionNumber, 1);

  // 4. Register new version with different hash
  const hash2 = 'f0e1d2c3b4a56789012345678901234567890123456789012345678901234567';
  const v2Result = await registry.registerDatasetVersion({
    orgId,
    projectId,
    datasetId: dataset.id,
    objectKey: `org_alpha/proj_main/datasets/${dataset.id}/v2.csv`,
    sha256: hash2,
    rowCount: 750,
    columnCount: 10,
    sizeBytes: 37500,
    schemaJson: { columns: [] },
    summaryJson: { injectedCellsCount: 0, issues: [] },
  });

  assert.equal(v2Result.isDuplicate, false);
  assert.equal(v2Result.version.versionNumber, 2);

  // 5. List versions
  const versions = await registry.listVersions(orgId, projectId, dataset.id);
  assert.equal(versions.length, 2);

  // 6. Tenant isolation: cross-tenant access rejected
  const crossOrgDataset = await registry.getDataset('org_intruder', projectId, dataset.id);
  assert.equal(crossOrgDataset, null);

  const crossOrgVersions = await registry.listVersions('org_intruder', projectId, dataset.id);
  assert.equal(crossOrgVersions.length, 0);

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
