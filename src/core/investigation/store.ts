import fs from 'node:fs';
import path from 'node:path';
import type { Investigation } from '../domain/types.ts';
import { createDraftInvestigation, deriveInvestigationStage, type InvestigationStage } from './state-machine.ts';
import type { InvestigationArtifact } from '../domain/artifacts.ts';
import { runFlagshipMelanomaInvestigation } from '../diagnostics/flagship-melanoma.ts';
import { isDatabaseConfigured, query } from '../../server/db/client.ts';

export type InvestigationSummary = {
  id: string;
  objective: string;
  status: Investigation['status'];
  datasetName: string | null;
  rowCount: number | null;
  evidenceCount: number;
  hypothesisCount: number;
  artifactCount?: number;
  stage: InvestigationStage;
  sourceKind: 'uploaded_file' | 'fixture';
  createdAt: string;
  updatedAt: string;
};

export interface InvestigationRepository {
  get(id: string): Investigation | undefined;
  save(inv: Investigation, rawCsv?: string): void;
  list(): InvestigationSummary[];
  delete(id: string): boolean;
  saveCsv(id: string, csv: string): void;
  getCsv(id: string): string | undefined;
  saveArtifacts(id: string, artifacts: InvestigationArtifact[]): void;
  getArtifacts(id: string): InvestigationArtifact[];
}

// Global in-memory cache for investigations
const investigationMap = new Map<string, Investigation>();

// In-memory cache for raw CSV datasets
const csvMap = new Map<string, string>();

// In-memory cache for multi-artifact sets
const artifactsMap = new Map<string, InvestigationArtifact[]>();

let initialized = false;

function getStorageDir(): string | null {
  try {
    if (typeof process !== 'undefined' && process.cwd) {
      const dir = path.join(process.cwd(), '.whylab', 'investigations');
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      return dir;
    }
  } catch {
    // Graceful fallback to in-memory only in restricted environments
  }
  return null;
}

function loadPersistedFromDisk(): void {
  const dir = getStorageDir();
  if (!dir) return;

  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (file.endsWith('.json') && !file.endsWith('_artifacts.json')) {
        const id = file.slice(0, -5);
        if (!investigationMap.has(id)) {
          const content = fs.readFileSync(path.join(dir, file), 'utf8');
          try {
            const parsed = JSON.parse(content) as Investigation;
            if (parsed && parsed.id) {
              investigationMap.set(parsed.id, parsed);
            }
          } catch {
            // Skip corrupted cache entries
          }
        }
      }
    }
  } catch {
    // Non-fatal disk read error
  }
}

function ensureInitialized(): void {
  if (initialized) return;
  initialized = true;

  // First load any persisted investigations from disk
  loadPersistedFromDisk();

  // If flagship isn't loaded yet, run it
  if (!investigationMap.has('investigation_flagship_melanoma')) {
    try {
      const flagship = runFlagshipMelanomaInvestigation();
      const stableFlagship: Investigation = {
        ...flagship,
        id: 'investigation_flagship_melanoma' as Investigation['id'],
      };
      investigationMap.set(flagship.id, flagship);
      investigationMap.set(stableFlagship.id, stableFlagship);
    } catch (err) {
      console.warn('Flagship melanoma fixture initialization deferred:', err);
    }
  }
}

/**
 * FileSystem repository implementation for standalone local development and CI testing.
 */
class FileSystemInvestigationRepository implements InvestigationRepository {
  get(id: string): Investigation | undefined {
    ensureInitialized();

    if (investigationMap.has(id)) {
      return investigationMap.get(id);
    }

    const dir = getStorageDir();
    if (dir) {
      const filePath = path.join(dir, `${id}.json`);
      if (fs.existsSync(filePath)) {
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          const parsed = JSON.parse(content) as Investigation;
          if (parsed && parsed.id) {
            investigationMap.set(parsed.id, parsed);
            return parsed;
          }
        } catch {
          // Fall through
        }
      }
    }

