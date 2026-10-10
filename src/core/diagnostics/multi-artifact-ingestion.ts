import { parseCsv } from './csv.ts';
import { createId, id, type Id } from '../domain/primitives.ts';
import {
  type InvestigationArtifact,
  type ArtifactRole,
  type ArtifactFormat,
  type TabularSchema,
  type TabularColumnSummary,
  type DetectedColumnType,
  validateArtifactRelationships,
  type MultiArtifactValidationResult,
} from '../domain/artifacts.ts';
import { parseTrainingLog } from './training-logs.ts';
import { parseModelMetadata, checkUnsafeModelBinary } from './model-metadata.ts';
import { EVALUATION_LIMITS } from './evaluation-ingestion.ts';

export { checkUnsafeModelBinary };

const missing = (value: string | null | undefined) =>
  value === null || value === undefined || !value || /^(null|na|nan|n\/a)$/i.test(String(value).trim());
const numeric = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

/**
 * Detects artifact format from filename and initial text content
 */
export function detectArtifactFormat(filename: string, content: string): ArtifactFormat {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.tsv')) return 'tsv';
  if (lower.endsWith('.jsonl') || lower.endsWith('.ndjson')) return 'jsonl';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.log')) return 'text_log';
  if (lower.endsWith('.csv')) return 'csv';

  // Content inspection fallback
  const trimmed = content.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      if (trimmed.includes('\n{"') || trimmed.includes('\n{ "')) {
        return 'jsonl';
      }
    }
  }

  if (trimmed.includes('\t') && !trimmed.includes(',')) return 'tsv';
  return 'csv';
}

/**
 * Infers likely role of the artifact from its filename and content
 */
export function inferArtifactRole(filename: string, content: string, format: ArtifactFormat): ArtifactRole {
  const lower = filename.toLowerCase();

  // Model metadata clues
  if (
    lower.includes('config') ||
    lower.includes('metadata') ||
    lower.includes('hyperparam') ||
    lower.includes('model_spec')
  ) {
    return 'model_metadata';
  }

  // Training log clues
  if (
    format === 'text_log' ||
    lower.includes('train.log') ||
    lower.includes('training.log') ||
    lower.includes('fit.log') ||
    lower.includes('metrics.log')
  ) {
    return 'training_log';
  }

  // Text content heuristics for logs
  if (lower.endsWith('.txt')) {
    if (/(?:epoch\s+\d+|step\s+\d+|val_loss|training loss|train_loss)/i.test(content)) {
      return 'training_log';
    }
  }

  // Tabular split clues
  if (lower.includes('train') && !lower.includes('log')) return 'training';
  if (lower.includes('val') || lower.includes('valid')) return 'validation';
  if (lower.includes('ref') || lower.includes('baseline')) return 'reference';
  if (lower.includes('prod') || lower.includes('serving') || lower.includes('inference')) return 'production';
  if (lower.includes('pred') || lower.includes('score') || lower.includes('output')) return 'predictions';
  if (lower.includes('label') || lower.includes('truth') || lower.includes('actual') || lower.includes('ground')) {
    return 'ground_truth';
  }
  if (lower.includes('test') || lower.includes('eval')) return 'evaluation';

  // JSON heuristic
  if (format === 'json') {
    const trimmed = content.trim();
    if (trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      return 'model_metadata';
    }
  }

  return 'evaluation';
}

/**
 * Extracts tabular schema and summaries from rows of strings
 */
function extractTabularSchema(records: string[][]): TabularSchema {
  const [headers, ...data] = records;
  if (!headers || headers.length === 0) {
    throw new Error('Data contains no column headers.');
  }

  const sampleData = data.slice(0, 100);
  const columnSummaries: TabularColumnSummary[] = headers.map((colName, colIdx) => {
    const rawValues = sampleData.map((r) => r[colIdx] ?? '');
    const nonMissing = rawValues.filter((v) => !missing(v));
    const uniqueVals = Array.from(new Set(nonMissing));
    const isNum =
      nonMissing.length > 0 &&
      nonMissing.every((v) => numeric.test(v) && Number.isFinite(Number(v)));

    const numVals = isNum ? nonMissing.map((v) => Number(v)) : [];
    const min = numVals.length > 0 ? Math.min(...numVals) : null;
    const max = numVals.length > 0 ? Math.max(...numVals) : null;

    let detectedType: DetectedColumnType = 'categorical';
    if (nonMissing.length === 0) {
      detectedType = 'empty';
    } else if (isNum) {
      detectedType = 'numeric';
    } else if (
      uniqueVals.length <= 2 &&
      uniqueVals.every((v) => /^(true|false|0|1|yes|no)$/i.test(v))
    ) {
      detectedType = 'boolean';
    } else if (colName.toLowerCase().includes('time') || colName.toLowerCase().includes('date')) {
      detectedType = 'timestamp';
    }

    return {
      name: colName,
      detectedType,
      sampleValues: uniqueVals.slice(0, 5),
      distinctCount: uniqueVals.length,
      missingCount: rawValues.length - nonMissing.length,
      min,
      max,
    };
  });

  const columnTypes: Record<string, DetectedColumnType> = {};
  for (const sum of columnSummaries) {
    columnTypes[sum.name] = sum.detectedType;
  }

  const sampleRows: Record<string, string>[] = data.slice(0, 10).map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = row[i] ?? '';
    });
    return obj;
  });

  return {
    columns: headers,
    columnTypes,
    rowCount: data.length,
    sampleRows,
    columnSummaries,
  };
}

