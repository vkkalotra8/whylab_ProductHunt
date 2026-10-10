import fs from 'node:fs';
import path from 'node:path';
import type { Investigation } from '../domain/types.ts';
import { createDraftInvestigation, deriveInvestigationStage, type InvestigationStage } from './state-machine.ts';
import type { InvestigationArtifact } from '../domain/artifacts.ts';
import { runFlagshipMelanomaInvestigation } from '../diagnostics/flagship-melanoma.ts';

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

// Global in-memory cache for investigations
const investigationMap = new Map<string, Investigation>();

// In-memory cache for raw CSV datasets
const csvMap = new Map<string, string>();

// In-memory cache for multi-artifact sets
const artifactsMap = new Map<string, InvestigationArtifact[]>();

// Lazy-initialized flag for default flagship benchmark
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
      if (file.endsWith('.json')) {
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
 * Returns an investigation by ID, checking memory cache then local disk.
 */
export function getInvestigation(id: string): Investigation | undefined {
  ensureInitialized();

  if (investigationMap.has(id)) {
    return investigationMap.get(id);
  }

  // Attempt direct disk read for single record
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

/**
 * Saves or updates an investigation in memory and persists to disk.
 */
export function saveInvestigation(inv: Investigation, rawCsv?: string): void {
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

/**
 * Stores the raw CSV content associated with an investigation session
 */
export function saveInvestigationCsv(id: string, csvContent: string): void {
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

/**
 * Retrieves the raw CSV associated with an investigation
 */
export function getInvestigationCsv(id: string): string | undefined {
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
  const inv = getInvestigation(id);
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

/**
 * Persists artifacts associated with an investigation session
 */
export function saveInvestigationArtifacts(id: string, artifacts: InvestigationArtifact[]): void {
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

/**
 * Retrieves the artifacts associated with an investigation
 */
export function getInvestigationArtifacts(id: string): InvestigationArtifact[] {
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

/**
 * Creates and saves a new draft investigation.
 */
export function createInvestigation(objective?: string): Investigation {
  ensureInitialized();
  const inv = createDraftInvestigation(objective);
  saveInvestigation(inv);
  return inv;
}

/**
 * Lists summaries of all stored investigations, ordered by latest update.
 */
export function listInvestigations(): InvestigationSummary[] {
  ensureInitialized();

  // Deduplicate aliases (e.g. flagship vs stableFlagship)
  const seenKeys = new Set<string>();
  const list: InvestigationSummary[] = [];

  for (const inv of investigationMap.values()) {
    // Deduplication key
    const key = `${inv.objective}::${inv.createdAt}::${inv.datasets[0]?.name ?? ''}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    const isFixture =
      inv.id.includes('flagship') ||
      inv.datasets[0]?.name?.includes('synthetic') ||
      inv.sources[0]?.kind === 'fixture';

    const artifacts = getInvestigationArtifacts(inv.id);

    list.push({
      id: inv.id,
      objective: inv.objective,
      status: inv.status,
      datasetName: inv.datasets[0]?.name ?? null,
      rowCount: inv.datasets[0]?.rowCount ?? null,
      evidenceCount: inv.evidence.length,
      hypothesisCount: inv.hypotheses.length,
      artifactCount: artifacts.length > 0 ? artifacts.length : undefined,
      stage: deriveInvestigationStage(inv),
      sourceKind: isFixture ? 'fixture' : 'uploaded_file',
      createdAt: inv.createdAt,
      updatedAt: inv.updatedAt,
    });
  }

  return list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

/**
 * Deletes an investigation from both memory and disk.
 */
export function deleteInvestigation(id: string): boolean {
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

/**
 * Clears the in-memory store and resets initialized flag (for test isolation).
 */
export function resetInvestigationStore(): void {
  investigationMap.clear();
  csvMap.clear();
  artifactsMap.clear();
  initialized = false;
}

