import fs from 'node:fs';
import path from 'node:path';
import { isDatabaseConfigured, query } from '../db/client.ts';
import type {
  DatasetRecord,
  DatasetVersionRecord,
  DatasetRole,
  ColumnSummary,
  ValidationSummary,
} from './types.ts';

export class DatasetRegistry {
  private readonly datasets = new Map<string, DatasetRecord>();
  private readonly versions = new Map<string, DatasetVersionRecord[]>();
  private readonly baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? path.join(process.cwd(), '.whylab', 'datasets');
    if (!fs.existsSync(this.baseDir)) {
      try {
        fs.mkdirSync(this.baseDir, { recursive: true });
      } catch {
        // Ignored if cannot create in restricted environments
      }
    }
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    try {
      const dataFile = path.join(this.baseDir, 'registry.json');
      if (fs.existsSync(dataFile)) {
        const raw = fs.readFileSync(dataFile, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.datasets && Array.isArray(parsed.datasets)) {
          for (const d of parsed.datasets) {
            this.datasets.set(d.id, d);
          }
        }
        if (parsed.versions && typeof parsed.versions === 'object') {
          for (const [datasetId, vList] of Object.entries(parsed.versions)) {
            if (Array.isArray(vList)) {
              this.versions.set(datasetId, vList as DatasetVersionRecord[]);
            }
          }
        }
      }
    } catch {
      // Standalone fallback
    }
  }

  private saveToDisk(): void {
    try {
      const dataFile = path.join(this.baseDir, 'registry.json');
      const payload = {
        datasets: Array.from(this.datasets.values()),
        versions: Object.fromEntries(this.versions.entries()),
      };
      fs.writeFileSync(dataFile, JSON.stringify(payload, null, 2), 'utf-8');
    } catch {
      // Standalone fallback
    }
  }

  async createDataset(
    orgId: string,
    projectId: string,
    name: string,
    role: DatasetRole,
    description?: string
  ): Promise<DatasetRecord> {
    const id = `ds_${crypto.randomUUID().slice(0, 12)}`;
    const now = new Date().toISOString();

    const record: DatasetRecord = {
      id,
      projectId,
      organizationId: orgId,
      name,
      role,
      description,
      createdAt: now,
      updatedAt: now,
    };

    if (isDatabaseConfigured()) {
      try {
        await query(
          `INSERT INTO datasets (id, project_id, name, role, created_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [record.id, record.projectId, record.name, record.role, record.createdAt]
        );
      } catch (err) {
        console.warn('PostgreSQL dataset insertion failed, storing locally:', err);
      }
    }

    this.datasets.set(record.id, record);
    this.versions.set(record.id, []);
    this.saveToDisk();

    return record;
  }

  async getDataset(
    orgId: string,
    projectId: string,
    datasetId: string
  ): Promise<DatasetRecord | null> {
    if (isDatabaseConfigured()) {
      try {
        const res = await query<DatasetRecord>(
          `SELECT d.id, d.project_id AS "projectId", p.organization_id AS "organizationId",
                  d.name, d.role, d.created_at AS "createdAt"
           FROM datasets d
           JOIN projects p ON d.project_id = p.id
           WHERE d.id = $1 AND p.id = $2 AND p.organization_id = $3`,
          [datasetId, projectId, orgId]
        );
        if (res.rows.length > 0) {
          return res.rows[0];
        }
      } catch {
        // Fallback to memory
      }
    }

    const ds = this.datasets.get(datasetId);
    if (!ds) return null;
    if (ds.organizationId !== orgId || ds.projectId !== projectId) {
      return null;
    }
    return ds;
  }

  async getDatasetByName(
    orgId: string,
    projectId: string,
    name: string
  ): Promise<DatasetRecord | null> {
    for (const ds of this.datasets.values()) {
      if (ds.organizationId === orgId && ds.projectId === projectId && ds.name.toLowerCase() === name.toLowerCase()) {
        return ds;
      }
    }
    return null;
  }

  async listDatasets(orgId: string, projectId: string): Promise<DatasetRecord[]> {
    if (isDatabaseConfigured()) {
      try {
        const res = await query<DatasetRecord>(
          `SELECT d.id, d.project_id AS "projectId", p.organization_id AS "organizationId",
                  d.name, d.role, d.created_at AS "createdAt"
           FROM datasets d
           JOIN projects p ON d.project_id = p.id
           WHERE p.id = $1 AND p.organization_id = $2
           ORDER BY d.created_at DESC`,
          [projectId, orgId]
        );
        return res.rows;
      } catch {
        // Fallback to memory
      }
    }

    const list: DatasetRecord[] = [];
    for (const ds of this.datasets.values()) {
      if (ds.organizationId === orgId && ds.projectId === projectId) {
        list.push(ds);
      }
    }
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async registerDatasetVersion(params: {
    orgId: string;
    projectId: string;
    datasetId: string;
    objectKey: string;
    sha256: string;
    rowCount: number;
    columnCount: number;
    sizeBytes: number;
    schemaJson: { columns: ColumnSummary[] };
    summaryJson: ValidationSummary | any;
  }): Promise<{ dataset: DatasetRecord; version: DatasetVersionRecord; isDuplicate: boolean }> {
    const dataset = await this.getDataset(params.orgId, params.projectId, params.datasetId);
    if (!dataset) {
      throw new Error(`Dataset ${params.datasetId} not found in project ${params.projectId}`);
    }

    const existingVersions = this.versions.get(params.datasetId) ?? [];

    // Deduplication check: if identical SHA-256 hash already exists in this dataset
    const duplicate = existingVersions.find((v) => v.sha256 === params.sha256);
    if (duplicate) {
      return { dataset, version: duplicate, isDuplicate: true };
    }

    const versionNumber = existingVersions.length + 1;
    const versionId = `dsv_${crypto.randomUUID().slice(0, 12)}`;
    const now = new Date().toISOString();

    const versionRecord: DatasetVersionRecord = {
      id: versionId,
      datasetId: params.datasetId,
      versionNumber,
      objectKey: params.objectKey,
      sha256: params.sha256,
      rowCount: params.rowCount,
      columnCount: params.columnCount,
      sizeBytes: params.sizeBytes,
      schemaJson: params.schemaJson,
      summaryJson: {
        rowCount: params.rowCount,
        columnCount: params.columnCount,
        injectedCellsCount: params.summaryJson?.injectedCellsCount || 0,
        issues: params.summaryJson?.issues || [],
      },
      createdAt: now,
    };

    if (isDatabaseConfigured()) {
      try {
        await query(
          `INSERT INTO dataset_versions (id, dataset_id, object_key, sha256, row_count, schema_json, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            versionRecord.id,
            versionRecord.datasetId,
            versionRecord.objectKey,
            versionRecord.sha256,
            versionRecord.rowCount,
            JSON.stringify(versionRecord.schemaJson),
            versionRecord.createdAt,
          ]
        );
      } catch (err) {
        console.warn('PostgreSQL dataset version insertion failed, storing locally:', err);
      }
    }

    existingVersions.push(versionRecord);
    this.versions.set(params.datasetId, existingVersions);
    dataset.updatedAt = now;
    this.datasets.set(dataset.id, dataset);
    this.saveToDisk();

    return { dataset, version: versionRecord, isDuplicate: false };
  }

  async getVersion(
    orgId: string,
    projectId: string,
    datasetId: string,
    versionId: string
  ): Promise<DatasetVersionRecord | null> {
    const ds = await this.getDataset(orgId, projectId, datasetId);
    if (!ds) return null;

    const list = this.versions.get(datasetId) ?? [];
    return list.find((v) => v.id === versionId) ?? null;
  }

  async listVersions(
    orgId: string,
    projectId: string,
    datasetId: string
  ): Promise<DatasetVersionRecord[]> {
    const ds = await this.getDataset(orgId, projectId, datasetId);
    if (!ds) return [];

    return this.versions.get(datasetId) ?? [];
  }

  resetForTesting(): void {
    this.datasets.clear();
    this.versions.clear();
    try {
      const dataFile = path.join(this.baseDir, 'registry.json');
      if (fs.existsSync(dataFile)) {
        fs.unlinkSync(dataFile);
      }
    } catch {
      // Ignored
    }
  }
}

// Global registry instance
let registryInstance: DatasetRegistry | null = null;

export function getDatasetRegistry(): DatasetRegistry {
  if (!registryInstance) {
    registryInstance = new DatasetRegistry();
  }
  return registryInstance;
}

export function setDatasetRegistryForTest(reg: DatasetRegistry | null): void {
  registryInstance = reg;
}
