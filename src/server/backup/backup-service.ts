import crypto from 'node:crypto';
import { getDatasetRegistry } from '../datasets/registry.ts';
import type { DatasetRecord, DatasetVersionRecord } from '../datasets/types.ts';
import { getStorageProvider } from '../storage/index.ts';
import { getRepairRegistry } from '../repair/repair-registry.ts';
import type { RepairPolicy } from '../repair/types.ts';
import { getMonitorEngine } from '../monitoring/monitor-engine.ts';
import type { MonitorRule, MonitorAlert } from '../monitoring/types.ts';
import { getAuditEvents, recordAuditEvent, _resetAuditEventsForTest, type AuditEvent } from '../audit/audit-logger.ts';
import { getInvestigationQueue } from '../queue/investigation-queue.ts';
import type { InvestigationJob } from '../queue/types.ts';
import { listInvestigations, getInvestigation, saveInvestigation } from '../../core/investigation/store.ts';
import type { Investigation } from '../../core/domain/types.ts';

export interface BackupEntityManifest {
  entityType: string;
  count: number;
  sha256: string;
}

export interface BackupSnapshot {
  version: '1.0';
  createdAt: string;
  organizationId?: string;
  data: {
    datasets: DatasetRecord[];
    datasetVersions: Record<string, DatasetVersionRecord[]>;
    storageObjects: Record<string, string>; // base64 encoded
    investigations: Investigation[];
    jobs: InvestigationJob[];
    repairPolicies: RepairPolicy[];
    monitorRules: MonitorRule[];
    monitorAlerts: MonitorAlert[];
    auditEvents: AuditEvent[];
  };
  manifest: BackupEntityManifest[];
  manifestChecksum: string;
}

export interface RestoreReport {
  restoredAt: string;
  verified: boolean;
  restoredCounts: Record<string, number>;
  manifestVerification: {
    entityType: string;
    expectedChecksum: string;
    computedChecksum: string;
    matches: boolean;
  }[];
}