/**
 * Parses JSONL content into 2D tabular array
 */
function parseJsonl(content: string, maxRows = EVALUATION_LIMITS.rows): string[][] {
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) throw new Error('JSONL file is empty.');

  const parsedObjects: Record<string, unknown>[] = [];
  for (let i = 0; i < Math.min(lines.length, maxRows); i++) {
    try {
      const obj = JSON.parse(lines[i]);
      if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
        parsedObjects.push(obj as Record<string, unknown>);
      }
    } catch {
      throw new Error(`Invalid JSON object at line ${i + 1}`);
    }
  }

  if (parsedObjects.length === 0) throw new Error('No valid JSON objects found in JSONL content.');

  // Collect distinct keys
  const keySet = new Set<string>();
  parsedObjects.forEach((o) => Object.keys(o).forEach((k) => keySet.add(k)));
  const headers = Array.from(keySet);

  const rows: string[][] = [headers];
  for (const obj of parsedObjects) {
    rows.push(headers.map((h) => (obj[h] !== undefined && obj[h] !== null ? String(obj[h]) : '')));
  }

  return rows;
}

/**
 * Parses JSON tabular content into 2D array
 */
function parseJsonTable(content: string, maxRows = EVALUATION_LIMITS.rows): string[][] {
  const parsed = JSON.parse(content);
  if (!Array.isArray(parsed)) {
    throw new Error('Expected JSON array of objects for tabular data.');
  }
  if (parsed.length === 0) throw new Error('JSON array is empty.');

  const slice = parsed.slice(0, maxRows);
  const keySet = new Set<string>();
  slice.forEach((item) => {
    if (typeof item === 'object' && item !== null) {
      Object.keys(item).forEach((k) => keySet.add(k));
    }
  });

  const headers = Array.from(keySet);
  if (headers.length === 0) throw new Error('JSON table objects contain no properties.');

  const rows: string[][] = [headers];
  for (const item of slice) {
    if (typeof item === 'object' && item !== null) {
      rows.push(headers.map((h) => (item[h] !== undefined && item[h] !== null ? String(item[h]) : '')));
    }
  }

  return rows;
}

export interface IngestArtifactInput {
  name: string;
  content: string;
  roleOverride?: ArtifactRole;
  formatOverride?: ArtifactFormat;
}

/**
 * Safely ingests a single artifact into normalized InvestigationArtifact
 */
export function ingestArtifact(input: IngestArtifactInput): InvestigationArtifact {
  const { name, content } = input;
  const format = input.formatOverride ?? detectArtifactFormat(name, content);
  const role = input.roleOverride ?? inferArtifactRole(name, content, format);

  const byteLength = new TextEncoder().encode(content).byteLength;
  const issues: string[] = [];

  if (byteLength > EVALUATION_LIMITS.bytes) {
    issues.push(`Artifact size ${(byteLength / (1024 * 1024)).toFixed(1)} MB exceeds maximum limit of ${(EVALUATION_LIMITS.bytes / (1024 * 1024)).toFixed(0)} MB.`);
  }

  const artifact: InvestigationArtifact = {
    id: createId('artifact'),
    name,
    role,
    format,
    sizeBytes: byteLength,
    contentDigest: null,
    validationStatus: 'valid',
    validationIssues: issues,
    rawContent: content,
  };

  try {
    if (role === 'training_log') {
      const trainingLog = parseTrainingLog(content);
      artifact.trainingLog = trainingLog;
      if (trainingLog.warnings.length > 0) {
        artifact.validationStatus = 'warning';
        artifact.validationIssues.push(...trainingLog.warnings);
      }
    } else if (role === 'model_metadata') {
      const modelMeta = parseModelMetadata(content);
      artifact.modelMetadata = modelMeta;
    } else {
      // Tabular artifact (CSV, TSV, JSON table, JSONL)
      let records: string[][];
      if (format === 'tsv') {
        records = parseCsv(content, EVALUATION_LIMITS.cells, '\t');
      } else if (format === 'jsonl') {
        records = parseJsonl(content, EVALUATION_LIMITS.rows);
      } else if (format === 'json') {
        records = parseJsonTable(content, EVALUATION_LIMITS.rows);
      } else {
        records = parseCsv(content, EVALUATION_LIMITS.cells);
      }

      const schema = extractTabularSchema(records);
      artifact.schema = schema;

      if (schema.rowCount === 0) {
        issues.push('Dataset contains 0 data rows.');
        artifact.validationStatus = 'invalid';
      }
    }
  } catch (err) {
    artifact.validationStatus = 'invalid';
    artifact.validationIssues.push(err instanceof Error ? err.message : 'Failed to parse artifact');
  }

  if (artifact.validationIssues.length > 0 && artifact.validationStatus !== 'invalid') {
    artifact.validationStatus = 'warning';
  }

  return artifact;
}

/**
 * Ingests multiple artifacts simultaneously, validates schemas and relationships
 */
export function ingestMultipleArtifacts(inputs: IngestArtifactInput[]): {
  artifacts: InvestigationArtifact[];
  validation: MultiArtifactValidationResult;
} {
  const artifacts = inputs.map((input) => ingestArtifact(input));
  const validation = validateArtifactRelationships(artifacts);
  return { artifacts, validation };
}
