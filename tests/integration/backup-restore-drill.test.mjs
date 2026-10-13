import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import crypto from 'node:crypto';
import { createBackupSnapshot, restoreFromSnapshot } from '../../src/server/backup/backup-service.ts';
import { getDatasetRegistry } from '../../src/server/datasets/registry.ts';
import { getStorageProvider } from '../../src/server/storage/index.ts';
import { getRepairRegistry } from '../../src/server/repair/repair-registry.ts';
import { getMonitorEngine } from '../../src/server/monitoring/monitor-engine.ts';
import { getInvestigationQueue } from '../../src/server/queue/investigation-queue.ts';
import { getInvestigationWorker } from '../../src/server/worker/investigation-worker.ts';
import { getAuditEvents, _resetAuditEventsForTest } from '../../src/server/audit/audit-logger.ts';

const fixturesDir = join(process.cwd(), 'public', 'fixtures');

test('disaster recovery drill: catastrophic database crash restore with zero data loss', async () => {
  // 1. Initial State Setup
  _resetAuditEventsForTest();
  getDatasetRegistry().resetForTesting();
  getRepairRegistry().resetForTesting();
  getMonitorEngine().resetForTesting();

  const orgId = 'org_disaster_recovery_hospital';
  const projectId = 'proj_cardiology_triage';
  const actorId = 'usr_recovery_lead';

  // Seed dataset
  const csvContent = readFileSync(join(fixturesDir, 'melanoma-synthetic.csv'), 'utf8');
  const sha256 = crypto.createHash('sha256').update(Buffer.from(csvContent, 'utf8')).digest('hex');

  const datasetRegistry = getDatasetRegistry();
  const dataset = await datasetRegistry.createDataset(orgId, projectId, 'Cardiology ECG Stream', 'production_evaluation');
  const storage = getStorageProvider();
  const objectKey = `org_${orgId}/proj_${projectId}/datasets/${dataset.id}/ecg_stream_v1.csv`;
  await storage.putObject(objectKey, Buffer.from(csvContent, 'utf8'), 'text/csv');

  const { version } = await datasetRegistry.registerDatasetVersion({
    orgId,
    projectId,
    datasetId: dataset.id,
    objectKey,
    sha256,
    rowCount: 100,
    columnCount: 3,
    sizeBytes: Buffer.byteLength(csvContent),
    schemaJson: { columns: [] },
    summaryJson: {},
  });

  // Seed queued investigation job & run through worker
  const queue = getInvestigationQueue();
  const worker = getInvestigationWorker();
  const job = await queue.enqueue({
    investigationId: 'inv_drill_test_001',
    organizationId: orgId,
    projectId,
    datasetId: dataset.id,
    csvContent,
    objective: 'Investigate ECG baseline reliability',
    offlineOnly: true,
  });

  await worker.executeJob(job);
  const completedJob = await queue.getJob(job.id);
  assert.equal(completedJob?.status, 'completed');

  // Seed approved repair policy
  const repairRegistry = getRepairRegistry();
  const policy = await repairRegistry.createPolicy({
    organizationId: orgId,
    projectId,
    investigationId: 'inv_drill_test_001',
    operatingThreshold: 0.25,
    positiveLabel: '1',
    costWeights: { falseNegative: 15, falsePositive: 1 },
    targetRecall: 0.92,
    createdBy: actorId,
  });

  const { policy: approvedPolicy } = await repairRegistry.approvePolicy(policy.id, orgId, {
    approvedBy: actorId,
    approvedByName: 'Chief Cardiologist',
    comments: 'Clinical sign-off completed for cardiology deployment assist.',
    expectedVersion: 1,
  });
  assert.equal(approvedPolicy.status, 'approved');

  // Seed monitor rule & alert
  const monitorEngine = getMonitorEngine();
  const rule = await monitorEngine.createRule({
    organizationId: orgId,
    projectId,
    name: 'Cardiology Drift Guard',
    referenceCsvContent: csvContent,
    conditions: [{ metric: 'ks_drift', column: 'y_probability', operator: 'gt', threshold: 0.1, severity: 'warning' }],
  });

  const evalResult = await monitorEngine.evaluateBatch(
    rule.id,
    orgId,
    `sample_id,y_true,y_pred,y_probability\ns1,1,0,0.01\ns2,1,0,0.02\n`,
    'drift_batch.csv'
  );
  assert.ok(evalResult.alerts.length >= 1);

  // 2. Capture baseline counts and create backup snapshot
  const { events: preCrashAudit } = await getAuditEvents(orgId);
  assert.ok(preCrashAudit.length >= 3);

  const snapshot = await createBackupSnapshot(orgId);
  assert.equal(snapshot.version, '1.0');
  assert.ok(snapshot.manifestChecksum);
  assert.equal(snapshot.manifest.length, 9);
  assert.ok(snapshot.data.datasets.length >= 1);
  assert.ok(snapshot.data.repairPolicies.length >= 1);

  // 3. Simulate Catastrophic Database Crash & Wipe State
  _resetAuditEventsForTest();
  datasetRegistry.resetForTesting();
  repairRegistry.resetForTesting();
  monitorEngine.resetForTesting();
  queue.jobs?.clear?.();

  // Verify state is completely wiped
  const wipedDatasets = await datasetRegistry.listDatasets(orgId, projectId);
  assert.equal(wipedDatasets.length, 0, 'Database wipe must clear datasets');
  const wipedPolicies = await repairRegistry.listPolicies(orgId, projectId);
  assert.equal(wipedPolicies.length, 0, 'Database wipe must clear repair policies');
  const { events: wipedAudit } = await getAuditEvents(orgId);
  assert.equal(wipedAudit.length, 0, 'Database wipe must clear audit events');

  // 4. Execute Disaster Recovery Restore from Snapshot
  const restoreReport = await restoreFromSnapshot(snapshot);
  assert.equal(restoreReport.verified, true);
  assert.ok(restoreReport.restoredAt);

  // Verify all manifest entities matched their checksums
  for (const item of restoreReport.manifestVerification) {
    assert.equal(item.matches, true, `Checksum for ${item.entityType} must match`);
    assert.equal(item.expectedChecksum, item.computedChecksum);
  }

  // 5. Verify Zero Data Loss Verification Post-Crash
  const restoredDatasets = await datasetRegistry.listDatasets(orgId, projectId);
  assert.equal(restoredDatasets.length, 1);
  assert.equal(restoredDatasets[0].id, dataset.id);
  assert.equal(restoredDatasets[0].name, 'Cardiology ECG Stream');

  const restoredVersions = await datasetRegistry.listVersions(orgId, projectId, dataset.id);
  assert.equal(restoredVersions.length, 1);
  assert.equal(restoredVersions[0].sha256, sha256);
  assert.equal(restoredVersions[0].rowCount, 100);

  // Verify object storage content preserved
  const restoredBlob = await storage.getObject(objectKey);
  assert.ok(restoredBlob);
  const restoredHash = crypto.createHash('sha256').update(restoredBlob).digest('hex');
  assert.equal(restoredHash, sha256);

  // Verify repair policies restored with approval signatures
  const restoredPolicy = await repairRegistry.getPolicy(policy.id);
  assert.ok(restoredPolicy);
  assert.equal(restoredPolicy.status, 'approved');
  assert.equal(restoredPolicy.approval?.approvedByName, 'Chief Cardiologist');
  assert.equal(restoredPolicy.approval?.automatedDeploymentProhibited, true);
  assert.ok(restoredPolicy.codeSnippets.python.includes('AUTOMATED_DEPLOYMENT_PROHIBITED: bool = True'));

  // Verify monitor rules & alerts restored
  const restoredRules = await monitorEngine.listRules(orgId, projectId);
  assert.equal(restoredRules.length, 1);
  assert.equal(restoredRules[0].id, rule.id);

  const restoredAlerts = await monitorEngine.listAlerts(orgId);
  assert.ok(restoredAlerts.length >= 1);

  // Verify audit logs restored plus recovery event recorded
  const { events: postRestoreAudit } = await getAuditEvents(orgId);
  assert.ok(postRestoreAudit.length >= preCrashAudit.length);
  assert.ok(postRestoreAudit.some((a) => a.action === 'BACKUP_RESTORE_COMPLETED'));
});

test('disaster recovery drill: rejects tampered or corrupt backup snapshots', async () => {
  _resetAuditEventsForTest();
  const snapshot = await createBackupSnapshot('org_tamper_test');

  // 1. Tamper single byte in entity data
  const corruptedDataSnapshot = JSON.parse(JSON.stringify(snapshot));
  corruptedDataSnapshot.data.datasets.push({
    id: 'ds_injected_hacker_payload',
    projectId: 'p1',
    organizationId: 'org_tamper_test',
    name: 'Injected Dataset',
    role: 'production_evaluation',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  await assert.rejects(
    async () => {
      await restoreFromSnapshot(corruptedDataSnapshot);
    },
    /Checksum mismatch for datasets/
  );

  // 2. Tamper manifest without recalculating manifestChecksum
  const corruptedManifestSnapshot = JSON.parse(JSON.stringify(snapshot));
  corruptedManifestSnapshot.manifest[0].count = 9999;

  await assert.rejects(
    async () => {
      await restoreFromSnapshot(corruptedManifestSnapshot);
    },
    /Manifest checksum mismatch/
  );
});