function computeJsonHash(data: unknown): string {
  const serialized = JSON.stringify(data);
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

/**
 * Creates an integrity-verified, cryptographic backup snapshot of the platform or tenant state.
 */
export async function createBackupSnapshot(organizationId?: string): Promise<BackupSnapshot> {
  const datasetRegistry = getDatasetRegistry();
  const repairRegistry = getRepairRegistry();
  const monitorEngine = getMonitorEngine();
  const storage = getStorageProvider();
  const queue = getInvestigationQueue();

  // 1. Datasets & versions
  let datasets: DatasetRecord[] = [];
  if (organizationId) {
    // Collect for single tenant
    const all = Array.from((datasetRegistry as any).datasets?.values?.() || []) as DatasetRecord[];
    datasets = all.filter((d) => d.organizationId === organizationId);
  } else {
    datasets = Array.from((datasetRegistry as any).datasets?.values?.() || []) as DatasetRecord[];
  }

  const datasetVersions: Record<string, DatasetVersionRecord[]> = {};
  const storageObjects: Record<string, string> = {};

  for (const ds of datasets) {
    const versions = (await datasetRegistry.listVersions(ds.organizationId, ds.projectId, ds.id)) || [];
    datasetVersions[ds.id] = versions;

    // Fetch storage objects
    for (const v of versions) {
      if (v.objectKey) {
        const buffer = await storage.getObject(v.objectKey);
        if (buffer) {
          storageObjects[v.objectKey] = buffer.toString('base64');
        }
      }
    }
  }

  // 2. Investigations
  let investigations: Investigation[] = [];
  try {
    const summaries = listInvestigations();
    for (const s of summaries) {
      const full = getInvestigation(s.id);
      if (full) {
        if (!organizationId || (full as any).organizationId === organizationId) {
          investigations.push(full);
        }
      }
    }
  } catch {
    // Empty store fallback
  }

  // 3. Queue jobs
  const allJobs = Array.from((queue as any).jobs?.values?.() || []) as InvestigationJob[];
  const jobs = organizationId ? allJobs.filter((j) => j.data.organizationId === organizationId) : allJobs;

  // 4. Repair Policies
  const allPolicies = Array.from((repairRegistry as any).policies?.values?.() || []) as RepairPolicy[];
  const repairPolicies = organizationId
    ? allPolicies.filter((p) => p.organizationId === organizationId)
    : allPolicies;

  // 5. Monitor rules & alerts
  const allRules = Array.from((monitorEngine as any).rules?.values?.() || []) as MonitorRule[];
  const monitorRules = organizationId
    ? allRules.filter((r) => r.organizationId === organizationId)
    : allRules;

  const allAlerts = Array.from((monitorEngine as any).alerts?.values?.() || []) as MonitorAlert[];
  const monitorAlerts = organizationId
    ? allAlerts.filter((a) => a.organizationId === organizationId)
    : allAlerts;

  // 6. Audit events
  const { events: allAudit } = await getAuditEvents(organizationId || '', { limit: 10000 });
  const auditEvents = allAudit;

  const dataPayload = {
    datasets,
    datasetVersions,
    storageObjects,
    investigations,
    jobs,
    repairPolicies,
    monitorRules,
    monitorAlerts,
    auditEvents,
  };

  const manifest: BackupEntityManifest[] = [
    { entityType: 'datasets', count: datasets.length, sha256: computeJsonHash(datasets) },
    { entityType: 'datasetVersions', count: Object.values(datasetVersions).flat().length, sha256: computeJsonHash(datasetVersions) },
    { entityType: 'storageObjects', count: Object.keys(storageObjects).length, sha256: computeJsonHash(storageObjects) },
    { entityType: 'investigations', count: investigations.length, sha256: computeJsonHash(investigations) },
    { entityType: 'jobs', count: jobs.length, sha256: computeJsonHash(jobs) },
    { entityType: 'repairPolicies', count: repairPolicies.length, sha256: computeJsonHash(repairPolicies) },
    { entityType: 'monitorRules', count: monitorRules.length, sha256: computeJsonHash(monitorRules) },
    { entityType: 'monitorAlerts', count: monitorAlerts.length, sha256: computeJsonHash(monitorAlerts) },
    { entityType: 'auditEvents', count: auditEvents.length, sha256: computeJsonHash(auditEvents) },
  ];

  const manifestChecksum = computeJsonHash(manifest);

  const snapshot: BackupSnapshot = {
    version: '1.0',
    createdAt: new Date().toISOString(),
    organizationId,
    data: dataPayload,
    manifest,
    manifestChecksum,
  };

  return snapshot;
}

/**
 * Restores system state from an integrity-verified backup snapshot.
 */
export async function restoreFromSnapshot(snapshot: BackupSnapshot): Promise<RestoreReport> {
  // 1. Verify manifest cryptographic integrity
  const computedManifestChecksum = computeJsonHash(snapshot.manifest);
  if (computedManifestChecksum !== snapshot.manifestChecksum) {
    throw new Error(
      `Disaster recovery restore rejected: Manifest checksum mismatch! Backup may be corrupt or tampered.`
    );
  }

  // 2. Verify each entity type checksum against manifest
  const manifestVerification: RestoreReport['manifestVerification'] = [];
  for (const item of snapshot.manifest) {
    const rawData = (snapshot.data as any)[item.entityType];
    const computed = computeJsonHash(rawData);
    const matches = computed === item.sha256;
    manifestVerification.push({
      entityType: item.entityType,
      expectedChecksum: item.sha256,
      computedChecksum: computed,
      matches,
    });

    if (!matches) {
      throw new Error(
        `Disaster recovery restore rejected: Checksum mismatch for ${item.entityType}! Expected ${item.sha256}, got ${computed}.`
      );
    }
  }

  // 3. Restore Storage Objects
  const storage = getStorageProvider();
  for (const [key, b64] of Object.entries(snapshot.data.storageObjects)) {
    const buffer = Buffer.from(b64, 'base64');
    await storage.putObject(key, buffer, 'text/csv');
  }

  // 4. Restore Dataset Registry
  const datasetRegistry = getDatasetRegistry() as any;
  datasetRegistry.resetForTesting();
  for (const ds of snapshot.data.datasets) {
    datasetRegistry.datasets.set(ds.id, ds);
  }
  for (const [dsId, vList] of Object.entries(snapshot.data.datasetVersions)) {
    datasetRegistry.versions.set(dsId, vList);
  }

  // 5. Restore Investigations
  for (const inv of snapshot.data.investigations) {
    await saveInvestigation(inv);
  }

  // 6. Restore Queue Jobs
  const queue = getInvestigationQueue() as any;
  for (const j of snapshot.data.jobs) {
    queue.jobs.set(j.id, j);
  }

  // 7. Restore Repair Policies
  const repairRegistry = getRepairRegistry() as any;
  repairRegistry.resetForTesting();
  for (const p of snapshot.data.repairPolicies) {
    repairRegistry.policies.set(p.id, p);
  }

  // 8. Restore Monitor Rules & Alerts
  const monitorEngine = getMonitorEngine() as any;
  monitorEngine.resetForTesting();
  for (const r of snapshot.data.monitorRules) {
    monitorEngine.rules.set(r.id, r);
  }
  for (const a of snapshot.data.monitorAlerts) {
    monitorEngine.alerts.set(a.id, a);
  }

  // 9. Restore Audit Logs
  _resetAuditEventsForTest();
  for (const audit of snapshot.data.auditEvents) {
    await recordAuditEvent({
      organizationId: audit.organizationId,
      actorId: audit.actorId,
      action: audit.action,
      objectType: audit.objectType,
      objectId: audit.objectId,
      metadata: audit.metadata,
    });
  }

  // Record RESTORE_COMPLETED audit event
  await recordAuditEvent({
    organizationId: snapshot.organizationId || 'system',
    actorId: 'disaster_recovery_engine',
    action: 'BACKUP_RESTORE_COMPLETED',
    objectType: 'system_backup',
    objectId: snapshot.manifestChecksum.slice(0, 16),
    metadata: {
      snapshotCreatedAt: snapshot.createdAt,
      restoredEntities: snapshot.manifest.map((m) => ({ type: m.entityType, count: m.count })),
    },
  });

  return {
    restoredAt: new Date().toISOString(),
    verified: true,
    restoredCounts: Object.fromEntries(snapshot.manifest.map((m) => [m.entityType, m.count])),
    manifestVerification,
  };
}