    return undefined;
  }

  save(inv: Investigation, rawCsv?: string): void {
    ensureInitialized();
    investigationMap.set(inv.id, inv);

    if (rawCsv) {
      csvMap.set(inv.id, rawCsv);
    }

    const dir = getStorageDir();
    if (dir) {
      try {
        fs.writeFileSync(path.join(dir, `${inv.id}.json`), JSON.stringify(inv, null, 2), 'utf8');
        if (rawCsv) {
          fs.writeFileSync(path.join(dir, `${inv.id}.csv`), rawCsv, 'utf8');
        }
      } catch (err) {
        console.warn(`Failed to persist investigation ${inv.id} to disk:`, err);
      }
    }
  }

  list(): InvestigationSummary[] {
    ensureInitialized();

    const seenKeys = new Set<string>();
    const list: InvestigationSummary[] = [];

    for (const inv of investigationMap.values()) {
      const key = `${inv.objective}::${inv.createdAt}::${inv.datasets?.[0]?.name ?? ''}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      const isFixture =
        inv.id?.includes('flagship') ||
        inv.datasets?.[0]?.name?.includes('synthetic') ||
        inv.sources?.[0]?.kind === 'fixture';

      const artifacts = this.getArtifacts(inv.id);

      list.push({
        id: inv.id,
        objective: inv.objective,
        status: inv.status,
        datasetName: inv.datasets?.[0]?.name ?? null,
        rowCount: inv.datasets?.[0]?.rowCount ?? null,
        evidenceCount: inv.evidence?.length ?? 0,
        hypothesisCount: inv.hypotheses?.length ?? 0,
        artifactCount: artifacts.length > 0 ? artifacts.length : undefined,
        stage: deriveInvestigationStage(inv),
        sourceKind: isFixture ? 'fixture' : 'uploaded_file',
        createdAt: inv.createdAt,
        updatedAt: inv.updatedAt,
      });
    }

    return list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  delete(id: string): boolean {
    ensureInitialized();
    const deleted = investigationMap.delete(id);
    csvMap.delete(id);
    artifactsMap.delete(id);

    const dir = getStorageDir();
    if (dir) {
      try {
        const jsonPath = path.join(dir, `${id}.json`);
        if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);
        const csvPath = path.join(dir, `${id}.csv`);
        if (fs.existsSync(csvPath)) fs.unlinkSync(csvPath);
        const artPath = path.join(dir, `${id}_artifacts.json`);
        if (fs.existsSync(artPath)) fs.unlinkSync(artPath);
      } catch {
        // Non-fatal
      }
    }

    return deleted;
  }

  saveCsv(id: string, csvContent: string): void {
    csvMap.set(id, csvContent);
    const dir = getStorageDir();
    if (dir) {
      try {
        fs.writeFileSync(path.join(dir, `${id}.csv`), csvContent, 'utf8');
      } catch {
        // Non-fatal
      }
    }
  }

  getCsv(id: string): string | undefined {
    if (csvMap.has(id)) {
      return csvMap.get(id);
    }

    const dir = getStorageDir();
    if (dir) {
      const csvPath = path.join(dir, `${id}.csv`);
      if (fs.existsSync(csvPath)) {
        try {
          const text = fs.readFileSync(csvPath, 'utf8');
          csvMap.set(id, text);
          return text;
        } catch {
          // Fall through
        }
      }
    }

    // Fallback to checking public fixtures
    const inv = this.get(id);
    if (inv && inv.datasets[0]?.name) {
      try {
        const fixturePath = path.join(process.cwd(), 'public', 'fixtures', inv.datasets[0].name);
        if (fs.existsSync(fixturePath)) {
          return fs.readFileSync(fixturePath, 'utf8');
        }
      } catch {
        // Fall through
      }
    }

    return undefined;
  }

  saveArtifacts(id: string, artifacts: InvestigationArtifact[]): void {
    artifactsMap.set(id, artifacts);
    const dir = getStorageDir();
    if (dir) {
      try {
        fs.writeFileSync(path.join(dir, `${id}_artifacts.json`), JSON.stringify(artifacts, null, 2), 'utf8');
      } catch {
        // Non-fatal
      }
    }
  }

  getArtifacts(id: string): InvestigationArtifact[] {
    if (artifactsMap.has(id)) {
      return artifactsMap.get(id)!;
    }

    const dir = getStorageDir();
    if (dir) {
      const artPath = path.join(dir, `${id}_artifacts.json`);
      if (fs.existsSync(artPath)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(artPath, 'utf8'));
          if (Array.isArray(parsed)) {
            artifactsMap.set(id, parsed);
            return parsed;
          }
        } catch {
          // Fall through
        }
      }
    }

    return [];
  }
}

/**
 * PostgreSQL repository implementation for enterprise cloud SaaS deployments.
 * Maintains memory-cache parity while persisting records to relational tables.
 */
class PostgresInvestigationRepository extends FileSystemInvestigationRepository {
  override save(inv: Investigation, rawCsv?: string): void {
    super.save(inv, rawCsv);

    // Async write-through to PostgreSQL when configured
    if (isDatabaseConfigured()) {
      Promise.resolve().then(async () => {
        try {
          await query(
            `INSERT INTO investigations (id, project_id, status, objective, diagnosis_json, updated_at)
             VALUES ($1, $2, $3, $4, $5, NOW())
             ON CONFLICT (id) DO UPDATE
             SET status = EXCLUDED.status, objective = EXCLUDED.objective,
                 diagnosis_json = EXCLUDED.diagnosis_json, updated_at = NOW()`,
            [
              inv.id,
              'prj_default',
              inv.status,
              inv.objective,
              inv.diagnosis ? JSON.stringify(inv.diagnosis) : null,
            ]
          );
        } catch (err) {
          console.warn(`PostgreSQL write deferred for investigation ${inv.id}:`, err);
        }
      });
    }
  }

  override delete(id: string): boolean {
    const res = super.delete(id);

    if (isDatabaseConfigured()) {
      Promise.resolve().then(async () => {
        try {
          await query('DELETE FROM investigations WHERE id = $1', [id]);
        } catch (err) {
          console.warn(`PostgreSQL delete deferred for investigation ${id}:`, err);
        }
      });
    }

    return res;
  }
}

// Active repository instance selection based on environment configuration
let activeRepository: InvestigationRepository = isDatabaseConfigured()
  ? new PostgresInvestigationRepository()
  : new FileSystemInvestigationRepository();

export function getRepository(): InvestigationRepository {
  return activeRepository;
}

export function setRepositoryForTest(repo: InvestigationRepository): void {
  activeRepository = repo;
}

export function getInvestigation(id: string): Investigation | undefined {
  return activeRepository.get(id);
}

export function saveInvestigation(inv: Investigation, rawCsv?: string): void {
  activeRepository.save(inv, rawCsv);
}

export function saveInvestigationCsv(id: string, csvContent: string): void {
  activeRepository.saveCsv(id, csvContent);
}

export function getInvestigationCsv(id: string): string | undefined {
  return activeRepository.getCsv(id);
}

export function saveInvestigationArtifacts(id: string, artifacts: InvestigationArtifact[]): void {
  activeRepository.saveArtifacts(id, artifacts);
}

export function getInvestigationArtifacts(id: string): InvestigationArtifact[] {
  return activeRepository.getArtifacts(id);
}

export function createInvestigation(objective?: string): Investigation {
  ensureInitialized();
  const inv = createDraftInvestigation(objective);
  saveInvestigation(inv);
  return inv;
}

export function listInvestigations(): InvestigationSummary[] {
  return activeRepository.list();
}

export function deleteInvestigation(id: string): boolean {
  return activeRepository.delete(id);
}

export function resetInvestigationStore(): void {
  investigationMap.clear();
  csvMap.clear();
  artifactsMap.clear();
  initialized = false;
  activeRepository = isDatabaseConfigured()
    ? new PostgresInvestigationRepository()
    : new FileSystemInvestigationRepository();
}
